// src/scrapers/seylan.ts
import { chromium, Page, Locator } from "playwright";
import { RateRow } from "../types";
import { acceptAnyCookie } from "../utils/dom";
import { clean, fanOutByYears } from "../utils/text";

const URL = "https://www.seylan.lk/interest-rates";

/* ───────────────────────── small helpers ───────────────────────── */

function parseTenureYears(label: string): number[] {
  const s = (label || "").toLowerCase().replace(/\s+/g, " ").trim();
  const single = s.match(/(\d{1,2})\s*(?:year|yr)s?/);
  if (single) return [parseInt(single[1], 10)];
  const range = s.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (range) {
    let a = parseInt(range[1], 10), b = parseInt(range[2], 10);
    if (a > b) [a, b] = [b, a];
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return [];
}

function pct(s: string): string | undefined {
  const t = clean(s);
  if (!t || t === "-" || t === "–") return undefined;
  const m = t.match(/\d+(?:\.\d+)?/);
  if (!m) return undefined;
  return `${Number(m[0]).toFixed(2)}%`;
}

async function clickMenuItemById(page: Page, id: string) {
  const link = page.locator(`li#${id} a`);
  await link.scrollIntoViewIfNeeded().catch(() => {});
  await link.click({ timeout: 10000, force: true });
  await page.waitForTimeout(250);
}

async function scrollTableIntoView(table: Locator) {
  try { await table.scrollIntoViewIfNeeded(); } catch {}
}
async function scrollToTop(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }));
}

/** Return all visible tables that have a Tenure/Period header */
async function visibleTenureTables(page: Page): Promise<Locator[]> {
  const all = await page.locator("table").all();
  const res: Locator[] = [];
  for (const t of all) {
    try {
      const headers = (await t.locator("thead tr th").allTextContents()).map((s) => clean(s).toLowerCase());
      if (headers.some((h) => /tenure|period/.test(h))) {
        await t.waitFor({ state: "visible", timeout: 1500 });
        res.push(t);
      }
    } catch {}
  }
  return res;
}

/* ───────── HL/LAP/PL mappers (unchanged behavior) ───────── */

async function pickHLTdIndicesFromSecondRow(table: Locator) {
  const headerRows = await table.locator("thead tr").all();
  if (headerRows.length >= 2) {
    const lastRow = headerRows[headerRows.length - 1];
    const labels = (await lastRow.locator("th").allTextContents()).map(clean);
    const subCount = labels.filter((t) => !/tenure|period/i.test(t)).length;
    if (subCount >= 6) {
      return {
        ok: true,
        td_s700_with: 1,
        td_s700_without: 2,
        td_low_with: 3,
        td_low_without: 4,
        td_others_with: 5,
        td_others_without: 6,
      } as const;
    }
  }
  return { ok: false } as const;
}

function pickHLTdIndicesByRegex(headerTexts: string[]) {
  const lc = headerTexts.map((h) => h.toLowerCase());
  const tenureIdx = lc.findIndex((h) => /tenure|period/.test(h));

  const withCard = (s: string) => /with.*credit.*internet/.test(s);
  const withoutCard = (s: string) => /without.*credit.*internet/.test(s);
  const is700k = (s: string) => /salary/.test(s) && (/700/.test(s) || /700,?000/.test(s));
  const is150to699 = (s: string) =>
    /salary/.test(s) && (/150/.test(s) || /699/.test(s) || /150,?000/.test(s) || /699,?999/.test(s));
  const isOthers = (s: string) => /others/.test(s);

  let s700_withIdx: number | null = null;
  let s700_withoutIdx: number | null = null;
  let sLow_withIdx: number | null = null;
  let sLow_withoutIdx: number | null = null;
  let others_withIdx: number | null = null;
  let others_withoutIdx: number | null = null;

  for (let i = 0; i < lc.length; i++) {
    const h = lc[i];
    if (is700k(h) && withCard(h) && s700_withIdx === null) s700_withIdx = i;
    if (is700k(h) && withoutCard(h) && s700_withoutIdx === null) s700_withoutIdx = i;
    if (is150to699(h) && withCard(h) && sLow_withIdx === null) sLow_withIdx = i;
    if (is150to699(h) && withoutCard(h) && sLow_withoutIdx === null) sLow_withoutIdx = i;
    if (isOthers(h) && withCard(h) && others_withIdx === null) others_withIdx = i;
    if (isOthers(h) && withoutCard(h) && others_withoutIdx === null) others_withoutIdx = i;
  }

  const base = tenureIdx >= 0 ? tenureIdx : 0;
  const toTd = (idx: number | null) => (idx == null ? null : Math.max(0, idx - base));

  return {
    td_s700_with: toTd(s700_withIdx) ?? 1,
    td_s700_without: toTd(s700_withoutIdx) ?? 2,
    td_low_with: toTd(sLow_withIdx) ?? 3,
    td_low_without: toTd(sLow_withoutIdx) ?? 4,
    td_others_with: toTd(others_withIdx) ?? 5,
    td_others_without: toTd(others_withoutIdx) ?? 6,
  };
}

async function pickPLTdIndicesFromSecondRow(table: Locator) {
  const headerRows = await table.locator("thead tr").all();
  if (headerRows.length >= 2) {
    const lastRow = headerRows[headerRows.length - 1];
    const texts = (await lastRow.locator("th").allTextContents()).map((t) => clean(t).toLowerCase());
    const subCount = texts.filter((t) => !/tenure|period/.test(t)).length;
    if (
      subCount >= 6 &&
      texts.some((t) => /with.*credit.*internet/.test(t)) &&
      texts.some((t) => /without.*credit.*internet/.test(t))
    ) {
      return {
        ok: true,
        td_t1_with: 1,
        td_t1_without: 2,
        td_t2_with: 3,
        td_t2_without: 4,
        td_t3_with: 5,
        td_t3_without: 6,
      } as const;
    }
  }
  return { ok: false } as const;
}

function pickPLTdIndicesByRegex(_headerTexts: string[]) {
  return {
    td_t1_with: 1,
    td_t1_without: 2,
    td_t2_with: 3,
    td_t2_without: 4,
    td_t3_with: 5,
    td_t3_without: 6,
  };
}

/* ───────── Scholar (Education) — for both tables, no special cases ───────── */

async function processScholarTableLikeSnippet(
  table: Locator,
  rows: RateRow[],
  nowISO: string,
  typeLabel: "Fixed" | "Fixed & Floating",
  noteText: string
) {
  await scrollTableIntoView(table);

  // Headers typically show:
  //   Secured (CAT A) | Unsecured (CAT B)
  //   With CC & IB | Without CC & IB ... (same for Unsecured)
  const headersLC = (await table.locator("thead tr th").allTextContents()).map((s) => clean(s).toLowerCase());
  const tenureIdx = headersLC.findIndex((h) => /tenure|period/.test(h));

  // Try to pinpoint subcolumn indices by scanning header rows
  const hdrRows = await table.locator("thead tr").all();
  let idxSecWith: number | null = null;
  let idxSecWithout: number | null = null;
  let idxUnsecWith: number | null = null;
  let idxUnsecWithout: number | null = null;

  const norm = (txt: string) => clean(txt).toLowerCase();
  for (const r of hdrRows) {
    const ths = (await r.locator("th").allTextContents()).map(norm);
    for (let i = 0; i < ths.length; i++) {
      const h = ths[i];
      if (/secured/.test(h) && /with.*credit.*internet/.test(h) && idxSecWith === null) idxSecWith = i;
      if (/secured/.test(h) && /without.*credit.*internet/.test(h) && idxSecWithout === null) idxSecWithout = i;
      if (/unsecured/.test(h) && /with.*credit.*internet/.test(h) && idxUnsecWith === null) idxUnsecWith = i;
      if (/unsecured/.test(h) && /without.*credit.*internet/.test(h) && idxUnsecWithout === null) idxUnsecWithout = i;
    }
  }

  // Fallback if "secured/unsecured" appear only on a higher header row
  if (idxSecWith === null || idxSecWithout === null || idxUnsecWith === null || idxUnsecWithout === null) {
    const last = hdrRows[hdrRows.length - 1];
    const subTh = (await last.locator("th").allTextContents()).map(norm);
    // Usually last row is just: With | Without | With | Without
    if (subTh.filter((h) => /with.*credit.*internet/.test(h)).length >= 2) {
      const base = tenureIdx >= 0 ? tenureIdx : 0;
      idxSecWith = base + 1;
      idxSecWithout = base + 2;
      idxUnsecWith = base + 3;
      idxUnsecWithout = base + 4;
    }
  }

  const toTd = (i: number | null) => Math.max(1, (i ?? 1) - (tenureIdx >= 0 ? tenureIdx : 0));

  const bodyRows = await table.locator("tbody tr").all();
  for (const tr of bodyRows) {
    const tds = (await tr.locator("td").allTextContents()).map(clean);
    if (tds.length < 2) continue;

    const tenureCell = tds[0] || "";
    const years = parseTenureYears(tenureCell);
    if (!years.length) continue;

    const rateSecWith       = pct(tds[toTd(idxSecWith)]       || "");
    const rateSecWithout    = pct(tds[toTd(idxSecWithout)]    || "");
    const rateUnsecWith     = pct(tds[toTd(idxUnsecWith)]     || "");
    const rateUnsecWithout  = pct(tds[toTd(idxUnsecWithout)]  || "");

    // Set default rate to lowest tier (secured with credit card & internet banking)
    const defaultRate = rateSecWith ? Number(rateSecWith.replace('%', '')) : undefined;

    rows.push(
      ...fanOutByYears<RateRow>({
        bank: "Seylan",
        product: "Education Loan",
        type: typeLabel,
        tenureLabel: tenureCell,
        rate: defaultRate, // Add default rate for filtering
        // Education fields
        rateEduSecuredWithCreditCardInternetBanking: rateSecWith,
        rateEduSecuredWithoutCreditCardInternetBanking: rateSecWithout,
        rateEduUnsecuredWithCreditCardInternetBanking: rateUnsecWith,
        rateEduUnsecuredWithoutCreditCardInternetBanking: rateUnsecWithout,
        source: URL,
        updatedAt: nowISO,
        notes: noteText,
      }, years)
    );
  }
}

/* ───────────────────────── main ───────────────────────── */
export async function scrapeSeylan(opts?: { show?: boolean; slow?: number }): Promise<RateRow[]> {
  const browser = await chromium.launch({
    headless: !opts?.show,
    slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  const rows: RateRow[] = [];
  const now = new Date().toISOString();

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptAnyCookie(page);

    // Open Loans & Advances
    await page.locator('text=Loans & Advances Rates').first().click({ timeout: 20000 }).catch(async () => {
      await page.locator('xpath=//a[contains(.,"Loans & Advances Rates")]').first().click({ timeout: 20000, force: true });
    });
    await page.waitForSelector("text=Loans and Advances", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(250);

    /* ───────── Home Loan ───────── */
    await clickMenuItemById(page, "housingloan");
    {
      const tables = await visibleTenureTables(page);
      if (tables[0]) {
        const t = tables[0];
        await scrollTableIntoView(t);

        const via2 = await pickHLTdIndicesFromSecondRow(t);
        const map = via2.ok
          ? via2
          : pickHLTdIndicesByRegex((await t.locator("thead tr th").allTextContents()).map(clean));

        const bodyRows = await t.locator("tbody tr").all();
        for (const tr of bodyRows) {
          const tds = (await tr.locator("td").allTextContents()).map(clean);
          if (tds.length < 2) continue;

          const tenureCell = tds[0] || "";
          const years = parseTenureYears(tenureCell);
          if (!years.length) continue;

          const r700_with    = pct(tds[map.td_s700_with]       || "");
          const r700_without = pct(tds[map.td_s700_without]    || "");
          const rLow_with    = pct(tds[map.td_low_with]        || "");
          const rLow_without = pct(tds[map.td_low_without]     || "");
          const rOth_with    = pct(tds[map.td_others_with]     || "");
          const rOth_without = pct(tds[map.td_others_without]  || "");

          rows.push(
            ...fanOutByYears<RateRow>({
              bank: "Seylan",
              product: "Home Loan",
              type: "Fixed",
              tenureLabel: tenureCell,
              rateWithSalaryAbove700kCreditCardInternetBanking: r700_with,
              rateWithSalaryAbove700k: r700_without,
              rateWithSalaryBelow700kCreditCardInternetBanking: rLow_with,
              rateWithSalaryBelow700k: rLow_without,
              rateWithoutSalaryWithCreditCardInternetBanking: rOth_with,
              rateWithoutSalary: rOth_without,
              source: URL,
              updatedAt: now,
              notes: "After fixed period, remaining at initial rate + 1.00%",
            }, years)
          );
        }
        await scrollToTop(page);
      }
    }

    /* ───────── LAP ───────── */
    await clickMenuItemById(page, "loanagainstproperty");
    {
      const tables = await visibleTenureTables(page);
      if (tables[0]) {
        const t = tables[0];
        await scrollTableIntoView(t);

        const via2 = await pickHLTdIndicesFromSecondRow(t);
        const map = via2.ok
          ? via2
          : pickHLTdIndicesByRegex((await t.locator("thead tr th").allTextContents()).map(clean));

        const bodyRows = await t.locator("tbody tr").all();
        for (const tr of bodyRows) {
          const tds = (await tr.locator("td").allTextContents()).map(clean);
          if (tds.length < 2) continue;

          const tenureCell = tds[0] || "";
          const years = parseTenureYears(tenureCell);
          if (!years.length) continue;

          const r700_with    = pct(tds[map.td_s700_with]       || "");
          const r700_without = pct(tds[map.td_s700_without]    || "");
          const rLow_with    = pct(tds[map.td_low_with]        || "");
          const rLow_without = pct(tds[map.td_low_without]     || "");
          const rOth_with    = pct(tds[map.td_others_with]     || "");
          const rOth_without = pct(tds[map.td_others_without]  || "");

          rows.push(
            ...fanOutByYears<RateRow>({
              bank: "Seylan",
              product: "LAP",
              type: "Fixed",
              tenureLabel: tenureCell,
              rateWithSalaryAbove700kCreditCardInternetBanking: r700_with,
              rateWithSalaryAbove700k: r700_without,
              rateWithSalaryBelow700kCreditCardInternetBanking: rLow_with,
              rateWithSalaryBelow700k: rLow_without,
              rateWithoutSalaryWithCreditCardInternetBanking: rOth_with,
              rateWithoutSalary: rOth_without,
              source: URL,
              updatedAt: now,
              notes: "After fixed period, remaining at initial rate + 1.00%",
            }, years)
          );
        }
        await scrollToTop(page);
      }
    }

    /* ───────── Personal Loan ───────── */
    await clickMenuItemById(page, "personalloan");
    {
      const tables = await visibleTenureTables(page);
      if (tables[0]) {
        const t = tables[0];
        await scrollTableIntoView(t);

        const via2 = await pickPLTdIndicesFromSecondRow(t);
        const mp = via2.ok
          ? via2
          : pickPLTdIndicesByRegex((await t.locator("thead tr th").allTextContents()).map(clean));

        const tierNotes =
          "Tier 1 = Professionals & Premium Companies with Salary ≥ 300,000/-. " +
          "Tier 2 = Professionals & Premium Companies with Salary 200,000/- to 299,999/-. " +
          "Tier 3 = CAT A & B Companies with Salary ≥ 200,000/-.";

        const bodyRows = await t.locator("tbody tr").all();
        for (const tr of bodyRows) {
          const tds = (await tr.locator("td").allTextContents()).map(clean);
          if (tds.length < 2) continue;

          const tenureCell = tds[0] || "";
          const years = parseTenureYears(tenureCell);
          if (!years.length) continue;

          const t1w  = pct(tds[mp.td_t1_with]     || "");
          const t1wo = pct(tds[mp.td_t1_without]  || "");
          const t2w  = pct(tds[mp.td_t2_with]     || "");
          const t2wo = pct(tds[mp.td_t2_without]  || "");
          const t3w  = pct(tds[mp.td_t3_with]     || "");
          const t3wo = pct(tds[mp.td_t3_without]  || "");

          // Set default rate to lowest tier (tier1 with credit card & internet banking)
          const defaultRate = t1w ? Number(t1w.replace('%', '')) : undefined;

          rows.push(
            ...fanOutByYears<RateRow>({
              bank: "Seylan",
              product: "Personal Loan",
              type: "Fixed",
              tenureLabel: tenureCell,
              rate: defaultRate, // Add default rate for filtering
              ratePLTier1WithCreditCardInternetBanking: t1w,
              ratePLTier1WithoutCreditCardInternetBanking: t1wo,
              ratePLTier2WithCreditCardInternetBanking: t2w,
              ratePLTier2WithoutCreditCardInternetBanking: t2wo,
              ratePLTier3WithCreditCardInternetBanking: t3w,
              ratePLTier3WithoutCreditCardInternetBanking: t3wo,
              source: URL,
              updatedAt: now,
              notes: tierNotes,
            }, years)
          );
        }
        await scrollToTop(page);
      }
    }

    /* ───────────── Education (Seylan Scholar Loans) ───────────── */
    await clickMenuItemById(page, "seylanscholarloans");
    {
      const tables = await visibleTenureTables(page);

      // Table 1 → Fixed
      if (tables[0]) {
        await processScholarTableLikeSnippet(
          tables[0],
          rows,
          now,
          "Fixed",
          "Secured (CAT A) and Unsecured (CAT B) — With/Without Credit Card & Internet Banking."
        );
      }

      // Table 2 → Fixed & Floating
      if (tables.length > 1 && tables[1]) {
        await processScholarTableLikeSnippet(
          tables[1],
          rows,
          now,
          "Fixed & Floating",
          "Fixed for 01 year & reviewed every 12 months."
        );
      }

      await scrollToTop(page);
    }

  } finally {
    await browser.close();
  }

  return rows;
}
