// src/scrapers/amana.ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RateRow } from "../types";

const SRC =
  "https://www.amanabank.lk/pdf/tariff/advance-pricing-november-2024-english.pdf";
const BANK = "Amãna Bank";

const nowISO = () => new Date().toISOString();

function pctToken(s: string): string | undefined {
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return m ? `${m[1]}%` : undefined;
}

type TextItem = {
  str: string;
  x: number;
  y: number;
};

/** Group lines by y (with a small tolerance) so we can treat a row in the PDF as one line. */
function groupByRow(items: TextItem[], tol = 2): string[] {
  // sort by y then x
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
  return rows.map((r) => r.parts.join(" ").replace(/\s+/g, " ").trim());
}

/** Extract two % tokens on a row as [min,max] preserving on-page order */
function extractRangeFromRow(rowText: string): [string | undefined, string | undefined] {
  const matches = rowText.match(/([0-9]+(?:\.[0-9]+)?)\s*%/g) || [];
  if (matches.length >= 2) {
    return [pctToken(matches[0])!, pctToken(matches[1])!];
  }
  if (matches.length === 1) {
    const only = pctToken(matches[0]);
    return [only, only];
  }
  return [undefined, undefined];
}

function normalizeProduct(label: string): "Home Loan" | "Education Loan" | null {
  if (/Home\s*Financing/i.test(label)) return "Home Loan";
  if (/Education\s*Financing/i.test(label)) return "Education Loan";
  return null;
}

/** Fan-out helper: clones a row across 1..years with standardized labels. */
function fanOutYears(out: RateRow[], base: RateRow, years: number) {
  for (let y = 1; y <= years; y++) {
    out.push({
      ...base,
      tenureLabel: `${y} Year${y > 1 ? "s" : ""}`,
      tenureYears: y,
    });
  }
}

/** Build min/max base rows for a product (without tenure fan-out). */
function buildMinMaxRows(
  product: string,
  minRate?: string,
  maxRate?: string
): RateRow[] {
  const now = nowISO();
  const common = {
    bank: BANK,
    product,
    type: "Floating", // range presented; treat as floating band
    source: SRC,
    updatedAt: now,
  } as const;

  const rows: RateRow[] = [];
  if (minRate) {
    rows.push({
      ...common,
      tenureLabel: "Pricing Range",
      rateWithSalary: minRate,
      rateWithoutSalary: minRate,
      notes: "Minimum",
    } as RateRow);
  }
  if (maxRate) {
    rows.push({
      ...common,
      tenureLabel: "Pricing Range",
      rateWithSalary: maxRate,
      rateWithoutSalary: maxRate,
      notes: "Maximum",
    } as RateRow);
  }
  return rows;
}

export async function scrapeAmana(): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const pdf = await getDocument({ url: SRC, standardFontDataUrl: undefined }).promise;

  const page = await pdf.getPage(1);
  const content = await page.getTextContent();

  const items: TextItem[] = (content.items as any[]).map((it) => ({
    str: it.str as string,
    x: (it.transform?.[4] as number) ?? 0,
    y: (it.transform?.[5] as number) ?? 0,
  }));

  const rows = groupByRow(items);

  const collected: { [k in "Home Loan" | "Education Loan"]?: { min?: string; max?: string } } = {};

  for (const row of rows) {
    const prod = normalizeProduct(row);
    if (prod) {
      const [minRate, maxRate] = extractRangeFromRow(row);
      collected[prod] = { min: minRate, max: maxRate };
    }
  }

  // Defensive pass over coarse Y-buckets in case numbers were split across spans
  for (const want of ["Home Loan", "Education Loan"] as const) {
    if (!collected[want]?.min || !collected[want]?.max) {
      const yBuckets = new Map<number, string[]>();
      for (const it of items) {
        const key = Math.round(it.y);
        const arr = yBuckets.get(key) || [];
        arr.push(it.str);
        yBuckets.set(key, arr);
      }
      for (const [, parts] of yBuckets) {
        const line = parts.join(" ").replace(/\s+/g, " ").trim();
        const prod = normalizeProduct(line);
        if (prod === want) {
          const [minRate, maxRate] = extractRangeFromRow(line);
          collected[want] = { min: collected[want]?.min || minRate, max: collected[want]?.max || maxRate };
        }
      }
    }
  }

  // Build rows + fan-out years per product
  if (collected["Home Loan"]) {
    const { min, max } = collected["Home Loan"]!;
    const baseRows = buildMinMaxRows("Home Loan", min, max);
    for (const r of baseRows) fanOutYears(out, r, 20); // 1..20 years
  }
  if (collected["Education Loan"]) {
    const { min, max } = collected["Education Loan"]!;
    const baseRows = buildMinMaxRows("Education Loan", min, max);
    for (const r of baseRows) fanOutYears(out, r, 5); // 1..5 years
  }

  return out;
}
