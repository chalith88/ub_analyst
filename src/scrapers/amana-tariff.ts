// src/scrapers/amana-tariff.ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs/promises";
import path from "path";

const SRC =
  "https://www.amanabank.lk/pdf/tariff/advance-pricing-november-2024-english.pdf";
const BANK = "Amãna Bank";

export type TariffRow = {
  bank: string;
  product: "Home Loan" | "Education Loan";
  feeCategory: "Processing Fee";
  description: string;
  amount: string;
  updatedAt: string;
  source: string;
  notes?: string;
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

/** Normalize “LKR 1,250/ - to LKR 7,000/ -” → “LKR 1,250 - LKR 7,000” */
function normalizeLkrRange(s: string): string | null {
  const cleaned = s
    .replace(/\s*\/\s*-\s*/g, "")       // remove "/ -"
    .replace(/\s*to\s*/gi, " - ")       // "to" -> " - "
    .replace(/\s+/g, " ")
    .trim();
  // Try to capture two LKR amounts
  const m = cleaned.match(/LKR\s*([\d,]+).*?-\s*LKR\s*([\d,]+)/i);
  if (m) return `LKR ${m[1]} - LKR ${m[2]}`;
  // Fallback: single LKR amount (rare here)
  const one = cleaned.match(/LKR\s*([\d,]+)/i);
  if (one) return `LKR ${one[1]}`;
  return null;
}

export async function scrapeAmanaTariff(opts: Opts = {}): Promise<TariffRow[]> {
  const pdf = await getDocument({ url: SRC, standardFontDataUrl: undefined }).promise;

  const allLines: { page: number; text: string }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = (content.items as any[]).map((it) => ({
      str: (it.str ?? "").toString(),
      x: Number(it.transform?.[4] ?? 0),
      y: Number(it.transform?.[5] ?? 0),
    }));
    const lines = groupByRow(items, 2);
    for (const ln of lines) allLines.push({ page: p, text: ln });
  }

  // Dump OCR lines (for traceability)
  const outDir = await ensureOutputDir();
  const ocrPath = path.join(outDir, "amana-tariff-ocr-lines.txt");
  const dump = allLines.map((l, i) => `[p${l.page}][${i + 1}] ${l.text}`).join("\n");
  await fs.writeFile(ocrPath, dump, "utf8");

  const rows: TariffRow[] = [];
  const updatedAt = nowISO();

  // --- Education Loan (amount appears BEFORE description) ---
  // Expecting lines:
  // [p1][9]  LKR 1,250/ - to LKR 7,000/ -
  // [p1][10] Small Asset /Education /Travel / Solar /Women
  for (let i = 0; i < allLines.length; i++) {
    const cur = allLines[i];
    const nxt = allLines[i + 1];

    // line contains the amount range
    if (/\bLKR\b.*\bto\b.*\bLKR\b/i.test(cur.text)) {
      const norm = normalizeLkrRange(cur.text);
      if (norm && nxt && /Small\s*Asset\s*\/?\s*Education\s*\/?\s*Travel\s*\/?\s*Solar\s*\/?\s*Women/i.test(nxt.text)) {
        rows.push({
          bank: BANK,
          product: "Education Loan",
          feeCategory: "Processing Fee",
          description: "Processing Fee - Education Loan",
          amount: norm, // "LKR 1,250 - LKR 7,000"
          updatedAt,
          source: SRC,
          notes: "Paired amount-first OCR lines p1[9] + p1[10]",
        });
        break; // only one row expected
      }
    }
  }

  // --- Home Loan (amount embedded in same line) ---
  // [p1][11] Home Financing LKR 2,500/ - to LKR 35,000/ - .
  const homeLine = allLines.find((l) => /Home\s*Financing/i.test(l.text) && /\bLKR\b/i.test(l.text));
  if (homeLine) {
    const norm = normalizeLkrRange(homeLine.text);
    if (norm) {
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeCategory: "Processing Fee",
        description: "Home Financing",
        amount: norm, // "LKR 2,500 - LKR 35,000"
        updatedAt,
        source: SRC,
        notes: "Single-line OCR match p1[11]",
      });
    }
  }

  // Optional save
  if (String(opts.save).toLowerCase() === "true") {
    const jsonOut = path.join(outDir, "amana-tariff.json");
    await fs.writeFile(jsonOut, JSON.stringify(rows, null, 2), "utf8");
  }

  return rows;
}
