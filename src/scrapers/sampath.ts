import fs from "fs/promises";
import pdf from "pdf-parse";

/** Self-contained row shape */
type RateRow = {
  bank: string;
  product: string;
  type: "Fixed" | "Floating";
  tenureYears?: number;
  tenureLabel?: string;
  rateWithSalary?: string;
  rateWithoutSalary?: string;
  source: string;
  updatedAt: string;
  notes?: string;
};

/* ------------------------- utils ------------------------- */
const SOURCE =
  "https://www.sampath.lk/common/loan/interest-rates-loan-and-advances.pdf";

const nowISO = () => new Date().toISOString();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Find the first % **after** a heading index within `forwardChars` */
function percentAfter(text: string, startIdx: number, forwardChars = 160): string | null {
  const window = text.slice(startIdx, startIdx + forwardChars);
  const m = window.match(/(\d{1,2}(?:[.,]\d{2})?)\s*%/);
  return m ? m[1].replace(",", ".") + "%" : null;
}

/** Find the first % **near** a heading index (prefers below, then above) */
function percentNear(text: string, startIdx: number, span = 200): string | null {
  const after = text.slice(startIdx, startIdx + span);
  const mAfter = after.match(/(\d{1,2}(?:[.,]\d{2})?)\s*%/);
  if (mAfter) return mAfter[1].replace(",", ".") + "%";
  const before = text.slice(Math.max(0, startIdx - span), startIdx);
  const mBefore = before.match(/(\d{1,2}(?:[.,]\d{2})?)\s*%/);
  return mBefore ? mBefore[1].replace(",", ".") + "%" : null;
}

/** Return substring for section starting at first match of `re` (case-insensitive) */
function sectionAfter(text: string, re: RegExp, maxChars = 2000): string {
  const m = text.match(re);
  if (!m || m.index === undefined) return "";
  return text.slice(m.index, m.index + maxChars);
}

/* ----------------------- extractors ---------------------- */

/** Sevana Fixed bands: robust to OCR like "01- 03 Years 10.50% p.a" */
function extractSevanaFixed(text: string): RateRow[] {
  const out: RateRow[] = [];
  const section = sectionAfter(text, /Sevana\s+Housing\s+Loans/i);

  // Each "band label" regex is tolerant to leading zeros & spaces.
  const patterns: { label: string; years: number[]; re: RegExp }[] = [
    { label: "1-3 Years", years: [1, 2, 3], re: /0?1\s*[-–]\s*0?3\s*Years\s+(\d{1,2}(?:[.,]\d{2})?)\s*%/i },
    { label: "4-5 Years", years: [4, 5],    re: /0?4\s*[-–]\s*0?5\s*Years\s+(\d{1,2}(?:[.,]\d{2})?)\s*%/i },
    { label: "6-7 Years", years: [6, 7],    re: /0?6\s*[-–]\s*0?7\s*Years\s+(\d{1,2}(?:[.,]\d{2})?)\s*%/i },
    { label: "8-10 Years", years: [8, 9, 10], re: /0?8\s*[-–]\s*10\s*Years\s+(\d{1,2}(?:[.,]\d{2})?)\s*%/i },
  ];

  for (const p of patterns) {
    const m = section.match(p.re);
    if (!m) continue;
    const rate = m[1].replace(",", ".") + "%";
    for (const y of p.years) {
      out.push({
        bank: "Sampath Bank",
        product: "Home Loan",
        type: "Fixed",
        tenureLabel: p.label,
        rateWithSalary: rate,
        source: SOURCE,
        updatedAt: nowISO(),
        notes: "Sevana (Fixed)",
        tenureYears: y,
      });
    }
  }

  return out;
}

/** Sevana Floating: applies to ALL tenures up to 25 years; find nearest % around "Floating" */
function extractSevanaFloating(text: string): RateRow[] {
  const out: RateRow[] = [];
  const m =
    text.match(/Sevana\s+Housing\s+Loans.*?Floating/i) ||
    text.match(/(^|\s)Floating(\s|$)/i);
  if (!m || m.index === undefined) return out;

  const rate = percentNear(text, m.index, 200);
  if (!rate) return out;

  for (let y = 1; y <= 25; y++) {
    out.push({
      bank: "Sampath Bank",
      product: "Home Loan",
      type: "Floating",
      tenureLabel: "All tenures",
      rateWithSalary: rate,
      source: SOURCE,
      updatedAt: nowISO(),
      notes: "Sevana (Floating)",
      tenureYears: y,
    });
  }
  return out;
}

/** AOCL (LAP & Unsecured PL): normalize and allow broken words like "(Secured Facil…)" */
function extractAOCL(text: string): RateRow[] {
  const out: RateRow[] = [];
  const raw = sectionAfter(text, /All\s+Other\s+Consumption\s+Loans/i, 2500);
  const normalized = clean(raw);

  // Secured (LAP)
  const sec =
    normalized.match(/(\d{1,2}(?:[.,]\d{2})?)\s*%\s*(?:p\.?\s*a\.?)?[^%]{0,120}Secured/i) ||
    normalized.match(/Secured[^%]{0,120}(\d{1,2}(?:[.,]\d{2})?)\s*%\s*(?:p\.?\s*a\.?)?/i);
  if (sec) {
    const rate = (sec[1] || sec[2] || "").replace(",", ".") + "%";
    for (let y = 1; y <= 5; y++) {
      out.push({
        bank: "Sampath Bank",
        product: "LAP",
        type: "Floating",
        tenureLabel: "All Other Consumption Loans (Secured Facilities)",
        rateWithSalary: rate,
        rateWithoutSalary: rate,
        source: SOURCE,
        updatedAt: nowISO(),
        notes: "All Other Consumption Loans · Secured (max 5 years)",
        tenureYears: y,
      });
    }
  }

  // Unsecured (Personal Loan)
  const unsec =
    normalized.match(/(\d{1,2}(?:[.,]\d{2})?)\s*%\s*(?:p\.?\s*a\.?)?[^%]{0,120}Unsecured/i) ||
    normalized.match(/Unsecured[^%]{0,120}(\d{1,2}(?:[.,]\d{2})?)\s*%\s*(?:p\.?\s*a\.?)?/i);
  if (unsec) {
    const rate = (unsec[1] || unsec[2] || "").replace(",", ".") + "%";
    for (let y = 1; y <= 5; y++) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        type: "Floating",
        tenureLabel: "All Other Consumption Loans (Unsecured Facilities)",
        rateWithoutSalary: rate,
        source: SOURCE,
        updatedAt: nowISO(),
        notes: "All Other Consumption Loans · Unsecured (max 5 years)",
        tenureYears: y,
      });
    }
  }

  return out;
}

/** Education Loan: look near "Study Smart Education Loan" and read the % */
function extractEducation(text: string): RateRow[] {
  const out: RateRow[] = [];
  const m = text.match(/Study\s+Smart.*?Education\s+Loan/i) || text.match(/Education\s+Loan.*?Study\s+Smart/i);
  if (!m || m.index === undefined) return out;

  const rate = percentNear(text, m.index, 160);
  if (!rate) return out;

  for (let y = 1; y <= 8; y++) {
    out.push({
      bank: "Sampath Bank",
      product: "Education Loan",
      type: "Floating",
      tenureLabel: "Sampath Study Smart Education Loan",
      rateWithSalary: rate,
      source: SOURCE,
      updatedAt: nowISO(),
      notes: "Study Smart Education Loan — applies up to 8 years",
      tenureYears: y,
    });
  }
  return out;
}

/** Special Personal Loans: Medical Officers / Professionals (up to 7y) */
function extractSpecialPersonalLoans(text: string): RateRow[] {
  const out: RateRow[] = [];

  // Medical Officers
  const med = text.match(/Loan\s*Scheme\s*for\s*Medical\s*Officers/i);
  if (med && med.index !== undefined) {
    const rate = percentNear(text, med.index, 160);
    if (rate) {
      for (let y = 1; y <= 7; y++) {
        out.push({
          bank: "Sampath Bank",
          product: "Personal Loan",
          type: "Floating",
          tenureLabel: "Loan Scheme for Medical Officers",
          rateWithSalary: rate,
          source: SOURCE,
          updatedAt: nowISO(),
          notes: "Loan Scheme for Medical Officers — applies up to 7 years",
          tenureYears: y,
        });
      }
    }
  }

  // Professionals
  const prof = text.match(/Personal\s*Loans?\s*for\s*Professionals/i);
  if (prof && prof.index !== undefined) {
    const rate = percentNear(text, prof.index, 160);
    if (rate) {
      for (let y = 1; y <= 7; y++) {
        out.push({
          bank: "Sampath Bank",
          product: "Personal Loan",
          type: "Floating",
          tenureLabel: "Personal Loans for Professionals",
          rateWithSalary: rate,
          source: SOURCE,
          updatedAt: nowISO(),
          notes: "Personal Loans for Professionals — applies up to 7 years",
          tenureYears: y,
        });
      }
    }
  }

  return out;
}

/** Housing Loans for salaried employees (Fixed & Floating) */
function extractSalariedEmployees(text: string): RateRow[] {
  const out: RateRow[] = [];
  const m = text.match(/Housing\s+Loans\s+for\s+salaried\s+employees/i);
  if (!m || m.index === undefined) return out;

  // First 5 years fixed at "AWPLR (prevailing at disbursement)"
  for (let y = 1; y <= 5; y++) {
    out.push({
      bank: "Sampath Bank",
      product: "Home Loan",
      type: "Fixed",
      tenureLabel: "Up to 5 Years",
      rateWithSalary: "AWPLR",
      source: SOURCE,
      updatedAt: nowISO(),
      notes: "Salaried employees — first 5y fixed",
      tenureYears: y,
    });
  }

  // Thereafter floating at "AWPLR + X%" (attempt to read, fallback to +2.00%)
  const window = text.slice(m.index, m.index + 1200);
  const plus = window.match(/AWP(?:LR)?\s*\+\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const rate = plus ? `AWPLR + ${Number(plus[1]).toFixed(2)}%` : "AWPLR + 2.00%";

  for (let y = 6; y <= 25; y++) {
    out.push({
      bank: "Sampath Bank",
      product: "Home Loan",
      type: "Fixed",
      tenureLabel: "Above 5 Years",
      rateWithSalary: clean(rate),
      source: SOURCE,
      updatedAt: nowISO(),
      notes: "Salaried employees — thereafter floating",
      tenureYears: y,
    });
  }

  return out;
}

/* ----------------------- main scraper ---------------------- */
function extractRatesFromText(text: string): RateRow[] {
  const t = clean(text);
  return [
    ...extractSevanaFixed(t),
    ...extractSevanaFloating(t),
    ...extractAOCL(t),
    ...extractEducation(t),
    ...extractSpecialPersonalLoans(t),
    ...extractSalariedEmployees(t), // ← added as requested
  ];
}

export async function scrapeSampath(pdfUrl: string, outputPath: string) {
  const buf = Buffer.from(await (await fetch(pdfUrl)).arrayBuffer());
  const pdfData = await pdf(buf);
  const text = pdfData.text || "";
  const rows = extractRatesFromText(text);
  await fs.writeFile(outputPath, JSON.stringify(rows, null, 2), "utf8");
  return rows;
}

/* Optional CLI runner */
if (require.main === module) {
  (async () => {
    const out = "output/sampath.json";
    await scrapeSampath(SOURCE, out);
    console.log(`✅ Wrote ${out}`);
  })().catch(e => {
    console.error("❌ Error scraping Sampath:", e);
    process.exit(1);
  });
}
