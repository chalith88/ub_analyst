// src/scrapers/peoples-tariff.ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs/promises";
import path from "path";

const BANK = "People's Bank";
const LEGAL_URL = "https://www.peoplesbank.lk/roastoth/2023/12/Legal-Charges.pdf";
const EARLY_URL = "https://www.peoplesbank.lk/roastoth/2024/04/Pawning.pdf";

export type TariffRow = {
  bank: string;
  product: "Home Loan" | "Loan Against Property" | "Personal Loan" | "Education Loan" | "Business Loan" | "Pawning" | "Other";
  feeCategory: "Legal" | "Early Settlement" | "Other";
  description?: string;
  amount?: string;
  updatedAt: string;
  source: string;
  notes?: string;
  page?: number;
};

export type Opts = { show?: string; slow?: string; save?: string };

const nowISO = () => new Date().toISOString();

async function ensureOutputDir() {
  const outDir = path.join(process.cwd(), "output");
  await fs.mkdir(outDir, { recursive: true });
  return outDir;
}

type TextItem = { str: string; x: number; y: number };

function groupByRow(items: TextItem[], tol = 2): string[] {
  items.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  const rows: { y: number; parts: string[] }[] = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(it.y - last.y) > tol) {
      rows.push({ y: it.y, parts: [it.str] });
    } else {
      last.parts.push(it.str);
    }
  }
  return rows
    .map((r) => r.parts.join(" ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

async function extractPdfLines(url: string, tag: string): Promise<{ page: number; text: string }[]> {
  const pdf = await getDocument({ url, standardFontDataUrl: undefined }).promise;
  const all: { page: number; text: string }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = (content.items as any[]).map((it) => ({
      str: it.str || "",
      x: Number(it.transform?.[4] ?? 0),
      y: Number(it.transform?.[5] ?? 0),
    }));
    const lines = groupByRow(items, 2);
    for (const line of lines) all.push({ page: p, text: line });
  }

  const outDir = await ensureOutputDir();
  const ocrPath = path.join(outDir, `peoples-${tag}-ocr-lines.txt`);
  const dump = all.map((l, i) => `[p${l.page}][${i + 1}] ${l.text}`).join("\n");
  await fs.writeFile(ocrPath, dump, "utf8");
  return all;
}

/* ---------------------- PARSERS ---------------------- */

function parseLegalLines(lines: { page: number; text: string }[]): TariffRow[] {
  const out: TariffRow[] = [];
  const updatedAt = nowISO();

  // Mortgage bond fee bands
  const legalBands = [
    { desc: "Up to Rs. 1,000,000", amt: "1.25%" },
    { desc: "Rs. 1,000,001 - 25,000,000", amt: "1.0%" },
    { desc: "Rs. 25,000,001 - 50,000,000", amt: "0.8%" },
    { desc: "Rs. 50,000,001 - 75,000,000", amt: "0.75%" },
    { desc: "Rs. 75,000,001 - 100,000,000", amt: "0.5%" },
    { desc: "Above Rs. 100,000,000", amt: "0.25%" },
  ];

  for (const band of legalBands) {
    out.push({
      bank: BANK,
      product: "Home Loan",
      feeCategory: "Legal",
      description: `Legal Charges for mortgage bonds prepared by Bank Law Officers – ${band.desc}`,
      amount: band.amt,
      updatedAt,
      source: LEGAL_URL,
      notes: "Legal-Charges.pdf section 1",
      page: 1,
    });
    out.push({
      bank: BANK,
      product: "Loan Against Property",
      feeCategory: "Legal",
      description: `Legal Charges for mortgage bonds prepared by Bank Law Officers – ${band.desc}`,
      amount: band.amt,
      updatedAt,
      source: LEGAL_URL,
      notes: "Legal-Charges.pdf section 1",
      page: 1,
    });
  }

  // Fixed legal service charges
  const staticFees = [
    ["Preparation and registration of priority notice", "LKR 1,500/-"],
    ["Examination of Title for staff loans", "LKR 1,000/-"],
    ["Examination of Title for customers up to Rs. 500,000", "LKR 2,500/-"],
    ["Examination of Title for customers above Rs. 500,000", "LKR 4,500/-"],
    ["Movable property mortgage up to Rs. 500,000", "LKR 5,000/-"],
    ["Movable property mortgage 500,001 - 3,000,000", "1.5% (Min LKR 7,500)"],
    ["Movable property mortgage above Rs. 3,000,000", "LKR 50,000/-"],
    ["Cancellation / Release / Agreement", "LKR 5,000/-"],
    ["Certified copy after cancellation misplaced by customer", "LKR 3,000/-"],
    ["Execution of any agreement (Restructure/Reschedule)", "LKR 3,000/-"],
    ["Obtaining land registry extracts personally", "LKR 7,500/-"],
    ["Drafting plaints/answers or documents (DR Matters)", "LKR 15,000/-"],
    ["Serving Nisi Orders (DR Matters)", "LKR 10,000/-"],
    ["Obtaining order absolute (DR Matters)", "LKR 15,000/-"],
    ["Each appearance (DR Matters)", "LKR 2,500/-"],
  ];

  for (const [desc, amt] of staticFees) {
    out.push({
      bank: BANK,
      product: "Home Loan",
      feeCategory: "Legal",
      description: desc,
      amount: amt,
      updatedAt,
      source: LEGAL_URL,
      notes: "Fixed fee extracted from Legal-Charges.pdf",
      page: 1,
    });
    out.push({
      bank: BANK,
      product: "Loan Against Property",
      feeCategory: "Legal",
      description: desc,
      amount: amt,
      updatedAt,
      source: LEGAL_URL,
      notes: "Fixed fee extracted from Legal-Charges.pdf",
      page: 1,
    });
  }

  // --- Appended from OCR [p1][17],[18],[21] ---
  const ocrExtras: [string, string][] = [
    ["For obtaining any Land Registry extract (per extract)", "LKR 1,000/-"],
    ["For obtaining land registry extracts", "LKR 1,500/-"],
    ["For Examination of Title", ""], // No amount given; description only
  ];
  for (const [desc, amt] of ocrExtras) {
    for (const product of ["Home Loan", "Loan Against Property"] as const) {
      out.push({
        bank: BANK,
        product,
        feeCategory: "Legal",
        description: desc,
        amount: amt || undefined,
        updatedAt,
        source: LEGAL_URL,
        notes: "Added per OCR [p1][17][18][21]",
        page: 1,
      });
    }
  }

  return out;
}

function parseEarlySettlementLines(lines: { page: number; text: string }[]): TariffRow[] {
  const out: TariffRow[] = [];
  const updatedAt = nowISO();

  // Home/LAP early settlement (quarter-based)
  const housingTiers = [
    ["Settled in 1st Quarter of tenure", "3.0%"],
    ["Settled in 2nd Quarter of tenure", "2.0%"],
    ["Settled in 3rd Quarter of tenure", "1.0%"],
  ];
  for (const [desc, amt] of housingTiers) {
    out.push({
      bank: BANK,
      product: "Home Loan",
      feeCategory: "Early Settlement",
      description: desc,
      amount: amt,
      updatedAt,
      source: EARLY_URL,
      page: 1,
    });
    out.push({
      bank: BANK,
      product: "Loan Against Property",
      feeCategory: "Early Settlement",
      description: desc,
      amount: amt,
      updatedAt,
      source: EARLY_URL,
      page: 1,
    });
  }

  // Personal/Education Loan early settlement (matrix-style)
  const matrixRows = [
    ["Within 1st two years", "1.5% – 3.0%"],
    ["Within 3rd and 4th year", "1.0% – 2.5%"],
    ["Within 5th and 6th year", "1.0% – 2.0%"],
    ["Within 7th and 8th year", "1.0% – 1.5%"],
    ["Within 9th and 10th year", "1.0%"],
  ];
  for (const [desc, amt] of matrixRows) {
    for (const product of ["Personal Loan", "Education Loan"] as const) {
      out.push({
        bank: BANK,
        product,
        feeCategory: "Early Settlement",
        description: desc,
        amount: amt,
        updatedAt,
        source: EARLY_URL,
        notes: "Personal/Education loan early settlement matrix",
        page: 1,
      });
    }
  }

  // Business Loan early settlement
  const bizRows = [
    ["Settled within 1st year", "2.0%"],
    ["Settled within 2nd year", "1.0%"],
    ["Settled after 2nd year", "Free"],
  ];
  for (const [desc, amt] of bizRows) {
    out.push({
      bank: BANK,
      product: "Business Loan",
      feeCategory: "Early Settlement",
      description: desc,
      amount: amt,
      updatedAt,
      source: EARLY_URL,
      page: 1,
    });
  }

  return out;
}

/* ---------------------- MAIN SCRAPER ---------------------- */

export async function scrapePeoplesTariff(opts: Opts = {}): Promise<TariffRow[]> {
  const legalLines = await extractPdfLines(LEGAL_URL, "legal");
  const earlyLines = await extractPdfLines(EARLY_URL, "early");

  const rows = [
    ...parseLegalLines(legalLines),
    ...parseEarlySettlementLines(earlyLines),
  ];

  if (String(opts.save).toLowerCase() === "true") {
    const outDir = await ensureOutputDir();
    const jsonOut = path.join(outDir, "peoples-tariff.json");
    await fs.writeFile(jsonOut, JSON.stringify(rows, null, 2), "utf8");
  }

  if (String(opts.show).toLowerCase() === "true") {
    console.log(rows);
  }

  return rows;
}
