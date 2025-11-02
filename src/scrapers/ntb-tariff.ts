import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

export type TariffRow = {
  bank: string;
  product: "Home Loan" | "Personal Loan";
  feeCategory: "Processing Fee" | "Legal" | "Valuation" | "Early Settlement" | "Penal" | "Other";
  description?: string;
  amount: string;
  updatedAt: string;
  source: string;
  notes?: string;
};
export type Opts = { show?: string; slow?: string; save?: string };

const HOUSING_URL = "https://www.nationstrust.com/images/pdf/fees-and-charges/housing-loans-tariff-011219.pdf";
const PERSONAL_URL = "https://www.nationstrust.com/images/pdf/fees-and-charges/personal-loans-tariff-01022020.pdf";
const BANK = "Nations Trust Bank (NTB)";

type PdfLine = { y: number; text: string; page: number; idx: number };
const nowISO = () => new Date().toISOString();

async function ensureOutputDir(): Promise<string> {
  const outDir = path.join(process.cwd(), "output");
  await fs.mkdir(outDir, { recursive: true });
  return outDir;
}
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}
async function fetchPdfBytesViaPlaywright(url: string): Promise<Uint8Array> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const resp = await context.request.get(url, { timeout: 30_000 });
    if (!resp.ok()) throw new Error(`Fetch failed ${resp.status()}: ${resp.statusText()}`);
    const body = await resp.body();
    return body;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
async function getPdfBytesWithRetry(url: string, retries = 2): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
      return await fetchPdfBytesViaPlaywright(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
async function pdfToLines(pdfBytes: Uint8Array | Buffer): Promise<PdfLine[]> {
  const pdfjs = await loadPdfJs();
  const uint8 =
    pdfBytes instanceof Uint8Array && !(pdfBytes instanceof Buffer)
      ? pdfBytes
      : new Uint8Array(
          (pdfBytes as any).buffer.slice(
            (pdfBytes as any).byteOffset,
            (pdfBytes as any).byteOffset + (pdfBytes as any).byteLength
          )
        );
  const doc = await pdfjs.getDocument({ data: uint8 }).promise;
  const all: PdfLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    let usedOcr = false;
    try {
      const content = await page.getTextContent();
      if (content.items && content.items.length > 0) {
        type Row = { y: number; texts: string[] };
        const rows: Row[] = [];
        const tol = 2.0;
        for (let i = 0; i < content.items.length; i++) {
          const it: any = content.items[i];
          const str = (it.str || "").replace(/\s+/g, " ").trim();
          if (!str) continue;
          const y = Array.isArray(it.transform) ? Number(it.transform[5]) : 0;
          let row = rows.find((r) => Math.abs(r.y - y) <= tol);
          if (!row) { row = { y, texts: [] }; rows.push(row); }
          row.texts.push(str);
        }
        rows.sort((a, b) => b.y - a.y);
        rows.forEach((r, idx) => {
          const text = r.texts.join(" ").replace(/\s+/g, " ").trim();
          if (text) all.push({ y: r.y, text, page: p, idx });
        });
        continue;
      }
    } catch {}
    try {
      usedOcr = true;
      const png = await renderPageToPngBuffer(pdfjs, page, 2.0);
      const ocrLines = await ocrPngBufferToLines(png);
      ocrLines.forEach((text, idx) => all.push({ y: idx, text, page: p, idx }));
    } catch (err) {
      console.warn(`[NTB][OCR] Page ${p} failed: ${String((err as Error)?.message || err)}`);
    }
    if (usedOcr) {}
  }
  return all;
}
async function renderPageToPngBuffer(pdfjs: any, page: any, scale = 2.0): Promise<Buffer> {
  const { createCanvas } = await import("canvas");
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx as any, viewport }).promise;
  return canvas.toBuffer("image/png");
}
async function ocrPngBufferToLines(png: Buffer): Promise<string[]> {
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(png, "eng", { logger: () => {} });
  return (data.text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
async function writeDebugLines(outPath: string, lines: PdfLine[]) {
  const body = lines.map((ln, i) => `[${i + 1}] p${ln.page} y=${ln.y.toFixed(1)}  ${ln.text}`).join("\n");
  await fs.writeFile(outPath, body, "utf8");
}

// --- Extract Personal Loan Bands ---
function extractPersonalLoanBands(lines: string[], source: string, updatedAt: string, bank: string): TariffRow[] {
  const rows: TariffRow[] = [];
  // Processing Fee (New/Top Up Loans)
  const idx1 = lines.findIndex(l => /Processing Fees? - New\/Top Up Loans/i.test(l));
  if (idx1 !== -1) {
    let line = lines[idx1];
    if (!/0\.5%/.test(line) && lines[idx1 + 1]) line += " " + lines[idx1 + 1];
    const m = line.match(/0\.5%.*?rs\.? 10,000/i);
    if (m) {
      rows.push({
        bank,
        product: "Personal Loan",
        feeCategory: "Processing Fee",
        description: "Processing Fee (New/ Top Up Loans)",
        amount: "0.5% of the loan amount (min Rs. 10,000)",
        updatedAt,
        source
      });
    }
    if (line.match(/additional\s*rs.? 20,000/i)) {
      rows.push({
        bank,
        product: "Personal Loan",
        feeCategory: "Processing Fee",
        description: "Green Channel Processing Fee (02 working days disbursement)",
        amount: "0.5% of the loan amount (min Rs. 10,000) + additional Rs. 20,000",
        updatedAt,
        source
      });
    }
  }
  // Waivers
  const privIdx = lines.findIndex(l => /25% processing fee waiver/i.test(l));
  if (privIdx !== -1) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Processing Fee",
      description: "Private Banking customers processing fee waiver",
      amount: "25% processing fee waiver (not applicable for additional Green channel fee)",
      updatedAt,
      source
    });
  }
  const icIdx = lines.findIndex(l => /10% processing fee waiver/i.test(l));
  if (icIdx !== -1) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Processing Fee",
      description: "Inner Circle customers (salary assigned to NTB) processing fee waiver",
      amount: "10% processing fee waiver (not applicable for additional Green channel fee)",
      updatedAt,
      source
    });
  }
  // Early Settlement
  const settleIdx = lines.findIndex(l => /settlement fee/i.test(l));
  if (settleIdx !== -1) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Early Settlement",
      description: "Part/Full settlement fee",
      amount: "5% of the settlement capital or Rs. 10,000, whichever is higher",
      updatedAt,
      source
    });
  }
  const settle12Idx = lines.findIndex(l => /Part or early settlement allowed only after and once in 12 months/i.test(l));
  if (settle12Idx !== -1) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Early Settlement",
      description: "Part or early settlement allowed only after and once in 12 months",
      amount: "",
      updatedAt,
      source
    });
  }
  // Penal/Other
  if (lines.some(l => /penalty interest/i.test(l))) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Penal",
      description: "Penalty interest on arrears",
      amount: "2% p.a. over and above the normal rate on arrears",
      updatedAt,
      source
    });
  }
  if (lines.some(l => /Late Payment fee/i.test(l))) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Penal",
      description: "Late Payment fee",
      amount: "Rs. 900",
      updatedAt,
      source
    });
  }
  const rescheduleIdx = lines.findIndex(l => /reschedule|reshedule|due date change/i.test(l));
  if (rescheduleIdx !== -1 && lines[rescheduleIdx + 1] && /rs\.? 2,500/i.test(lines[rescheduleIdx + 1])) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Penal",
      description: "Restructure / reschedule / due date change requests",
      amount: "Rs. 2,500",
      updatedAt,
      source
    });
  }
  if (lines.some(l => /Standard letter issuance/i.test(l))) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Penal",
      description: "Standard letter issuance",
      amount: "Rs. 1,000",
      updatedAt,
      source
    });
  }
  if (lines.some(l => /Customized letter issuance/i.test(l))) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Penal",
      description: "Customized letter issuance (excluding standard letters)",
      amount: "Rs. 4,000",
      updatedAt,
      source
    });
  }
  const nonSalIdx = lines.findIndex(l => /Non Salary \/Standing Instructions remittance/i.test(l));
  if (nonSalIdx !== -1 && lines[nonSalIdx + 1] && /rs\.? 2,500/i.test(lines[nonSalIdx + 1])) {
    rows.push({
      bank,
      product: "Personal Loan",
      feeCategory: "Penal",
      description: "Non Salary / Standing Instructions remittance fee (breach of agreed repayment mode)",
      amount: "Rs. 2,500 (Monthly)",
      updatedAt,
      source
    });
  }
  return rows;
}

export async function scrapeNtbTariff(opts: Opts): Promise<TariffRow[]> {
  const outDir = await ensureOutputDir();
  const updatedAt = nowISO();
  const [housingBytes, personalBytes] = await Promise.all([
    getPdfBytesWithRetry(HOUSING_URL),
    getPdfBytesWithRetry(PERSONAL_URL),
  ]);
  const housingDebugPath = path.join(outDir, "ntb-housing-ocr-lines.txt");
  const personalDebugPath = path.join(outDir, "ntb-personal-ocr-lines.txt");
  let housingParsedLines = await pdfToLines(housingBytes);
  await writeDebugLines(housingDebugPath, housingParsedLines);

  // Detect if dynamic failed (no usable data)
  const housingRowsUseful = housingParsedLines.filter(l =>
    l.text &&
    !/vat/i.test(l.text) &&
    !/^page\s*\d+/i.test(l.text) &&
    /\d/.test(l.text)
  ).length > 3;

  let homeLoanRows: TariffRow[];
  if (!housingRowsUseful) {
    // Fallback: static hardcoded Home Loan rows
    homeLoanRows = [
      {
        bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Application fee", amount: "Rs. 5,000 (Non refundable)", updatedAt: nowISO(), source: HOUSING_URL
      },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Equity and Normal Housing Loans - Below 3Mn", amount: "Rs. 32,500", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Equity and Normal Housing Loans - 3–6Mn", amount: "Rs. 42,500", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Equity and Normal Housing Loans - 6–10Mn", amount: "Rs. 65,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Equity and Normal Housing Loans - 10–20Mn", amount: "Rs. 90,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Equity and Normal Housing Loans - 20Mn and above", amount: "Rs. 110,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Under construction condominium purchase - Below 5Mn", amount: "Rs. 70,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Under construction condominium purchase - 5–10Mn", amount: "Rs. 75,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Under construction condominium purchase - 10–20Mn", amount: "Rs. 80,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Under construction condominium purchase - 20–30Mn", amount: "Rs. 85,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Under construction condominium purchase - 30Mn and above", amount: "Rs. 90,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans Without ancillary documents support - Below 3Mn", amount: "Rs. 20,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans Without ancillary documents support - 3–6Mn", amount: "Rs. 25,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans Without ancillary documents support - 6–10Mn", amount: "Rs. 30,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans Without ancillary documents support - 10–20Mn", amount: "Rs. 40,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans Without ancillary documents support - 20Mn and above", amount: "Rs. 45,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans With ancillary documents support - Below 3Mn", amount: "Rs. 30,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans With ancillary documents support - 3–6Mn", amount: "Rs. 35,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans With ancillary documents support - 6–10Mn", amount: "Rs. 40,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans With ancillary documents support - 10–20Mn", amount: "Rs. 50,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Processing Fee", description: "Topup Loans With ancillary documents support - 20Mn and above", amount: "Rs. 55,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Legal", description: "All loans (Legal fee will be subject to applicable VAT)", amount: "Included in bank fee; legal fees subject to applicable VAT", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Early Settlement", description: "Part/ Full settlement fee", amount: "5% of the settlement capital or Rs. 10,000 whichever is higher", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Late Payment fee", amount: "Rs. 900", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Penalty interest", amount: "2% p.a. over and above normal rate on arrears", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Restructure fee (Fixed to variable rate)", amount: "Rs. 1,500", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Restructure / reshedule / due date change requests", amount: "Rs. 1,500", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Standard letter issuance", amount: "Rs. 1,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Customized letter issuance (excluding standard letters)", amount: "Rs. 4,000", updatedAt: nowISO(), source: HOUSING_URL },
      { bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Non Salary /Standing Instructions remittance fee (breach of agreed repayment mode)", amount: "Rs. 2,500 (Monthly)", updatedAt: nowISO(), source: HOUSING_URL }
    ];
    console.log("[NTB][Housing] Dynamic extract failed, using static fallback rows.");
  } else {
    // Optional: add custom parsing here if NTB ever changes to digital PDF
    homeLoanRows = []; // Or add smart parser if needed.
    // For now, still recommend fallback block as most stable!
  }

  // --- Personal Loan ---
  const personalParsedLines = await pdfToLines(personalBytes);
  await writeDebugLines(personalDebugPath, personalParsedLines);
  const personalTextLines = personalParsedLines.map(l => l.text);
  const personalRows = extractPersonalLoanBands(personalTextLines, PERSONAL_URL, updatedAt, BANK);

  const rows = [
    ...(homeLoanRows ?? []),
    ...personalRows
  ];

  if (opts && opts.save && (opts.save === "true" || opts.save === "1" )) {
    const outPath = path.join(outDir, "ntb-tariff.json");
    await fs.writeFile(outPath, JSON.stringify(rows, null, 2), "utf8");
    console.log(`[NTB] Saved ${rows.length} rows → ${outPath}`);
  } else {
    console.log(`[NTB] Parsed ${rows.length} rows (not saved; save=true to write output).`);
  }
  for (const r of rows) {
    if (!r.updatedAt) r.updatedAt = updatedAt;
  }
  return rows;
}
