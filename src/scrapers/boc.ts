// src/scrapers/boc.ts
import { chromium, Browser, Page, ElementHandle } from "playwright";
import type { RateRow } from "../types";

const SRC = "https://www.boc.lk/rates-tariff#advance-rates";
const BANK = "Bank of Ceylon";

type Opts = { show?: string; slow?: string; save?: string };

const nowISO = () => new Date().toISOString();

function pct(s: string): string | undefined {
  const m = s.replace(/\s+/g, " ").match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return m ? `${m[1]}%` : undefined;
}
function normTenure(label: string) {
  return label
    .replace(/\bupto\b/gi, "Up to")
    .replace(/\byears?\b/gi, (m) => m[0].toUpperCase() + m.slice(1))
    .replace(/\s*:\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse a tenure label into an inclusive year range [from, to]. */
function parseTenureRange(label: string, maxYearsFallback: number): { from: number; to: number } | null {
  const t = (label || "").replace(/\s+/g, " ").toLowerCase();

  // 1) Above A years and up to B years → (A+1)..B
  let m = t.match(/above\s*(\d+)\s*years?.*?up to\s*(\d+)\s*years?/i);
  if (m) return { from: Number(m[1]) + 1, to: Number(m[2]) };

  // 2) Above A years to B years → (A+1)..B
  m = t.match(/above\s*(\d+)\s*years?\s*to\s*(\d+)\s*years?/i);
  if (m) return { from: Number(m[1]) + 1, to: Number(m[2]) };

  // 3) A years to B years → (A+1)..B (exclusive lower bound)
  m = t.match(/(\d+)\s*years?\s*to\s*(\d+)\s*years?/i);
  if (m) return { from: Number(m[1]) + 1, to: Number(m[2]) };

  // 4) Up to N years → 1..N
  m = t.match(/up to\s*(\d+)\s*years?/i);
  if (m) return { from: 1, to: Number(m[1]) };

  // 5) Above A years → (A+1)..max
  m = t.match(/above\s*(\d+)\s*years?/i);
  if (m) return { from: Number(m[1]) + 1, to: maxYearsFallback };

  // 6) Single number like "10 Years" → 10..10
  m = t.match(/(\d+)\s*years?/i);
  if (m) return { from: Number(m[1]), to: Number(m[1]) };

  return null;
}

/** Push 1 row per year with tenureYears fan-out while preserving the original label. */
function fanOutPush(
  acc: RateRow[],
  base: Omit<RateRow, "tenureYears">,
  label: string,
  maxYearsFallback: number
) {
  const range = parseTenureRange(label, maxYearsFallback);
  if (!range) {
    acc.push({ ...base } as RateRow);
    return;
  }
  for (let y = range.from; y <= range.to; y++) {
    acc.push({ ...base, tenureYears: y } as RateRow);
  }
}

async function nukeCookies(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem("cookiePopupHidden", "true"); } catch {}
  });
  await page.evaluate(() => {
    try { localStorage.setItem("cookiePopupHidden", "true"); } catch {}
    document.querySelectorAll(".cookies-popup").forEach((el) => el.remove());
  });
}

/** Ensure this section is expanded and its table exists (scoped to wrapper). */
async function ensureExpandedAndWaitTable(
  wrapper: ElementHandle<Element>,
  page: Page
) {
  await wrapper.scrollIntoViewIfNeeded();

  const anyTable = await wrapper.$(".extra-content table, .extra-content figure.table table");
  if (!anyTable) {
    const rm = await wrapper.$("a.show-read-more.cta.black");
    if (rm) await rm.click();
  }

  await page.waitForFunction(
    (el) => !!el.querySelector(".extra-content table, .extra-content figure.table table"),
    wrapper,
    { timeout: 15000 }
  );
  await page.waitForTimeout(120);
}

async function getTBody(wrapper: ElementHandle<Element>) {
  return await wrapper.$(".extra-content table tbody, .extra-content figure.table table tbody");
}

export async function scrapeBOC(opts: Opts = {}): Promise<RateRow[]> {
  const show = String(opts.show || "false") === "true";
  const slow = Number(opts.slow || 0) || 0;

  let browser: Browser | undefined;
  const out: RateRow[] = [];
  const updatedAt = nowISO();

  try {
    browser = await chromium.launch({ headless: !show, slowMo: slow });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

    await nukeCookies(page);
    // Try domcontentloaded first, fallback to load with longer timeout
    try {
      await page.goto(SRC, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      await page.goto(SRC, { waitUntil: "load", timeout: 90000 });
    }
    // Ensure Advance Rates tab is selected/active
    const tabBtn = await page.$('a[href="#advance-rates"]');
    if (tabBtn) await tabBtn.click();
    await page.waitForTimeout(300); // give the tab time to activate
    await page.waitForSelector("#advance-rates", { timeout: 15000 });
    await nukeCookies(page);

    const pane = await page.$("#advance-rates");
    if (!pane) throw new Error("advance-rates pane not found");

    const headers = await pane.$$("h3.sub-title");
    for (const h3 of headers) {
      const productTitle = (await h3.textContent())?.trim() || "";
      const wrapper = await h3.evaluateHandle((el) => {
        let n = el.nextElementSibling;
        if (n && n.tagName === "H4") n = n.nextElementSibling as Element | null;
        return n as Element | null;
      });
      if (!wrapper) continue;

      await ensureExpandedAndWaitTable(wrapper, page);
      const title = productTitle.toLowerCase();

      /* -------------------------- PERSONAL LOANS -------------------------- */
      if (title.includes("personal")) {
        const tbody = await getTBody(wrapper);
        if (!tbody) continue;

        const rows = await tbody.evaluate((tb) =>
          Array.from(tb.querySelectorAll("tr")).map((tr) => {
            const tds = Array.from(tr.querySelectorAll("td"));
            const leftHTML = tds[0]?.innerHTML || "";
            const rightHTML = tds[1]?.innerHTML || "";

            const scheme =
              leftHTML
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .pop() || "BOC Personal Loan Scheme";

            const lines = rightHTML
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<[^>]+>/g, "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);

            return { scheme, lines };
          })
        );

        if (rows) {
          for (const r of rows) {
            for (const ln of r.lines) {
              const rate = pct(ln);
              if (!rate) continue;
              const tenureLabel = normTenure(ln.split(":")[0]);

              const base: Omit<RateRow, "tenureYears"> = {
                bank: BANK,
                product: "Personal Loan",
                type: "Fixed",
                tenureLabel,
                rateWithSalary: rate,
                rateWithoutSalary: rate,
                source: SRC,
                updatedAt,
                notes: r.scheme,
              };
              fanOutPush(out, base, tenureLabel, 10);
            }
          }
        }
      }

      /* --------------------------- HOUSING LOANS -------------------------- */
      else if (title.includes("housing")) {
        const tbody = await getTBody(wrapper);
        if (!tbody) continue;

        const rows = await tbody.evaluate((tb) =>
          Array.from(tb.querySelectorAll("tr")).map((tr) =>
            Array.from(tr.querySelectorAll("td")).map((td) =>
              (td.innerHTML || "")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .replace(/\s+/g, " ")
                .trim()
            )
          )
        );

        if (rows) {
          let currentGroup = "";
          let currentType = "";

          for (const t of rows) {
            if (t.length === 1) { currentGroup = t[0]; continue; }

            if (t.length === 4) {
              if (t[1]) currentType = t[1];
              const tenureLabel = normTenure(t[2] || "");
              const rate = pct(t[3] || "");
              if (!rate) continue;

              const base: Omit<RateRow, "tenureYears"> = {
                bank: BANK,
                product: "Home Loan",
                type: "Fixed",
                tenureLabel,
                rateWithSalary: rate,
                rateWithoutSalary: rate,
                source: SRC,
                updatedAt,
                notes: [currentGroup, currentType].filter(Boolean).join(" — "),
              };
              fanOutPush(out, base, tenureLabel, 25);
            }
            else if (t.length === 2) {
              const tenureLabel = normTenure(t[0] || "");
              const rate = pct(t[1] || "");
              if (!rate) continue;

              const base: Omit<RateRow, "tenureYears"> = {
                bank: BANK,
                product: "Home Loan",
                type: "Fixed",
                tenureLabel,
                rateWithSalary: rate,
                rateWithoutSalary: rate,
                source: SRC,
                updatedAt,
                notes: [currentGroup, currentType].filter(Boolean).join(" — "),
              };
              fanOutPush(out, base, tenureLabel, 25);
            }
          }
        }
      }

      /* -------------------------- EDUCATION LOANS ------------------------- */
      else if (title.includes("education")) {
        const tbody = await getTBody(wrapper);
        if (!tbody) continue;

        const rows = await tbody.evaluate((tb) =>
          Array.from(tb.querySelectorAll("tr")).map((tr) =>
            Array.from(tr.querySelectorAll("td")).map((td) =>
              (td.innerHTML || "")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          )
        );

        if (rows && rows.length >= 2) {
          const schemeName = rows[1][0]?.slice(-1)[0] || "BOC Comprehensive Educational Loan";
          const details = rows[1][1] || [];

          let lastMax = 0; // track previous "Up to" bound
          for (let i = 0; i < details.length; i++) {
            const line = details[i];
            const rate = pct(line);
            if (rate) {
              const tenureLabel = normTenure(details[i - 1] || "");
              let range = parseTenureRange(tenureLabel, 7);

              // adjust sequential "Up to" logic
              if (range && /up to/i.test(tenureLabel)) {
                if (range.to > lastMax) {
                  range.from = lastMax + 1;
                  lastMax = range.to;
                }
              }

              if (range) {
                for (let y = range.from; y <= range.to; y++) {
                  out.push({
                    bank: BANK,
                    product: "Education Loan",
                    type: "Fixed",
                    tenureLabel,
                    rateWithSalary: rate,
                    rateWithoutSalary: rate,
                    source: SRC,
                    updatedAt,
                    notes: schemeName,
                    tenureYears: y,
                  });
                }
              }
            }
          }
        }
      }
    }

    return out;
  } finally {
    await browser?.close();
  }
}
