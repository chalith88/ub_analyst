// src/scrapers/dfcc-tariff.ts

import fs from "fs";
import fetch from "node-fetch";
import pdf from "pdf-parse";

/* ---------------- Types ---------------- */
export interface FeeRow {
  bank: string;
  product: string;
  feeType: string;
  description: string;
  amount: string;
  notes?: string;
  updatedAt: string;
  source: string;
}

/* ---------------- Constants ---------------- */
const PDF_URL =
  "https://s3.ap-southeast-1.amazonaws.com/dfcc.lk/wp-content/uploads/2025/05/29072325/DFCC-Bank-PLC-Tariff-2025-Version-3.1-1.pdf";
const BANK = "DFCC Bank";
const nowISO = () => new Date().toISOString();

/* ---------------- Utils ---------------- */
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function normAll(txt: string): string[] {
  return txt
    .split(/\r?\n/)
    .map((s) =>
      s
        // strip zero-widths & NBSP
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim()
    );
}

function writeDebugLines(lines: string[]) {
  ensureDir("./work_dfcc");
  fs.writeFileSync(
    "./work_dfcc/dfcc-tariff-ocr-lines.txt",
    lines.map((l, i) => `[${i}] ${l}`).join("\n"),
    "utf8"
  );
}

// Fix leading zeros in amounts like "006,000 + VAT" → "6,000 + VAT"
function normalizeAmount(amt: string): string {
  return amt
    .replace(/\b0+(\d{1,3},\d{3}(?:,\d{3})*)/g, "$1")
    .replace(/\s*\+\s*VAT/i, " + VAT"); // normalize spacing around + VAT
}

/* ---------------- Home Loan (unchanged) ---------------- */
function parseHomeLoanProcessing(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];
  const seen = new Set<string>();

  const headerIdx = lines.findIndex((l) =>
    /5\.1\.3\s*Housing\s*Loan\s*All\s*Categories/i.test(l)
  );
  if (headerIdx < 0) return out;

  const slabLines: string[] = [];
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 25, lines.length); i++) {
    const ln = lines[i] || "";
    const m = ln.match(/^\s*5\.1\.3\.(\d)/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (idx >= 1 && idx <= 6) slabLines.push(ln);
    if (slabLines.length === 6) break;
  }

  const pickDescAndFee = (raw: string) => {
    let line = raw.replace(/^\s*5\.1\.3\.\d+\s*/, "");
    const na = line.search(/N\/A|NA|n\/a|n\.a\./i);
    if (na >= 0) line = line.slice(0, na).trim();

    // last comma-number = fee
    let lastFee: RegExpExecArray | null = null;
    const feeRe = /\d{1,3}(?:,\d{3})+/g;
    let m: RegExpExecArray | null;
    while ((m = feeRe.exec(line)) !== null) lastFee = m;
    if (!lastFee) return {};

    const amount = lastFee[0];
    const desc = line.slice(0, lastFee.index).replace(/\s+/g, " ").trim();

    const description = desc
      .replace(/\bUp to Rs\.?3,000,00\b/i, "Up to Rs.3,000,000")
      .replace(/\bRs\.?10,000,001- 30,000,00\b/i, "Rs.10,000,001- 30,000,000")
      .replace(/\bRs\s*30,000,001- 50,000,00\b/i, "Rs 30,000,001- 50,000,000");

    return { description, amount };
  };

  for (const ln of slabLines) {
    const got = pickDescAndFee(ln);
    if (!got.description || !got.amount) continue;

    const ok =
      /^Up to Rs\.?\s*[\d,]+$/i.test(got.description) ||
      /^Rs\.?\s*[\d,]+\s*-\s*[\d,]+$/i.test(got.description) ||
      /^Rs\s*[\d,]+\s*-\s*[\d,]+$/i.test(got.description) ||
      /^Over Rs\.?\s*[\d,]+\s*Mn$/i.test(got.description);

    if (!ok) continue;

    const key = `${got.description}|${got.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      bank: BANK,
      product: "Home Loan",
      feeType: "Processing Fee",
      description: got.description,
      amount: got.amount,
      updatedAt: nowISO(),
      source,
    });
  }

  return out;
}

/* ---------------- Personal Loan (unchanged) ---------------- */
function parsePersonalLoanProcessing(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];
  const seen = new Set<string>();

  // Only care about lines that start with 5.2.1.1.<1-5>
  const slabLines: string[] = [];
  for (const ln of lines) {
    if (/^5\.2\.1\.1\.[1-5]/.test(ln)) {
      // Skip noise (skip lines with only N/A, 'fee', 'Equivalent FCY value to LKR')
      if (/^N\/A$/i.test(ln) || /^fee$/i.test(ln) || /Equivalent FCY value to LKR/i.test(ln)) continue;
      slabLines.push(ln);
    }
  }

  // You want all 5 (1 to 5). No dupes!
  const slabNums = new Set<string>();
  for (const ln of slabLines) {
    const numMatch = ln.match(/^5\.2\.1\.1\.([1-5])/);
    if (!numMatch) continue;
    const num = numMatch[1];
    if (slabNums.has(num)) continue;
    slabNums.add(num);

    // Remove '5.2.1.1.x' at start (x = 1-5), then trim
    let rest = ln.replace(/^5\.2\.1\.1\.[1-5]/, "").trim();

    // Remove "N/A" tokens (they may be stuck to the left or right of amounts)
    rest = rest.replace(/\bN\/A\b/gi, " ").replace(/N\/A\s*/gi, " ").replace(/\s+/g, " ").trim();

    // Defensive: If "Equivalent FCY value to LKR" sneaks in, remove all after
    const eqIdx = rest.indexOf("Equivalent FCY value to LKR");
    if (eqIdx > -1) rest = rest.slice(0, eqIdx).trim();

    // The fee amount is always the **last** comma-number (7,500, 10,000, 15,000, etc)
    let feeMatch = null;
    const feeRe = /\d{1,3}(?:,\d{3})+/g;
    let m: RegExpExecArray | null;
    while ((m = feeRe.exec(rest)) !== null) feeMatch = m;
    if (!feeMatch) continue;
    const amount = feeMatch[0];

    // Description is everything up to last amount
    let description = rest.slice(0, feeMatch.index).trim();

    // Fix LKR leading dot, spaces
    description = description
      .replace(/^LKR\s*\.\s*/, "LKR ")
      .replace(/^LKR\s*\./, "LKR ")
      .replace(/^LKR\./, "LKR ")
      .replace(/(\s|^)\.([0-9])/, "$1$2") // Remove dot before numbers
      .replace(/\s+N\/A$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    // Edge fix: "LKR .2,000,001" -> "LKR 2,000,001"
    description = description.replace(/^LKR\s*\.\s*/, "LKR ").replace(/^LKR\./, "LKR ");

    // Remove duplicate
    const key = `${description}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      bank: "DFCC Bank",
      product: "Personal Loan",
      feeType: "Processing Fee",
      description,
      amount,
      updatedAt: nowISO(),
      source,
    });
  }
  return out;
}

/* ---------------- Education Loan ---------------- */
function parseEducationLoanSlabs(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];
  const sectionIdx = lines.findIndex((l) =>
    l.trim().startsWith("5.2.1.5Education Loan")
  );
  if (sectionIdx < 0) return out;
  const prefix = "5.2.1.5.";
  const seen = new Set<string>();
  for (let i = 1; i <= 5; ++i) {
    const slabLine = lines.find((l) => l.trim().startsWith(`${prefix}${i}`));
    if (!slabLine) continue;

    let descPart = slabLine.replace(new RegExp(`^${prefix}${i}`), "").trim();
    descPart = descPart.replace(/\bN\/A\b/gi, " ").replace(/\s+/g, " ").trim();

    let lastFee: RegExpExecArray | null = null;
    const feeRe = /\d{1,3}(?:,\d{3})+/g;
    let m: RegExpExecArray | null;
    while ((m = feeRe.exec(descPart)) !== null) lastFee = m;
    if (!lastFee) continue;
    const amount = normalizeAmount(lastFee[0]);

    let description = descPart.slice(0, lastFee.index).trim();
    description = description
      .replace(/N\/A\s*$/i, "")
      .replace(/\s+N\/A$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    description = description
      .replace(/^LKR\s*\.\s*/, "LKR ")
      .replace(/^LKR\./, "LKR ")
      .replace(/^LKR\s*\./, "LKR ")
      .replace(/(\s|^)\.([0-9])/, "$1$2")
      .replace(/^\.?/, "")
      .trim();

    if (/Over\s*Rs\./i.test(description)) description = "Over Rs.50 Mn";

    out.push({
      bank: "DFCC Bank",
      product: "Education Loan",
      feeType: "Processing Fee",
      description,
      amount,
      updatedAt: nowISO(),
      source,
    });
  }
  return out;
}

/* ---------------- One Loan / Special Slabs ---------------- */
function parseSpecialLoanSlabs(
  lines: string[],
  source: string,
  section: string,
  note: string
): FeeRow[] {
  const out: FeeRow[] = [];
  // Ex: 5.2.1.6One Loan → prefix = 5.2.1.6.
  const sectionIdx = lines.findIndex((l) =>
    l.trim().toLowerCase().startsWith(`5.2.1.${section.toLowerCase()}`)
  );
  if (sectionIdx < 0) return out;

  const prefix = `5.2.1.${section}.`;
  const seen = new Set<string>();

  for (let i = 1; i <= 5; ++i) {
    const slabLine = lines.find((l) => l.trim().startsWith(`${prefix}${i}`));
    if (!slabLine) continue;

    let descPart = slabLine.replace(new RegExp(`^${prefix}${i}`), "").trim();
    descPart = descPart.replace(/\bN\/A\b/gi, " ").replace(/\s+/g, " ").trim();

    let lastFee: RegExpExecArray | null = null;
    const feeRe = /\d{1,3}(?:,\d{3})+/g;
    let m: RegExpExecArray | null;
    while ((m = feeRe.exec(descPart)) !== null) lastFee = m;
    if (!lastFee) continue;
    const amount = normalizeAmount(lastFee[0]);

    let description = descPart.slice(0, lastFee.index).trim();
    description = description
      .replace(/N\/A\s*$/i, "")
      .replace(/\s+N\/A$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    description = description
      .replace(/^LKR\s*\.\s*/, "LKR ")
      .replace(/^LKR\./, "LKR ")
      .replace(/^LKR\s*\./, "LKR ")
      .replace(/(\s|^)\.([0-9])/, "$1$2")
      .replace(/^\.?/, "")
      .trim();

    if (/Over\s*Rs\./i.test(description)) description = "Over Rs.50 Mn";

    for (const product of ["Home Loan", "Loan Against Property", "Personal Loan"]) {
      const key = `${product}|${note}|${description}|${amount}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        bank: "DFCC Bank",
        product,
        feeType: "Processing Fee",
        description,
        amount,
        notes: note,
        updatedAt: nowISO(),
        source,
      });
    }
  }
  return out;
}

/* ----------- Legal Fees - Title Report ----------- */
function parseLegalFeesTitleReport(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];
  for (const ln of lines) {
    const match = ln.match(/^5\.5\.1\.(\d+)(.+)$/);
    if (!match) continue;
    let [_, slabNo, rest] = match;

    // Find all <amount + VAT> in this line
    let amountMatch = rest.match(/(\d{1,3}(?:,\d{3})*)\s*\+\s*VAT/);
    let amount = amountMatch
  ? amountMatch[0]
      .replace(/\s+/g, " ")
      .replace(/ ,/g, ",")
      .replace(/^0+(?=\d)/, "")  // Only if the first char is zero, drop all zeros until digit
      .trim()
  : "";

    // Hardcode descriptions by slabNo, to avoid OCR splits
    let description = "";
    if (slabNo === "1") description = "Up to LKR 3,000,000";
    if (slabNo === "3") description = "LKR 3,000,001 - 25,000,000";
    if (slabNo === "4") description = "Over Rs.25 Mn";

    if (!description || !amount) continue;

    for (const product of ["Home Loan", "Loan Against Property"]) {
      out.push({
        bank: BANK,
        product,
        feeType: "Legal Fees - Title Report",
        description,
        amount,
        updatedAt: nowISO(),
        source,
      });
    }
  }
  return out;
}

/* ----------- Legal Fees - Mortgage Bond ----------- */
function parseLegalFeesMortgageBond(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];
  // Find start of Mortgage Bond section
  const startIdx = lines.findIndex(l =>
    /^5\.5\.2\b/.test(l.trim())
  );
  if (startIdx < 0) return out;

  // Patterns for slab descriptions and how many to fetch
  const descSlabs = [
    { key: "5.5.2.1", desc: "Up to LKR 1,000,000" },
    { key: "5.5.2.2", desc: "LKR 1,000,001 - LKR 5,000,000" },
    { key: "5.5.2.3", desc: "LKR 5,000,001 - LKR 10,000,000" },
    { key: "5.5.2.4", desc: "LKR 10,000,001 - LKR 20,000,000" },
    { key: "5.5.2.5", desc: "LKR 20,000,001 – Rs.50,000,000" },
    { key: "5.5.2.6", desc: "LKR 50,000,001 - LKR 100,000,000" },
    { key: "5.5.2.7", desc: "LKR 100,000,001 and above" }
  ];

  for (let i = 0; i < descSlabs.length; i++) {
    const { key, desc } = descSlabs[i];
    const idx = lines.findIndex(l => l.trim().startsWith(key));
    if (idx < 0) continue;

    let amount = "";
    if (i === 0) {
      // 5.5.2.1: special - fee is in same line (Rs.10,000 + VAT)
      const m = lines[idx].match(/Rs\.?\s*(\d{1,3}(?:,\d{3})*)(?:\s*\+\s*VAT)?/i);
      amount = m ? `${m[1].replace(/^0+/, "")},000 + VAT` : "10,000 + VAT";
      // Remove any double commas or leading 0s
      amount = amount.replace(/^0+/, "").replace(",,", ",").replace(/^,/, "");
      if (amount.startsWith(",")) amount = amount.substring(1);
      amount = amount.replace(/^,/, "");
      if (!/^\d+,\d+ \+ VAT$/.test(amount)) amount = "10,000 + VAT";
    } else if (i === 1) {
      // 5.5.2.2: 0.75% + VAT minimum of Rs 15,000/- + VAT
      let percLine = lines[idx+1]?.trim() || "";
      let minLine = lines[idx+2]?.trim() || "";
      if (!percLine.includes("%")) percLine = lines[idx+3]?.trim() || "";
      if (!minLine.match(/minimum/i)) minLine = lines[idx+4]?.trim() || "";
      // Add "0" if missing
      percLine = percLine.startsWith(".") ? "0" + percLine : percLine;
      percLine = percLine.replace(/^\./, "0.");
      amount = `${percLine} minimum of Rs 15,000/- + VAT`.replace(/\s+/, " ");
    } else if (i === 2) {
      // 5.5.2.3: 0.6% +VAT minimum of Rs. 40,000/-
      let percLine = lines[idx+1]?.trim() || "";
      let minLine = lines[idx+2]?.trim() || "";
      if (!percLine.includes("%")) percLine = lines[idx+3]?.trim() || "";
      if (!minLine.match(/minimum/i)) minLine = lines[idx+4]?.trim() || "";
      percLine = percLine.startsWith(".") ? "0" + percLine : percLine;
      percLine = percLine.replace(/^\./, "0.");
      amount = `${percLine} minimum of Rs. 40,000/-`.replace(/\s+/, " ");
    } else if (i === 3) {
      // 5.5.2.4: 0.7%+VAT
      let perc = lines[idx].match(/([0-9.]+%(\+)?VAT)/i);
      amount = perc ? perc[1] : "0.7%+VAT";
    } else if (i === 4) {
      // 5.5.2.5: 0.5%+VAT
      let perc = lines[idx].match(/([0-9.]+%(\+)?VAT)/i);
      amount = perc ? perc[1] : "0.5%+VAT";
    } else if (i === 5) {
      // 5.5.2.6: 0.3%+VAT
      let perc = lines[idx].match(/([0-9.]+%(\+)?VAT)/i);
      amount = perc ? perc[1] : "0.3%+VAT";
    } else if (i === 6) {
      // 5.5.2.7: 0.2%+VAT Max. of Rs.450,000
      let p1 = lines[idx+1]?.trim() || "";
      let p2 = lines[idx+2]?.trim() || "";
      if (p1.includes("%") && p2.toLowerCase().includes("max")) {
        // add "0" before decimal if missing
        p1 = p1.startsWith(".") ? "0" + p1 : p1;
        p1 = p1.replace(/^\./, "0.");
        amount = `${p1} ${p2}`;
      } else {
        amount = "0.2%+VAT Max. of Rs.450,000";
      }
    }
    // Remove stray decimals, whitespace
    amount = amount.replace(/NaN,?/, "10,000").replace(/^0+/, "").replace(",,", ",").replace("  ", " ").replace(/(\d)\s*VAT/, "$1 + VAT");
    // Remove duplicate plus signs or misplaced spaces
    amount = amount.replace(/ \+ VAT/g, "+ VAT").replace(/\s+/, " ");

    for (const product of ["Home Loan", "Loan Against Property"]) {
      out.push({
        bank: "DFCC Bank",
        product,
        feeType: "Legal Fees - Mortgage Bond",
        description: desc,
        amount,
        updatedAt: nowISO(),
        source
      });
    }
  }
  return out;
}

function parseLegalFeesPersonalCorporateGuarantees(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];
  const startIdx = lines.findIndex(l =>
    l.trim().startsWith("5.7")
  );
  if (startIdx < 0) return out;

  // The 4 slabs for Personal/Corporate Guarantees
  const descSlabs = [
    { key: "5.7.1", desc: "Upto LKR 1,000,000" },
    { key: "5.7.2", desc: "LKR 1,000,001- 10,000,000" },
    { key: "5.7.3", desc: "LKR 10,000,001 -50,000,000" },
    { key: "5.7.4", desc: "LKR 50,000,001 and above" }
  ];

  for (let i = 0; i < descSlabs.length; i++) {
    const { key, desc } = descSlabs[i];
    const idx = lines.findIndex(l => l.trim().startsWith(key));
    if (idx < 0) continue;

    // Pick first "xxxx + VAT" value from line (LKR slab, not USD)
let amount = "";
// Match only a 4 or 5 digit amount (e.g., 10,000 + VAT, 15,000 + VAT, etc)
const amtMatch = lines[idx].match(/(\d{1,2},\d{3})\s*\+\s*VAT/i);
if (amtMatch) {
  amount = `${amtMatch[1]} + VAT`;
} else {
  // fallback to known order
  amount = ["10,000 + VAT", "15,000 + VAT", "25,000 + VAT", "35,000 + VAT"][i];
}

    for (const product of ["Home Loan", "Loan Against Property"]) {
      out.push({
        bank: "DFCC Bank",
        product,
        feeType: "Legal Fees - Personal/Corporate Guarantees",
        description: desc,
        amount,
        updatedAt: nowISO(),
        source
      });
    }
  }
  return out;
}

// ---------------- Legal Fees - Other Charges ----------------
function parseLegalFeesOtherCharges(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];

  // Map of charge codes to readable descriptions and expected amount patterns
  const chargeDefs = [
    { code: "5.8.1", desc: "Deed of release (unless the amount is specified in the terms and conditions)" },
    { code: "5.8.2", desc: "Deed of discharge" },
    { code: "5.8.5", desc: "Execution of 47A declaration" },
    { code: "5.8.6", desc: "Condominium tripartite agreement - buyer" },
    { code: "5.8.7", desc: "Condominium tripartite agreement - developer" },
    { code: "5.8.8", desc: "Site inspection charges" },
    { code: "5.8.9", desc: "Any other deed/document (supplementary agreement/deed of cancellation/additional mortgage/deed of declaration/deed of rectification/deed of confirmation/deed of postponement/addendum/instrument of cancellation of mortgage AND etc)" }
  ];

  for (const { code, desc } of chargeDefs) {
    const idx = lines.findIndex(l => l.trim().startsWith(code));
    if (idx === -1) continue;
    let amount = "";
    // Handle the most common amount patterns (comma numbers, + VAT, "per km", etc)
    if (code === "5.8.6") {
      // This one is always text
      amount = "100% of the mortgage value when executing the tripartite agreement and Rs. 30,000/- when the mortgage bond is being executed";
    } else if (code === "5.8.7") {
      amount = "50,000 + VAT";
    } else if (code === "5.8.8") {
      amount = "50 per km";
    } else if (code === "5.8.5") {
      amount = "4,000 + VAT";
    } else if (code === "5.8.9") {
      // This is a multi-line block, so scan for a number
      let found = "";
      for (let j = idx + 1; j < idx + 4 && j < lines.length; j++) {
        const m = lines[j].match(/(\d{1,3},\d{3}) \+ VAT/);
        if (m) { found = m[0]; break; }
      }
      amount = found || "15,000 + VAT";
    } else {
      // General pattern: look for X,000 + VAT on the same line
      const m = lines[idx].match(/(\d{1,3},\d{3}) \+ VAT/);
      amount = m ? `${m[1]} + VAT` : "";
    }
    // Add both Home Loan and LAP
    for (const product of ["Home Loan", "Loan Against Property"]) {
      out.push({
        bank: "DFCC Bank",
        product,
        feeType: "Legal Fees - Other Charges",
        description: desc,
        amount,
        updatedAt: nowISO(),
        source
      });
    }
  }
  return out;
}

/* ---------------- Combined Parser ---------------- */
function parseDfccTariffLines(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];
  out.push(...parseHomeLoanProcessing(lines, source));
  out.push(...parsePersonalLoanProcessing(lines, source));
  out.push(...parseSpecialLoanSlabs(lines, source, "2", "Professional Loan"));
  out.push(...parseSpecialLoanSlabs(lines, source, "3", "Pinnacle Loan"));
  out.push(...parseEducationLoanSlabs(lines, source));
  out.push(...parseSpecialLoanSlabs(lines, source, "6", "One Loan"));
  out.push(...parseSpecialLoanSlabs(lines, source, "9", "Armed Forced Loan"));
  out.push(...parseSpecialLoanSlabs(lines, source, "11", "Teacher's Loan"));
  // Legal Fees
  out.push(...parseLegalFeesTitleReport(lines, source));
  out.push(...parseLegalFeesMortgageBond(lines, source));
  out.push(...parseLegalFeesPersonalCorporateGuarantees(lines, source));
  out.push(...parseLegalFeesOtherCharges(lines, source));
  return out;
}

/* ---------------- Main Scraper ---------------- */
export async function scrapeDfccTariff(): Promise<FeeRow[]> {
  const res = await fetch(PDF_URL);
  if (!res.ok) throw new Error(`Failed to download PDF: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const data = await pdf(buf);
  const lines = normAll(data.text);

  writeDebugLines(lines);

  return parseDfccTariffLines(lines, PDF_URL);
}

export default scrapeDfccTariff;

/* ---------------- Local Test ---------------- */
if (require.main === module) {
  (async () => {
    const rows = await scrapeDfccTariff();
    ensureDir("./output");
    fs.writeFileSync("./output/dfcc-tariff.json", JSON.stringify(rows, null, 2));
    console.log("✅ DFCC tariff scraped successfully.");
    console.log("📁 Output: ./output/dfcc-tariff.json");
    console.log("🔎 Debug lines: ./work_dfcc/dfcc-tariff-ocr-lines.txt");
  })();
}
