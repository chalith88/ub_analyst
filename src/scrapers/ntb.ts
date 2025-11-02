// src/scrapers/ntb.ts
import type { RateRow } from "../types";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fetch from "node-fetch";

const SRC = "https://www.nationstrust.com/images/pdf/interest-rates.pdf";
const BANK = "Nations Trust Bank (NTB)";

const nowISO = () => new Date().toISOString();

function pctToken(s: string): string | undefined {
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return m ? `${m[1]}%` : undefined;
}
function extractRange(s: string): [string | undefined, string | undefined] {
  const m = s.match(
    /([0-9]+(?:\.[0-9]+)?)\s*%\s*[-–]\s*([0-9]+(?:\.[0-9]+)?)\s*%/
  );
  return m
    ? [`${m[1]}%`, `${m[2]}%`]
    : [pctToken(s), pctToken(s)];
}

type TxtItem = { str: string; transform: number[] }; // [a,b,c,d,e=x,f=y]

/** Group raw PDF items into visual lines by Y, and tokens by X within the line */
function groupLines(items: TxtItem[]) {
  const rows = new Map<number, { y: number; parts: { x: number; t: string }[] }>();
  for (const it of items) {
    const t = (it.str || "").trim();
    if (!t) continue;
    const x = (it.transform?.[4] ?? 0) as number;
    const y = (it.transform?.[5] ?? 0) as number;
    const key = Math.round(y); // 1px buckets
    const row = rows.get(key) ?? { y: key, parts: [] };
    row.parts.push({ x, t });
    rows.set(key, row);
  }
  const asc = Array.from(rows.values()).map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    const text = r.parts.map((p) => p.t).join(" ").replace(/\s+/g, " ").trim();
    return { y: r.y, text };
  });
  asc.sort((a, b) => a.y - b.y); // numeric ascending
  // Decide whether ascending y is visually top->bottom; if not, flip to descending.
  const iPL_asc = asc.findIndex((l) => /^Personal Loan$/i.test(l.text));
  const iHL_asc = asc.findIndex((l) => /^Housing Loan$/i.test(l.text));
  let lines = asc;
  if (iPL_asc !== -1 && iHL_asc !== -1 && iPL_asc > iHL_asc) {
    const desc = [...asc].reverse();
    lines = desc;
  }
  return lines.filter((l) => l.text.length > 0);
}

// helper to push with optional fan-out of tenureYears
function pushRow(
  out: RateRow[],
  base: Omit<RateRow, "updatedAt" | "source" | "bank"> & { tenureYears?: number },
  years?: number[]
) {
  const rows: RateRow[] = [];
  if (years && years.length) {
    for (const y of years) {
      rows.push({
        bank: BANK,
        source: SRC,
        updatedAt: nowISO(),
        notes: "Above 350K Net Salary customers",
        ...base,
        tenureYears: y,
      });
    }
  } else {
    rows.push({
      bank: BANK,
      source: SRC,
      updatedAt: nowISO(),
      notes: "Above 350K Net Salary customers",
      ...base,
    });
  }
  out.push(...rows);
}

export async function scrapeNTB(): Promise<RateRow[]> {
  const out: RateRow[] = [];

  // 1) Download PDF
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  const pdfData = new Uint8Array(await res.arrayBuffer());

  // 2) Parse with pdf.js
  const pdf = await getDocument({ data: pdfData }).promise;

  // 3) Page 4 contains "Loans"
  const page = await pdf.getPage(4);
  const textContent: any = await page.getTextContent();
  const items = textContent.items as TxtItem[];

  // 4) Build visual lines in correct reading order
  const lines = groupLines(items);

  // 5) Build anchor index
  type AnchorName = "personal" | "housing";
  const anchors: { idx: number; name: AnchorName }[] = [];
  lines.forEach((l, idx) => {
    if (/^Personal Loan$/i.test(l.text)) anchors.push({ idx, name: "personal" });
    if (/^Housing Loan$/i.test(l.text)) anchors.push({ idx, name: "housing" });
  });
  const sectionForIdx = (idx: number): AnchorName | null => {
    const prev = anchors.filter((a) => a.idx <= idx).sort((a, b) => b.idx - a.idx);
    return prev.length ? prev[0].name : null;
  };

  const rangeOnlyRe =
    /([0-9]+(?:\.[0-9]+)?)\s*%\s*[-–]\s*([0-9]+(?:\.[0-9]+)?)\s*%/;
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const base = lines[i].text;
    const m = base.match(rangeOnlyRe);
    if (!m) continue;

    // Build forward window (to catch labels split across lines)
    const chunk = [lines[i].text, lines[i + 1]?.text, lines[i + 2]?.text]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const rangeStr = `${m[1]}% - ${m[2]}%`;
    const after = chunk
      .slice(chunk.indexOf(m[0]) + m[0].length)
      .replace(/^[\s:：]+/, "");
    if (!after) continue;

    let labelRaw = after.replace(/^Loan\s*tenor\s*/i, "").trim();
    labelRaw = labelRaw.replace(/\s+/g, " ");
    if (/^Above$/i.test(labelRaw) && lines[i + 1]) {
      const nxt = lines[i + 1].text.trim();
      if (/^5\s*years\b/i.test(nxt)) labelRaw = `Above ${nxt}`;
    }

    // ---- explicit capture for Personal Loan Floating (fan-out 1..5) ----
    if (/Anytime\s+variable/i.test(labelRaw)) {
      const key = `PL|Floating|Anytime variable|${rangeStr}`;
      if (!seen.has(key)) {
        const [minR, maxR] = extractRange(rangeStr);
        pushRow(
          out,
          {
            product: "Personal Loan",
            type: "Floating",
            tenureLabel: "Anytime variable",
            rateWithSalary: minR,
            rateWithoutSalary: maxR || minR,
          },
          [1, 2, 3, 4, 5]
        );
        seen.add(key);
      }
      continue;
    }

    // Determine section by nearest header
    const section = sectionForIdx(i);
    if (!section) continue;

    // Normalize tenure labels
    let label = labelRaw;
    if (/^01\s*year\s*fixed/i.test(label)) label = "01 year fixed";
    else if (/^Up\s*to\s*5\s*years/i.test(label)) label = "Up to 5 years";
    else if (/^Above\s*5\s*years/i.test(label)) label = "Above 5 years";
    else if (/^05\s*year\s*fixed/i.test(label)) label = "05 year fixed";

    const [minR, maxR] = extractRange(rangeStr);
    if (!minR) continue;

    if (section === "personal") {
      if (label === "01 year fixed") {
        const key = `PL|Fixed|${label}|${rangeStr}`;
        if (!seen.has(key)) {
          pushRow(out, {
            product: "Personal Loan",
            type: "Fixed",
            tenureLabel: label,
            rateWithSalary: minR,
            rateWithoutSalary: maxR || minR,
          }, [1]);
          seen.add(key);
        }
      } else if (label === "Up to 5 years") {
        const key = `PL|Fixed|${label}|${rangeStr}`;
        if (!seen.has(key)) {
          pushRow(out, {
            product: "Personal Loan",
            type: "Fixed",
            tenureLabel: label,
            rateWithSalary: minR,
            rateWithoutSalary: maxR || minR,
          }, [2, 3, 4, 5]);
          seen.add(key);
        }
      } else if (label === "Above 5 years") {
        const key = `PL|Fixed|${label}|${rangeStr}`;
        if (!seen.has(key)) {
          pushRow(out, {
            product: "Personal Loan",
            type: "Fixed",
            tenureLabel: label,
            rateWithSalary: minR,
            rateWithoutSalary: maxR || minR,
          }, [6, 7]);
          seen.add(key);
        }
      }
    } else if (section === "housing") {
      if (label === "01 year fixed") {
        const key = `HL|Fixed|${label}|${rangeStr}`;
        if (!seen.has(key)) {
          pushRow(out, {
            product: "Home Loan",
            type: "Fixed",
            tenureLabel: label,
            rateWithSalary: minR,
            rateWithoutSalary: maxR || minR,
          }, [1]);
          seen.add(key);
        }
      } else if (label === "05 year fixed") {
        const key = `HL|Fixed|${label}|${rangeStr}`;
        if (!seen.has(key)) {
          pushRow(out, {
            product: "Home Loan",
            type: "Fixed",
            tenureLabel: label,
            rateWithSalary: minR,
            rateWithoutSalary: maxR || minR,
          }, [5]);
          seen.add(key);
        }
      }
    }
  }

  return out;
}
