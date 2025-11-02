// src/scrapers/combank.ts
import { chromium, Locator, Page } from "playwright";
import { RateRow } from "../types";
import { acceptAnyCookie } from "../utils/dom";
import {
  clean,
  decideType,
  expandTenureYears,
  fanOutByYears,
  normalizeAwpr,
} from "../utils/text";

const URL = "https://www.combank.lk/rates-tariff#lending-rates";

/* ───────────────────────── helpers ───────────────────────── */

function asRate(cell: string): string | undefined {
  const t = clean(cell);
  if (!t || t === "-" || t === "–") return undefined;
  if (/(awpr|awplr)/i.test(t)) return normalizeAwpr(t);
  const m = t.match(/[0-9]+(?:\.[0-9]+)?/);
  return m ? `${Number(m[0]).toFixed(2)}%` : undefined;
}

async function clickTopTabLendingRates(page: Page) {
  const tab = page.locator('a[href="#lending-rates"]').first();
  await tab.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await tab.click({ timeout: 10000, force: true });
  } catch {}
  await page.locator("#lending-rates").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function openExpandBlock(page: Page, title: string): Promise<Locator> {
  const link = page
    .locator("#lending-rates")
    .locator("a.expand-link", { hasText: new RegExp(`^${title}\\b`, "i") })
    .first();

  await link.scrollIntoViewIfNeeded().catch(() => {});
  const isActive = await link.evaluate((el) => el.classList.contains("active")).catch(() => false);
  if (!isActive) {
    await link.click({ timeout: 10000, force: true });
  }

  const block = link.locator('xpath=following-sibling::div[contains(@class,"hidden-block")]').first();
  await block.waitFor({ state: "visible", timeout: 10000 });
  await block.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(250);
  return block;
}

/** Get tenure column labels aligned with data cells (fixes header↔rate shift). */
async function getAlignedTenureLabels(table: Locator): Promise<string[]> {
  const firstBodyRow = table.locator("tbody tr").first();
  await firstBodyRow.waitFor({ state: "visible", timeout: 10000 });
  const tdCount = await firstBodyRow.locator("td").count(); // includes left row-label
  const dataCols = Math.max(0, tdCount - 1);

  const headerRows = await table.locator("thead tr").all();
  let bestThs: string[] = [];
  for (const tr of headerRows) {
    const ths = (await tr.locator("th").allTextContents()).map((t) => clean(t)).filter(Boolean);
    if (ths.length > bestThs.length) bestThs = ths;
  }

  let labels = bestThs.slice();
  if (labels.length === dataCols + 1) {
    labels = labels.slice(1);
  } else if (labels.length !== dataCols) {
    if (labels.length > 0 && /^(fixed|description)/i.test(labels[0])) {
      labels = labels.slice(1);
    }
  }

  if (labels.length > dataCols) labels = labels.slice(0, dataCols);
  if (labels.length < dataCols) {
    const extra: string[] = [];
    while (labels.length + extra.length < dataCols) extra.push(`Col ${labels.length + extra.length + 1}`);
    labels = labels.concat(extra);
  }

  return labels;
}

/** Read a grid like Home/Personal Loans */
async function scrapeGridTable(block: Locator, product: string, nowISO: string): Promise<RateRow[]> {
  const out: RateRow[] = [];

  const table = block.locator("table").first();
  await table.waitFor({ state: "visible", timeout: 10000 });

  const colLabels = await getAlignedTenureLabels(table);
  const bodyRows = await table.locator("tbody tr").all();

  for (const tr of bodyRows) {
    const tds = (await tr.locator("td").allTextContents()).map(clean);
    if (!tds.length) continue;

    const rowLabel = tds[0] || ""; // "Standard", "Premium", etc.

    for (let j = 0; j < colLabels.length; j++) {
      const tenureLabel = colLabels[j];
      const cell = tds[j + 1] ?? "";
      const rate = asRate(cell);
      if (!rate) continue;

      const type = decideType(rate, undefined, `${tenureLabel} ${rowLabel}`);

      let years = expandTenureYears(tenureLabel);
      if (!years.length) {
        const m = tenureLabel.match(/\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:year|yr)s?\b/i);
        if (m) {
          const a = parseInt(m[1], 10);
          const b = m[2] ? parseInt(m[2], 10) : a;
          years = Array.from({ length: b - a + 1 }, (_, k) => a + k);
        }
      }

      out.push(
        ...fanOutByYears<RateRow>(
          {
            bank: "Commercial Bank",
            product,
            type,
            tenureLabel,
            rateWithSalary: rate,
            rateWithoutSalary: undefined,
            source: URL,
            updatedAt: nowISO,
            notes: rowLabel || undefined,
          },
          years
        )
      );
    }
  }

  return out;
}

function yearsLabel(y: number): string {
  return y === 1 ? "1 Year" : `${y} Years`;
}

/** Add floating rows for every single year 1..N based on Home Loans footnote. */
async function addHomeLoanFloatingFootnoteRowsForEachYear(
  block: Locator,
  nowISO: string
): Promise<RateRow[]> {
  const out: RateRow[] = [];

  // Look for text like: "Floating Rate : AWPLR + 3.00% upto 15 Years"
  const note = block.locator('text=/Floating\\s*Rate\\s*:/i').first();
  if (await note.count() === 0) return out;

  const txt = clean(await note.innerText());
  const mMargin = txt.match(/awp(?:lr)?\s*\+?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const mUpto = txt.match(/up\s*to\s*(\d{1,2})\s*year/i);
  if (!mMargin) return out;

  const rate = `AWPR + ${Number(mMargin[1])}%`;
  const upto = Math.min(mUpto ? parseInt(mUpto[1], 10) : 15, 40); // sanity cap

  for (let y = 1; y <= upto; y++) {
    const label = yearsLabel(y);
    out.push(
      ...fanOutByYears<RateRow>(
        {
          bank: "Commercial Bank",
          product: "Home Loan",
          type: "Floating",
          tenureLabel: label,
          rateWithSalary: rate,
          rateWithoutSalary: undefined,
          source: URL,
          updatedAt: nowISO,
          notes: "Floating (footnote)",
        },
        [y]
      )
    );
  }

  return out;
}

/** Education Loans inside "All Other Advances" (robust parser across all tables and TD/TH headings) */
async function scrapeEducationFromAllOtherAdvances(block: Locator, nowISO: string): Promise<RateRow[]> {
  const out: RateRow[] = [];

  // Ensure we've scrolled through the block (no lazy content missed)
  try {
    await block.evaluate((el) => el.scrollIntoView({ behavior: "auto", block: "start" }));
    await block.page().waitForTimeout(150);
    await block.evaluate((el) => el.scrollIntoView({ behavior: "auto", block: "end" }));
    await block.page().waitForTimeout(150);
  } catch {}

  const tables = await block.locator("table").all();
  for (const table of tables) {
    // Some sections repeat headers; scan all rows (th + td) instead of only tbody/td
    const trs = await table.locator("tr").all();

    let inEducation = false;
    let subGroup: "With Personal Guarantors" | "With Property Mortgages" | null = null;

    for (const tr of trs) {
      const cellsRaw = await tr.locator("th,td").allTextContents();
      const cells = cellsRaw.map(clean).filter((s) => s.length > 0);
      if (!cells.length) continue;

      const rowText = cells.join(" ").toLowerCase();

      // 1) Section headings as single-cell rows (or multiple with blank 2nd col which we filtered)
      if (cells.length === 1) {
        if (/education loans?/.test(rowText)) {
          inEducation = true;
          subGroup = null;
          continue;
        }
        if (inEducation && /with\s+personal\s+guarantors/i.test(rowText)) {
          subGroup = "With Personal Guarantors";
          continue;
        }
        if (inEducation && /with\s+property\s+mortgages/i.test(rowText)) {
          subGroup = "With Property Mortgages";
          continue;
        }
        // If we are inside education and another unrelated heading shows up → close section
        if (inEducation && !/education|guarantors|mortgages/.test(rowText)) {
          inEducation = false;
          subGroup = null;
        }
        continue;
      }

      // 2) Data rows: first cell is description/tenure, last cell is rate
      if (!inEducation || !subGroup) continue;

      const desc = cells[0] || "";
      const rateCell = cells[cells.length - 1] || "";
      const rate = asRate(rateCell);
      if (!rate) continue;

      // Tenure parsing
      let tenureLabel = desc.replace(/^\s*-\s*/, "");
      let years = expandTenureYears(tenureLabel);

      // handle "Up to 3 Years" / "upto 3 Years"
      if (!years.length) {
        const mUp = tenureLabel.match(/up\s*to\s*(\d{1,2})\s*(?:year|yr)s?/i);
        if (mUp) {
          const N = parseInt(mUp[1], 10);
          years = Array.from({ length: N }, (_, i) => i + 1);
        }
      }

      // fallback: simple single number
      if (!years.length) {
        const m = tenureLabel.match(/\b(\d{1,2})\s*(?:year|yr)s?\b/i);
        if (m) years = [parseInt(m[1], 10)];
      }

      if (!years.length) continue;

      out.push(
        ...fanOutByYears<RateRow>(
          {
            bank: "Commercial Bank",
            product: "Education Loan",
            type: "Fixed",
            tenureLabel,
            rateWithSalary: rate,
            rateWithoutSalary: undefined,
            source: URL,
            updatedAt: nowISO,
            notes: subGroup,
          },
          years
        )
      );
    }
  }

  return out;
}

/* ───────────────────────── main ───────────────────────── */

export async function scrapeCombank(
  opts?: { show?: boolean; slow?: number }
): Promise<RateRow[]> {
  const browser = await chromium.launch({
    headless: !opts?.show,
    slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  const rows: RateRow[] = [];
  const now = new Date().toISOString();

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptAnyCookie(page);

    // 1) Lending Rates tab
    await clickTopTabLendingRates(page);

    // 2) HOME LOANS
    {
      const block = await openExpandBlock(page, "Home Loans");
      rows.push(...(await scrapeGridTable(block, "Home Loan", now)));             // fixed grid rows
      rows.push(...(await addHomeLoanFloatingFootnoteRowsForEachYear(block, now))); // floating footnote rows 1..15
    }

    // 3) PERSONAL LOANS
    {
      const block = await openExpandBlock(page, "Personal Loans");
      rows.push(...(await scrapeGridTable(block, "Personal Loan", now)));
    }

    // 4) ALL OTHER ADVANCES → Education Loans (two sub-groups)
    {
      const block = await openExpandBlock(page, "All Other Advances");
      rows.push(...(await scrapeEducationFromAllOtherAdvances(block, now)));
    }
  } finally {
    await browser.close();
  }

  return rows;
}
