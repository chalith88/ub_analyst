// src/scrapers/nsb.ts
import { chromium, Browser, Page } from "playwright";

export type RateRow = {
  bank: string;
  product: string;
  type: "Fixed" | "Floating" | "Fixed & Floating";
  tenureLabel: string;
  rateWithSalary: string;
  rateWithoutSalary: string;
  source: string;
  updatedAt: string;
  notes?: string;
  tenureYears?: number;
};

const SRC = "https://www.nsb.lk/lending-rates/";

const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const isGeneralHousing = (s: string) =>
  s.toLowerCase().includes("housing loans") && s.toLowerCase().includes("(general)");
const isFirstHome = (s: string) => /(1st|first)\s*home\s*owner/i.test(s);
const isFullTenureFixedText = (s: string) => /fixed\s*for\s*full\s*tenure/i.test(s);
const isTwoYearFixedFloating = (s: string) =>
  /fixed\s*for\s*two\s*years.*variable/i.test(s.toLowerCase());

function pctify(s: string): string {
  const n = s.replace(/[^\d.]/g, "");
  if (!n) return clean(s);
  return `${Number(n)}%`;
}

async function acceptCookiesIfAny(page: Page) {
  const sels = [
    'button:has-text("Accept")',
    'button:has-text("I Accept")',
    'button:has-text("Got it")',
    'button[aria-label*="accept" i]',
    'text=Accept All',
    'text=Allow all',
  ];
  for (const sel of sels) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
}

function fanOutByYears(base: RateRow, maxYears: number): RateRow[] {
  const rows: RateRow[] = [];
  for (let y = 1; y <= maxYears; y++) {
    rows.push({ ...base, tenureYears: y });
  }
  return rows;
}

export async function scrapeNSB(opts?: { show?: boolean; slow?: number }): Promise<RateRow[]> {
  let browser: Browser | null = null;
  const out: RateRow[] = [];
  const now = new Date().toISOString();

  try {
    browser = await chromium.launch({ headless: !opts?.show, slowMo: opts?.slow ?? 0 });
    const page = await (await browser.newContext()).newPage();

    await page.goto(SRC, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await acceptCookiesIfAny(page);

    const rows = await page.evaluate(() => {
      function txt(n: Element | null) {
        return (n?.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      }
      const tables = Array.from(document.querySelectorAll("table"));
      let target: HTMLTableElement | null = null;
      for (const t of tables) {
        const first = Array.from(t.querySelectorAll("tr:first-child th, tr:first-child td"));
        const headers = first.map(c => txt(c)).map(h => h.toLowerCase());
        const ok =
          headers.some(h => h.includes("loan type")) &&
          headers.some(h => h.includes("description")) &&
          headers.some(h => h.includes("interest rate"));
        if (ok) { target = t as HTMLTableElement; break; }
      }
      if (!target) return [] as Array<{ loanType: string; description: string; rateRaw: string }>;

      const bodyRows = Array.from(target.querySelectorAll("tbody tr"));
      const out = [] as { loanType: string; description: string; rateRaw: string }[];
      let lastLoanType = "";

      for (const tr of bodyRows) {
        const tds = Array.from(tr.querySelectorAll("td"));
        if (!tds.length) continue;

        let loanType = "", description = "", rateRaw = "";

        if (tds.length >= 3) {
          loanType = txt(tds[0]) || lastLoanType;
          description = txt(tds[1]);
          rateRaw = txt(tds[2]);
        } else if (tds.length === 2) {
          loanType = lastLoanType;
          description = txt(tds[0]);
          rateRaw = txt(tds[1]);
        } else continue;

        if (loanType) lastLoanType = loanType;
        if (!/^\s*\d+(?:\.\d+)?\s*$/.test(rateRaw)) continue;

        out.push({ loanType, description, rateRaw });
      }
      return out;
    });

    for (const r of rows as Array<{ loanType: string; description: string; rateRaw: string }>) {
      const loanType = clean(r.loanType);
      const description = clean(r.description);
      const rate = pctify(r.rateRaw);

      if (/solar/i.test(loanType)) continue;

      let product = "Home Loan";
      let notes: string | undefined;

      if (isGeneralHousing(loanType)) {
        product = "Home Loan";
        notes = `Housing Loans (General) - ${description}`;
      } else if (isFirstHome(loanType)) {
        product = "Home Loan";
        notes = `First Home Owner Loan - ${description}`;
      } else if (/alankara/i.test(loanType)) {
        product = "Home Loan";
        notes = "Alankara Housing Loan";
      } else if (/buddhi/i.test(loanType) || /higher education/i.test(description)) {
        product = "Education Loan";
        notes = `Buddhi Loan${description ? " - " + description : ""}`;
      } else if (/diriya/i.test(loanType)) {
        product = "Personal Loan";
        notes = `Diriya Loan${description ? " - " + description : ""}`;
      } else if (/professionals/i.test(loanType)) {
        product = "Personal Loan";
        notes = `Personal Loans for Professionals${description ? " - " + description : ""}`;
      } else if (/personal/i.test(loanType)) {
        product = "Personal Loan";
      } else if (/housing/i.test(loanType)) {
        product = "Home Loan";
      } else {
        product = loanType;
      }

      const isFullTenureFixed = isFullTenureFixedText(description);
      const twoYearFixedFloating = isTwoYearFixedFloating(description + " " + loanType);

      const base: RateRow = {
        bank: "NSB",
        product,
        type: isFullTenureFixed ? "Fixed" : "Fixed & Floating",
        tenureLabel: "",
        rateWithSalary: rate,
        rateWithoutSalary: rate,
        source: SRC,
        updatedAt: now,
        ...(notes ? { notes } : {}),
      };

      let finalRows: RateRow[] = [];

      if (product === "Home Loan" && isFullTenureFixed) {
        base.tenureLabel = "Full Tenure (Fixed)";
        finalRows = fanOutByYears(base, 25);
      } else {
        // All others are single-row
        base.tenureLabel = "2 Years (Fixed)";
        base.tenureYears = 2;
        if (twoYearFixedFloating) {
          base.notes = base.notes
            ? `${base.notes} | Fixed 2y, then variable every 6 months`
            : "Fixed 2y, then variable every 6 months";
        }
        finalRows = [base];
      }

      out.push(...finalRows);
    }

    return out;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
