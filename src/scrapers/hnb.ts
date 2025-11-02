import { chromium, Page } from "playwright";
import { RateRow } from "../types";
import { acceptAnyCookie, clickLeftMenu } from "../utils/dom";
import { clean, decideType, expandTenureYears, fanOutByYears, normalizeAwpr } from "../utils/text";

const URL = "https://hnb.lk/interest-rates";

type HybridHL = {
  years: number[];
  label: string;
  withAwpr?: string;
  withoutAwpr?: string;
  options?: number[];
};

// --- local helpers -----------------------------------------------------------

function extractAwprMargin(s: string): string {
  if (!s) return "";
  let t = s.replace(/\s+/g, " ").trim().replace(/awp(?:lr)?/i, "AWPR");
  const plusIdx = t.indexOf("+");
  if (plusIdx === -1) return "";
  let numRaw = t.slice(plusIdx + 1).replace(/[^\d.]/g, "");
  numRaw = numRaw.replace(/\.{2,}/g, ".");
  const num = parseFloat(numRaw);
  if (isNaN(num)) return "";
  return `AWPR + ${num.toFixed(2)}%`;
}

function extractHybridOptions(a: string, b: string): number[] {
  const set = new Set<number>();
  const addFrom = (s: string) => {
    const t = (s || "").toLowerCase();
    const nums = t.match(/\b([0-9]{1,2})\b/g);
    if (nums) for (const n of nums) { const v = Number(n); if (v >= 1 && v <= 15) set.add(v); }
  };
  addFrom(a); addFrom(b);
  const arr = Array.from(set).sort((x, y) => x - y).filter((n) => [3,5,10].includes(n));
  return arr.length ? arr : [3,5,10];
}

function asPercent(s: string): string {
  const t = clean(s);
  if (!t) return t;
  if (/awp/i.test(t)) return normalizeAwpr(t);
  const m = t.match(/[0-9]+(?:\.[0-9]+)?\s*%/);
  return m ? clean(m[0]) : t;
}

// Loose tenure expander for labels like "1-3", "4-5", "7"
function expandYearsLoose(label: string): number[] {
  const s = (label || "").toLowerCase();
  const out: number[] = [];
  const rng = s.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
  if (rng) {
    let a = parseInt(rng[1], 10), b = parseInt(rng[2], 10);
    if (!isNaN(a) && !isNaN(b)) {
      if (a > b) [a, b] = [b, a];
      for (let i = Math.max(1, a); i <= Math.min(40, b); i++) out.push(i);
      return out;
    }
  }
  const single = s.match(/\b(\d{1,2})\b/);
  if (single) {
    const n = parseInt(single[1], 10);
    if (!isNaN(n)) return [n];
  }
  return [];
}

// --- MAIN ENTRY --------------------------------------------------------------

export async function scrapeHNB(opts?: { show?: boolean; slow?: number }): Promise<RateRow[]> {
  const browser = await chromium.launch({
    headless: !opts?.show,
    slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined
  });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });

  const rows: RateRow[] = [];
  const now = new Date().toISOString();

  try {
    // Try domcontentloaded first, fallback to load with longer timeout
    try {
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      await page.goto(URL, { waitUntil: "load", timeout: 90000 });
    }
    await acceptAnyCookie(page);

    // HOME LOANS
    await clickLeftMenu(page, "HNB Home Loans");
    rows.push(...await scrapeHomeLoans(page, now));

    // PERSONAL LOANS (base + Special + LAP)  ← LAP moved AFTER PL Special
    await clickLeftMenu(page, "Personal Loan");
    rows.push(...await scrapePersonalLoan(page, now));
    rows.push(...await scrapePersonalSpecial(page, now));
    rows.push(...await scrapeLoanAgainstProperty(page, now));

    // EDUCATION LOANS
    await clickLeftMenu(page, "Education Loans");
    rows.push(...await scrapeEducation(page, now));

  } finally {
    await browser.close();
  }

  return rows;
}

// --- HELPERS -----------------------------------------------------------------

async function headingAbove(page: Page, element: any): Promise<string> {
  const handle = await element.elementHandle();
  if (!handle) return "";
  const txt = await page.evaluate((el) => {
    function prev(elm: Element | null): Element | null {
      let n: Element | null = elm;
      while (n && !n.previousElementSibling) n = n.parentElement;
      return n ? n.previousElementSibling : null;
    }
    function isHeading(el: Element | null): el is HTMLElement {
      if (!el) return false;
      return /H[1-6]/i.test(el.tagName);
    }
    let cursor: Element | null = el as Element;
    for (let i = 0; i < 100; i++) {
      cursor = prev(cursor);
      if (!cursor) break;
      if (isHeading(cursor)) return (cursor.textContent || "").trim();
    }
    return "";
  }, handle);
  await handle.dispose();
  return clean(txt);
}

// --- HOME LOANS --------------------------------------------------------------

async function scrapeHomeLoans(page: Page, now: string): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const source = URL;

  const fixedWith: Record<number, string> = {};
  const fixedWithout: Record<number, string> = {};
  const hybrid: HybridHL[] = [];

  const tables = await page.locator("table").all();
  for (const tbl of tables) {
    const heading = await headingAbove(page, tbl);
    const h = clean(heading);

    if (!h) continue;
    if (/foreign currency/i.test(h)) continue;
    if (!/home loan/i.test(h) && !/special.*home loan/i.test(h)) continue;

    const isSpecial = /special/i.test(h);
    const bodyRows = await tbl.locator("tbody tr").all();

    for (const tr of bodyRows) {
      const tds = (await tr.locator("td").allTextContents()).map(clean);
      if (!tds.length) continue;

      if (isSpecial) {
        const tenureCell = tds[0] || "";
        const rate = asPercent(tds[1] || "");
        const years = expandTenureYears(tenureCell);

        out.push(...fanOutByYears<RateRow>({
          bank: "HNB",
          product: "Home Loan",
          type: "Fixed",
          tenureLabel: tenureCell,
          rateWithSalary: rate || undefined,
          rateWithoutSalary: undefined,
          source,
          updatedAt: now,
          notes: "Special Rate"
        }, years));

        continue;
      }

      const typeCell = tds[0] || "";
      const tenureCell = tds[1] || "";
      const salCellRaw = (tds[2] || "");
      const nosalCellRaw = (tds[3] || "");

      const looksHybrid =
        /(followed by).*(awpr|awplr)/i.test(`${salCellRaw} ${nosalCellRaw}`) ||
        /fixed and floating/i.test(typeCell);

      if (looksHybrid) {
        const years = expandTenureYears(tenureCell);
        const withMargin = extractAwprMargin(salCellRaw);
        const withoutMargin = extractAwprMargin(nosalCellRaw);
        hybrid.push({
          years,
          label: tenureCell,
          withAwpr: withMargin || undefined,
          withoutAwpr: withoutMargin || undefined,
          options: extractHybridOptions(salCellRaw, nosalCellRaw)
        });
        continue;
      }

      const withPct = asPercent(salCellRaw);
      const withoutPct = asPercent(nosalCellRaw);
      const years = expandTenureYears(tenureCell);
      const rowType = decideType(withPct, withoutPct, `${typeCell} ${tenureCell}`);

      const base = {
        bank: "HNB",
        product: "Home Loan",
        type: rowType,
        tenureLabel: tenureCell,
        rateWithSalary: withPct || undefined,
        rateWithoutSalary: withoutPct || undefined,
        source,
        updatedAt: now
      } satisfies Omit<RateRow, "tenureYears">;

      const fanned = fanOutByYears<RateRow>(base, years);
      out.push(...fanned);

      if (rowType === "Fixed") {
        for (const r of fanned) {
          if (typeof r.tenureYears === "number" && r.tenureYears <= 10) {
            if (r.rateWithSalary) fixedWith[r.tenureYears] = r.rateWithSalary;
            if (r.rateWithoutSalary) fixedWithout[r.tenureYears] = r.rateWithoutSalary;
          }
        }
      }
    }
  }

  for (const h of hybrid) {
    const options = h.options && h.options.length ? h.options : [3,5,10];
    for (const y of h.years) {
      for (const opt of options) {
        const fixW = fixedWith[opt];
        const fixN = fixedWithout[opt];
        if (!fixW || !h.withAwpr) continue;

        const withComposed = `${fixW} (first ${opt}y), then ${h.withAwpr}`;
        const withoutComposed = (fixN && h.withoutAwpr)
          ? `${fixN} (first ${opt}y), then ${h.withoutAwpr}`
          : undefined;

        out.push({
          bank: "HNB",
          product: "Home Loan",
          type: "Fixed & Floating",
          tenureYears: y,
          tenureLabel: h.label,
          rateWithSalary: withComposed,
          rateWithoutSalary: withoutComposed,
          source,
          updatedAt: now,
          notes: `Hybrid option: first ${opt}y fixed at grid (${fixW}${fixN ? `/${fixN}` : ""}), then remaining period at ${h.withAwpr}${withoutComposed ? ` and ${h.withoutAwpr}` : ""}`
        });
      }
    }
  }

  return out;
}

// --- PERSONAL LOANS ----------------------------------------------------------

async function scrapePersonalLoan(page: Page, now: string): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const source = URL;

  const fixedWithPL: Record<number, string> = {};
  const fixedWithoutPL: Record<number, string> = {};
  const hybridPL: HybridHL[] = [];

  const tables = await page.locator("table").all();
  for (const tbl of tables) {
    const heading = await headingAbove(page, tbl);
    const h = clean(heading);

    if (/roof\s*top\s*solar/i.test(h)) continue;
    if (!/personal loan/i.test(h)) continue;
    if (/loan against property|lap/i.test(h)) continue;
    if (/special/i.test(h)) continue;

    const headers = (await tbl.locator("thead tr th").allTextContents()).map((s) => clean(s).toLowerCase());
    const bodyRows = await tbl.locator("tbody tr").all();

    const idxTenorHeader = headers.findIndex((hh) => /tenor|tenure/i.test(hh));
    const defaultTenorIdx = idxTenorHeader >= 0 ? idxTenorHeader : 1;

    for (const tr of bodyRows) {
      const tds = (await tr.locator("td").allTextContents()).map(clean);
      if (!tds.length) continue;

      let tenureCell = "";
      if (tds.length === 2) {
        tenureCell = tds[0];
      } else {
        tenureCell = tds[defaultTenorIdx] || tds[1] || tds[0];
      }

      let withCell = "";
      let withoutCell = "";
      if (tds.length === 2) {
        withCell = tds[1];
      } else {
        const idxWith = headers.findIndex((hh) => /salary|smart|youth|with/i.test(hh));
        const idxWithout = headers.findIndex((hh) => /without|business/i.test(hh));
        withCell = idxWith >= 0 ? tds[idxWith] : (tds[2] || tds[tds.length - 2] || "");
        withoutCell = idxWithout >= 0 ? tds[idxWithout] : (tds[3] || tds[tds.length - 1] || "");
      }

      const looksHybrid =
        /(followed by).*(awpr|awplr)/i.test(`${withCell} ${withoutCell}`) ||
        /fixed\s*cumulative\s*floating/i.test((tds[0] || "")) ||
        /fixed and floating/i.test((tds[0] || "")) ||
        /fixed\s*cumulative\s*floating/i.test(tenureCell);

      if (looksHybrid) {
        let years = expandTenureYears(tenureCell);
        years = years.length ? years.filter((y) => y >= 3 && y <= 7) : [3, 4, 5, 6, 7];

        const optsParsed = extractHybridOptions(withCell, withoutCell).filter((n) => n === 3 || n === 5);
        const options = optsParsed.length ? optsParsed : [3, 5];

        const withMargin = extractAwprMargin(withCell);
        const withoutMargin = extractAwprMargin(withoutCell);
        hybridPL.push({
          years,
          label: tenureCell || "3–7 Years",
          withAwpr: withMargin || undefined,
          withoutAwpr: withoutMargin || undefined,
          options
        });
        continue;
      }

      const withPct = asPercent(withCell);
      const withoutPct = asPercent(withoutCell);
      let years = expandTenureYears(tenureCell);

      if (!years.length) {
        const m = tenureCell.toLowerCase().match(/\b(\d{1,2})\s*(?:year|yr)s?\b/);
        if (m) years = [parseInt(m[1], 10)];
      }

      const type = decideType(withPct, withoutPct, h);

      const fanned = fanOutByYears<RateRow>({
        bank: "HNB",
        product: "Personal Loan",
        type,
        tenureLabel: tenureCell,
        rateWithSalary: withPct || undefined,
        rateWithoutSalary: withoutPct || undefined,
        source,
        updatedAt: now
      }, years);
      out.push(...fanned);

      if (type === "Fixed") {
        for (const r of fanned) {
          if (typeof r.tenureYears === "number" && r.tenureYears <= 10) {
            if (r.rateWithSalary) fixedWithPL[r.tenureYears] = r.rateWithSalary;
            if (r.rateWithoutSalary) fixedWithoutPL[r.tenureYears] = r.rateWithoutSalary;
          }
        }
      }
    }
  }

  for (const h of hybridPL) {
    const options = h.options && h.options.length ? h.options : [3,5];
    for (const y of h.years) {
      const validOpts = options.filter((opt) => opt <= y);
      for (const opt of validOpts) {
        const fixW = fixedWithPL[opt];
        const fixN = fixedWithoutPL[opt] || fixedWithPL[opt];
        if (!fixW || !h.withAwpr) continue;

        const withComposed = `${fixW} (first ${opt}y), then ${h.withAwpr}`;
        const withoutComposed = (fixN && h.withoutAwpr)
          ? `${fixN} (first ${opt}y), then ${h.withoutAwpr}`
          : undefined;

        out.push({
          bank: "HNB",
          product: "Personal Loan",
          type: "Fixed & Floating",
          tenureYears: y,
          tenureLabel: h.label,
          rateWithSalary: withComposed,
          rateWithoutSalary: withoutComposed,
          source,
          updatedAt: now,
          notes: `Hybrid option (PL): first ${opt}y fixed${fixN ? ` (${fixW}/${fixN})` : ` (${fixW})`}, then floating`
        });
      }
    }
  }

  return out;
}

// --- PERSONAL LOANS (Special) ------------------------------------------------

async function scrapePersonalSpecial(page: Page, now: string): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const source = URL;

  const tables = await page.locator("table").all();
  for (const tbl of tables) {
    const heading = await headingAbove(page, tbl);
    const h = clean(heading);
    if (!/special/i.test(h)) continue;
    if (!/personal/i.test(h)) continue;

    const bodyRows = await tbl.locator("tbody tr").all();
    for (const tr of bodyRows) {
      const tds = (await tr.locator("td").allTextContents()).map(clean);
      if (!tds.length) continue;

      const tenureCell = tds[0] || "";
      const rateCell = asPercent(tds[1] || "");
      const years = expandTenureYears(tenureCell);

      out.push(...fanOutByYears<RateRow>({
        bank: "HNB",
        product: "Personal Loan",
        type: "Fixed",
        tenureLabel: tenureCell,
        rateWithSalary: rateCell || undefined,
        rateWithoutSalary: undefined,
        source,
        updatedAt: now,
        notes: "Special Rate"
      }, years));
    }
  }
  return out;
}

// --- LAP (Loan Against Property) ---------------------------------------------

async function scrapeLoanAgainstProperty(page: Page, now: string): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const source = URL;

  const tables = await page.locator("table").all();
  for (const tbl of tables) {
    const heading = await headingAbove(page, tbl);
    const h = clean(heading);
    if (!/(loan against property|^lap$|\blap\b)/i.test(h)) continue;

    const headers = (await tbl.locator("thead tr th").allTextContents()).map((s) => clean(s).toLowerCase());
    const bodyRows = await tbl.locator("tbody tr").all();

    // find column indices (fallbacks: 0=tenor, 1=fixed, 2=floating)
    const idxTenor = headers.findIndex((t) => /period|tenor|tenure/.test(t));
    const idxFixed = headers.findIndex((t) => /fixed/.test(t));
    const idxFloat = headers.findIndex((t) => /float/.test(t));

    for (const tr of bodyRows) {
      const tds = (await tr.locator("td").allTextContents()).map(clean);
      if (!tds.length) continue;

      const tenureCell = tds[(idxTenor >= 0 ? idxTenor : 0)] || "";
      const fixedCell  = tds[(idxFixed >= 0 ? idxFixed : 1)] || "";
      const floatCell  = tds[(idxFloat >= 0 ? idxFloat : 2)] || "";

      // Expand years: try normal expander first; if label is like "1-3", use loose.
      let years = expandTenureYears(tenureCell);
      if (!years.length) years = expandYearsLoose(tenureCell);

      // Fixed rate (e.g., "11.50%")
      const fixedRate = asPercent(fixedCell) || undefined;

      // Floating margin (e.g., "AWPLR + 2.50%" → "AWPR + 2.50%")
      const floatRate = extractAwprMargin(floatCell) || asPercent(floatCell) || undefined;

      // Emit FIXED row(s) – same for with/without salary
      if (fixedRate) {
        out.push(
          ...fanOutByYears<RateRow>({
            bank: "HNB",
            product: "LAP",
            type: "Fixed",
            tenureLabel: tenureCell,
            rateWithSalary: fixedRate,
            rateWithoutSalary: fixedRate,
            source,
            updatedAt: now,
          }, years)
        );
      }

      // Emit FLOATING row(s) – same for with/without salary
      if (floatRate) {
        out.push(
          ...fanOutByYears<RateRow>({
            bank: "HNB",
            product: "LAP",
            type: "Floating",
            tenureLabel: tenureCell,
            rateWithSalary: floatRate,
            rateWithoutSalary: floatRate,
            source,
            updatedAt: now,
          }, years)
        );
      }
    }
  }
  return out;
}

// --- EDUCATION LOANS (base + grace-period rates) -----------------------------

async function scrapeEducation(page: Page, now: string): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const source = URL;

  const tables = await page.locator("table").all();
  for (const tbl of tables) {
    const heading = await headingAbove(page, tbl);
    const h = clean(heading);
    if (!/education loan/i.test(h)) continue;

    // Header indices
    const headers = (await tbl.locator("thead tr th").allTextContents()).map((s) => clean(s).toLowerCase());
    const idxTenor = headers.findIndex((t) => /period|tenor|tenure/.test(t));
    const idxGrace = headers.findIndex((t) => /grace/.test(t) && /during|rate.*during/i.test(t));
    const idxNoGrace = headers.findIndex((t) => /without.*grace|no.*grace/.test(t));

    const bodyRows = await tbl.locator("tbody tr").all();

    for (const tr of bodyRows) {
      const tds = (await tr.locator("td").allTextContents()).map(clean);
      if (!tds.length) continue;

      const tenureCell = tds[(idxTenor >= 0 ? idxTenor : 0)] || "";
      const yearsRaw = expandTenureYears(tenureCell);
      const years = yearsRaw.length ? yearsRaw : ((): number[] => {
        const m = tenureCell.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
        if (m) {
          const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
          const from = Math.min(a, b), to = Math.max(a, b);
          return Array.from({ length: to - from + 1 }, (_, i) => from + i);
        }
        const single = tenureCell.match(/\b(\d{1,2})\b/);
        return single ? [parseInt(single[1], 10)] : [];
      })();
      if (!years.length) continue;

      const graceCell = idxGrace >= 0 ? tds[idxGrace] || "" : "";
      const noGraceCell = idxNoGrace >= 0 ? tds[idxNoGrace] || "" : "";

      const noGraceRate = asPercent(noGraceCell) || undefined;

      // If grace is blank → fall back to noGraceRate
      let graceRate = asPercent(graceCell) || undefined;
      if ((!graceRate || graceRate === "-") && noGraceRate) {
        graceRate = noGraceRate;
      }

      // Normal (without grace period)
      if (noGraceRate) {
        out.push(
          ...fanOutByYears<RateRow>({
            bank: "HNB",
            product: "Education Loan",
            type: "Fixed",
            tenureLabel: tenureCell,
            rateWithSalary: noGraceRate,
            rateWithoutSalary: noGraceRate,
            source,
            updatedAt: now,
            notes: "Without Grace Period"
          }, years)
        );
      }

      // Grace-period rate
      if (graceRate) {
        out.push(
          ...fanOutByYears<RateRow>({
            bank: "HNB",
            product: "Education Loan",
            type: "Fixed",
            tenureLabel: tenureCell,
            rateWithSalary: graceRate,
            rateWithoutSalary: graceRate,
            source,
            updatedAt: now,
            notes: "During Grace Period"
          }, years)
        );
      }
    }
  }

  return out;
}
