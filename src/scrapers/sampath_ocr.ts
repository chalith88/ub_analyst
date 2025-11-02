import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

type OcrLine = { text: string; y: number; x: number };
type Item = {
  bank: string;
  product: string;
  type: string;
  tenureYears?: number;
  tenureLabel?: string;
  rateWithSalary?: string;
  rateWithoutSalary?: string;
  source: string;
  updatedAt: string;
  notes?: string;
  evidence?: string; // short text slice that contained the rate
};

function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    p.on("close", code => resolve({ code: code ?? 0 }));
    p.on("error", reject);
  });
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

/** ---------- OCR pipeline (Poppler -> Tesseract) ---------- */
async function ocrToLines(pdfPath: string, workDir: string): Promise<OcrLine[]> {
  await ensureDir(workDir);
  const base = path.join(workDir, "sampath");
  const { code: ppmCode } = await run("pdftoppm", ["-png", "-r", "300", pdfPath, base]);
  if (ppmCode !== 0) throw new Error("pdftoppm failed");

  const files = (await fs.readdir(workDir)).filter(f => /^sampath-\d+\.png$/i.test(f)).sort();
  if (files.length === 0) throw new Error("No PNG pages produced");

  const words: OcrLine[] = [];
  for (const f of files) {
    const png = path.join(workDir, f);
    const out = png.replace(/\.png$/i, "");
    const { code: tCode } = await run("tesseract", [png, out, "--psm", "6", "-l", "eng", "tsv"]);
    if (tCode !== 0) throw new Error("tesseract failed");
    const tsvPath = `${out}.tsv`;
    const tsv = await fs.readFile(tsvPath, "utf8");

    const rows = tsv.split(/\r?\n/).slice(1).map(line => line.split("\t"));
    for (const cols of rows) {
      const text = (cols[11] || "").trim();
      if (!text) continue;
      const left = Number(cols[6] || 0);
      const top = Number(cols[7] || 0);
      words.push({ text, x: left, y: top });
    }
  }

  // Merge words into rows by Y proximity
  words.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: OcrLine[] = [];
  const Y_TOL = 6;
  let bucket: OcrLine[] = [];

  const flush = () => {
    if (!bucket.length) return;
    const text = bucket.sort((a,b)=>a.x-b.x).map(b => b.text).join(" ");
    lines.push({
      text: text.replace(/\s+%/g, "%").replace(/\s+/g, " ").trim(),
      y: bucket[0].y,
      x: bucket[0].x
    });
    bucket = [];
  };

  for (const w of words) {
    if (!bucket.length || Math.abs(bucket[0].y - w.y) <= Y_TOL) bucket.push(w);
    else { flush(); bucket = [w]; }
  }
  flush();
  return lines.filter(l => l.text.length > 0);
}

/** ---------- Utilities ---------- */
function joinText(lines: OcrLine[], start = 0, end?: number) {
  const slice = lines.slice(start, end ?? lines.length);
  return slice.map(l => l.text).join(" ");
}
function firstPercent(s: string): { rate: string; evidence: string } | null {
  const m = s.match(/(\d{1,2}(?:[.,]\d{1,2})?)%/);
  if (!m) return null;
  return { rate: m[1].replace(",", ".") + "%", evidence: s.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40) };
}
function makeYears(a: number, b: number) { const out: number[] = []; for (let y=a; y<=b; y++) out.push(y); return out; }

/** Find index of a line that matches a regex (case-insensitive). */
function findIdx(lines: OcrLine[], re: RegExp) {
  return lines.findIndex(l => re.test(l.text));
}

/** ---------- Extractors (no hardcoded rates) ---------- */

/** Extract Sevana Fixed bands within the Sevana section window. */
function extractSevanaFixed(lines: OcrLine[], source: string, debug: any[]): Item[] {
  const out: Item[] = [];

  // Find "Sevana" section start
  const sevanaHeaderIdx = findIdx(lines, /(Sev[ao]na|Sevena)\s*Housing\s*Loans/i);
  if (sevanaHeaderIdx === -1) {
    debug.push({ section: "Sevana Fixed", reason: "header not found" });
    return out;
  }

  // Determine window end = next big heading (e.g., Overdraft/Leasing/Consumption)
  let end = lines.length;
  for (let i = sevanaHeaderIdx + 1; i < lines.length; i++) {
    const t = lines[i].text;
    if (/All\s*Other\s*Consumption|Overdraft|Leasing|Pawning/i.test(t)) { end = i; break; }
  }

  const winText = joinText(lines, sevanaHeaderIdx, end);

  // Try to capture each band inside window
  const bands = [
    { label: "1-3 Years", yrs: [1,3] as [number,number] },
    { label: "4-5 Years", yrs: [4,5] as [number,number] },
    { label: "6-7 Years", yrs: [6,7] as [number,number] },
    { label: "8-10 Years", yrs: [8,10] as [number,number] },
  ];
  let foundAny = false;

  for (const b of bands) {
    // Find a local line that contains the label and rate nearby
    const labelRe = new RegExp(`${b.label.replace(/-/g, "[-–]")}`, "i");
    const labelIdx = lines.slice(sevanaHeaderIdx, end).findIndex(l => labelRe.test(l.text));
    if (labelIdx !== -1) {
      const absIdx = sevanaHeaderIdx + labelIdx;
      const localText = joinText(lines, absIdx, Math.min(end, absIdx + 6)); // a few lines after label
      const p = firstPercent(localText);
      if (p) {
        foundAny = true;
        for (const y of makeYears(b.yrs[0], b.yrs[1])) {
          out.push({
            bank: "Sampath Bank",
            product: "Home Loan",
            type: "Fixed",
            tenureYears: y,
            tenureLabel: b.label,
            rateWithSalary: p.rate,
            source,
            updatedAt: new Date().toISOString(),
            notes: "Sevana (Fixed)",
            evidence: p.evidence
          });
        }
        continue;
      }
    }
    // fallback: search the entire sevana window but still no hardcode; if not found, skip
    const p2 = firstPercent(winText);
    if (p2 && !foundAny) {
      // only use if no other band found; but it may be wrong band—better to skip than mislabel
      debug.push({ section: "Sevana Fixed", label: b.label, reason: "rate not found near label; skipped" });
    } else {
      debug.push({ section: "Sevana Fixed", label: b.label, reason: "label not found; skipped" });
    }
  }

  if (!foundAny) {
    debug.push({ section: "Sevana Fixed", reason: "no bands extracted in Sevana window" });
  }
  return out;
}

/** Extract Sevana Floating: strictly forward from the “Floating” row. */
function extractSevanaFloating(lines: OcrLine[], source: string, debug: any[]): Item[] {
  const out: Item[] = [];
  const idx = findIdx(lines, /(Sev[ao]na|Sevena).*Floating/i);
  if (idx === -1) {
    debug.push({ section: "Sevana Floating", reason: "floating row not found" });
    return out;
  }
  const local = joinText(lines, idx, Math.min(lines.length, idx + 10));
  const p = firstPercent(local);
  if (!p) {
    debug.push({ section: "Sevana Floating", reason: "no % found after floating row" });
    return out;
  }
  // Bank does not specify tenure split for floating; add a single representative row or expand as needed.
  out.push({
    bank: "Sampath Bank",
    product: "Home Loan",
    type: "Floating",
    tenureYears: 1,
    tenureLabel: "Sevana Housing Loans (LKR) - Floating",
    rateWithSalary: p.rate,
    source,
    updatedAt: new Date().toISOString(),
    notes: "Sevana (Floating)",
    evidence: p.evidence
  });
  return out;
}

/** AOCL (Secured/Unsecured) with strictly bounded windows. */
function extractAOCL(lines: OcrLine[], source: string, debug: any[]): Item[] {
  const out: Item[] = [];
  const startSec = findIdx(lines, /All\s*Other\s*Consumption\s*Loans.*Secured/i);
  if (startSec !== -1) {
    let end = lines.length;
    for (let i = startSec + 1; i < lines.length; i++) {
      if (/Unsecured|Overdraft|Pawning|Leasing/i.test(lines[i].text)) { end = i; break; }
    }
    const secText = joinText(lines, startSec, end);
    const p = firstPercent(secText);
    if (p) {
      for (const y of makeYears(1, 5)) {
        out.push({
          bank: "Sampath Bank",
          product: "LAP",
          type: "Floating",
          tenureYears: y,
          tenureLabel: "All Other Consumption Loans (Secured Facilities)",
          rateWithSalary: p.rate,
          rateWithoutSalary: p.rate,
          source,
          updatedAt: new Date().toISOString(),
          notes: "All Other Consumption Loans · Secured (max 5 years)",
          evidence: p.evidence
        });
      }
    } else {
      debug.push({ section: "AOCL Secured", reason: "no % inside secured window" });
    }
  } else {
    debug.push({ section: "AOCL Secured", reason: "secured heading not found" });
  }

  const startUn = findIdx(lines, /All\s*Other\s*Consumption\s*Loans.*Unsecured/i);
  if (startUn !== -1) {
    const unText = joinText(lines, startUn, Math.min(lines.length, startUn + 25));
    const p = firstPercent(unText);
    if (p) {
      for (const y of makeYears(1, 5)) {
        out.push({
          bank: "Sampath Bank",
          product: "Personal Loan",
          type: "Floating",
          tenureYears: y,
          tenureLabel: "All Other Consumption Loans (Unsecured Facilities)",
          rateWithoutSalary: p.rate,
          source,
          updatedAt: new Date().toISOString(),
          notes: "All Other Consumption Loans · Unsecured (max 5 years)",
          evidence: p.evidence
        });
      }
    } else {
      debug.push({ section: "AOCL Unsecured", reason: "no % inside unsecured window" });
    }
  } else {
    debug.push({ section: "AOCL Unsecured", reason: "unsecured heading not found" });
  }

  return out;
}

/** Optional: Education / Professionals / Medical — strictly parse (no hardcodes). Skip if not found. */
function extractLabeledProduct(lines: OcrLine[], source: string, labelRe: RegExp, product: Item["product"], tenureMax: number, notes: string, debug: any[]): Item[] {
  const out: Item[] = [];
  const idx = findIdx(lines, labelRe);
  if (idx === -1) { debug.push({ section: notes, reason: "heading not found" }); return out; }
  const txt = joinText(lines, idx, Math.min(lines.length, idx + 25));
  const p = firstPercent(txt);
  if (!p) { debug.push({ section: notes, reason: "no % found near heading" }); return out; }
  for (const y of makeYears(1, tenureMax)) {
    out.push({
      bank: "Sampath Bank",
      product,
      type: "Floating",
      tenureYears: y,
      tenureLabel: lines[idx].text,
      rateWithSalary: p.rate,
      source,
      updatedAt: new Date().toISOString(),
      notes,
      evidence: p.evidence
    });
  }
  return out;
}

/** ---------- MAIN ---------- */
export async function scrapeSampath_OCR(pdfUrl: string, outputPath: string) {
  const workDir = path.join(process.cwd(), ".work_sampath");
  await ensureDir(workDir);

  // Download
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`);
  const arr = new Uint8Array(await res.arrayBuffer());
  const pdfPath = path.join(workDir, "sampath.pdf");
  await fs.writeFile(pdfPath, arr);

  // OCR to structured lines
  const lines = await ocrToLines(pdfPath, workDir);

  // Build output (only from what’s actually found)
  const debug: any[] = [];
  const out: Item[] = [];

  out.push(
    ...extractSevanaFixed(lines, pdfUrl, debug),
    ...extractSevanaFloating(lines, pdfUrl, debug),
    ...extractAOCL(lines, pdfUrl, debug),

    // Strict-parse the other labeled products (no hardcode; will skip if not found)
    ...extractLabeledProduct(lines, pdfUrl, /Loan\s*Scheme\s*for\s*Medical\s*Officers/i, "Personal Loan", 7, "Loan Scheme for Medical Officers — applies up to 7 years", debug),
    ...extractLabeledProduct(lines, pdfUrl, /Personal\s*Loans\s*for\s*Professionals/i, "Personal Loan", 7, "Personal Loans for Professionals — applies up to 7 years", debug),
    ...extractLabeledProduct(lines, pdfUrl, /Study\s*Smart\s*Education\s*Loan/i, "Education Loan", 8, "Study Smart Education Loan — applies up to 8 years", debug)
  );

  // Write results
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, JSON.stringify(out, null, 2), "utf8");

  // Write debug (what was missing / why)
  await fs.writeFile(path.join(workDir, "_debug.json"), JSON.stringify({ missing: debug, sampleLines: lines.slice(0, 60) }, null, 2), "utf8");

  console.log(`✅ Sampath OCR finished.
  Output: ${outputPath}
  Items: ${out.length}
  Debug: ${path.join(workDir, "_debug.json")}
`);
}
