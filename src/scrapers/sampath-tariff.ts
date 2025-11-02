import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// ----------- Interface -----------
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

// ----------- Constants -----------
const PDF_URL = "https://www.sampath.lk/common/credit/credit_charges.pdf";
const nowISO = () => new Date().toISOString();

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function normSpaces(s: string) { return s.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").trim(); }
function normAll(txt: string) { return txt.split(/\r?\n+/).map(normSpaces).filter(Boolean); }

// ----------- System commands -----------
function execOk(cmd: string, args: string[], opts?: { cwd?: string }) {
  const out = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (out.error) throw out.error;
  if (out.status !== 0) throw new Error(`${cmd} failed: ${out.stderr || out.stdout}`);
  return out;
}

function pdfToImages(pdfPath: string, outDir: string, dpi = 300): string[] {
  const outPrefix = path.join(outDir, "page");
  execOk("pdftoppm", ["-r", String(dpi), "-png", pdfPath, outPrefix]);
  return fs.readdirSync(outDir)
    .filter(f => /^page-\d+\.png$/i.test(f))
    .map(f => path.join(outDir, f))
    .sort((a, b) => Number(a.match(/-(\d+)\.png$/)![1]) - Number(b.match(/-(\d+)\.png$/)![1]));
}

function ocrImageToText(pngPath: string): string {
  const base = pngPath.replace(/\.png$/i, "");
  execOk("tesseract", [
    pngPath, base, "-l", "eng", "--oem", "1", "--psm", "4", // <-- PSM 4 for table OCR!
    "-c", "preserve_interword_spaces=1"
  ]);
  return fs.readFileSync(base + ".txt", "utf8");
}

/* ---------------- parsing ---------------- */
function parseSampathTariffLines(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];

  // Dump OCR for further debugging
  try {
    ensureDir("./work_sampath");
    fs.writeFileSync(
      "./work_sampath/sampath-tariff-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("Dumped OCR lines to work_sampath/sampath-tariff-ocr-lines.txt");
  } catch {}

  /* --- 1) Personal Loan → Processing fee "Up to Rs. 500,000" --- */
  for (let i = 0; i < lines.length - 1; ++i) {
    if (/personal\s*loans?/i.test(lines[i])) {
      const next = lines[i + 1] || "";
      const descMatch = next.match(/Up to Rs\.?\s*[\d,\.]+\/?-?/i) || next.match(/Up to Rs\.?\s*[\d,\.]+/i);
      const amtMatch = next.match(/\d{1,3}(?:,\d{3})*\/-/);
      if (descMatch && amtMatch) {
        out.push({
          bank: "Sampath Bank",
          product: "Personal Loan",
          feeType: "Processing fee",
          description: descMatch[0].replace(/\s+/g, " ").replace(/\/-$/,'').trim(),
          amount: amtMatch[0].replace(/\s+/g, "").trim(),
          updatedAt: nowISO(),
          source,
        });
        break; // only first Personal Loan processing row
      }
    }
  }

  // --- Personal Loan: Processing Fee Additional Slabs [11]-[14], but skip Samachara/Review Charges [38]-[41] ---
  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i].replace(/\s+/g, " ").trim();

    // Lookback 2 lines for exclusion clues
    const prev1 = (lines[i - 1] || "").toLowerCase();
    const prev2 = (lines[i - 2] || "").toLowerCase();
    const shouldSkip = prev1.includes("samachara loan scheme") ||
                       prev2.includes("samachara loan scheme") ||
                       prev1.includes("review charges for") ||
                       prev2.includes("review charges for");

    if (shouldSkip) continue;

    // Rs. 500,001 — 1,000,000 10,000/-
    let m = line.match(/^(Rs\.?\s*\d[\d,]*\s*[—-]\s*\d[\d,]*)(?:\s*\|)?\s*(\d{1,3}(?:,\d{3})*\/-)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }

    // Rs. 1,000,001- 5,000,000 20,000/-
    m = line.match(/^(Rs\.?\s*\d[\d,]*-+\s*\d[\d,]*)(?:\s*\|)?\s*(\d{1,3}(?:,\d{3})*\/-)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }

    // Rs.5,000,001- 10,000,000 | 25,000/- OR Rs.5,000,001- 10,000,000 25,000/-
    m = line.match(/^(Rs\.?\s*\d[\d,]*-+\s*\d[\d,]*)(?:\s*\|)?\s*(\d{1,3}(?:,\d{3})*\/-)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }

    // Above 10.0 Mn 0.25%
    m = line.match(/^(Above\s*\d+\.?\d*\s*Mn)\s*(0\.\d+\s*%)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }
  }

  /* --- 3) Home Loan & LAP → Handling fee (lines 149–151) --- */
  for (let i = 0; i < lines.length - 1; ++i) {
    const ln = lines[i].replace(/\s+/g, " ").trim().toLowerCase();
    if (/handling fee of\s*rs\.?\s*5,?000\/-\s*per property\s*plus/.test(ln)) {
      const raw1 = lines[i] || "";
      const raw2 = lines[i + 1] || "";
      const raw3 = lines[i + 2] || "";
      const headNote = (raw1.replace(/.*handling fee of\s*rs\.?\s*5,?000\/-\s*per property\s*plus/i, "") || "").trim();
      const note = [headNote, raw2.trim(), raw3.trim()]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      ["Home Loan", "Loan Against Property"].forEach(product => {
        out.push({
          bank: "Sampath Bank",
          product,
          feeType: "Handling fee",
          description: "per property",
          amount: "5,000/-",
          notes: note,
          updatedAt: nowISO(),
          source,
        });
      });
      break;
    }
  }

  /* --- 4) Sevana loans → Legal fee (Bond value slabs) for Home Loan & LAP (lines 165–170) --- */
  for (let i = 0; i < lines.length; ++i) {
    if (/sevana\s+loans/i.test(lines[i])) {
      const bondVal = lines[i + 1] || ""; // "- Bond value 1.0%"
      const slab1 = lines[i + 2] || "";   // "Up to Rs 1,000,000/- (Rs. 1.0Mn) 0.75%"
      const slab2 = lines[i + 3] || "";   // "Rs 1,000,001/- — 5,000,000/- 0.50%"
      const slab3 = lines[i + 4] || "";   // "Rs 5,000,001/- — 10,000,000/- 0.25%"
      const slab4 = lines[i + 5] || "";   // "Over Rs 10,000,001/-"

      // Tripartite note lines [171-175]
      const noteBlock = [
        lines[i + 6] || "",
        lines[i + 7] || "",
        lines[i + 8] || "",
        lines[i + 9] || "",
        lines[i + 10] || "",
      ]
        .map(s => s.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const hasTripartite = /\btripartite\b/i.test(noteBlock);
      const tripartiteNote = hasTripartite ? noteBlock : undefined;

      const getPct = (line: string) => {
        const m = line.match(/(\d+(?:\.\d+)?)\s*%/);
        return m ? `${m[1]}%` : "";
      };

      const addBothProducts = (description: string, amount: string) => {
        ["Home Loan", "Loan Against Property"].forEach(product => {
          out.push({
            bank: "Sampath Bank",
            product,
            feeType: "Legal fee",
            description,
            amount,
            notes: tripartiteNote,
            updatedAt: nowISO(),
            source,
          });
        });
      };

      // Slab 1: Use Bond value line for 1.0%
      addBothProducts("Up to Rs 1,000,000/- (Rs. 1.0Mn)", getPct(bondVal));
      // Slab 2: Use slab1 for 0.75%
      addBothProducts("Rs 1,000,001/- — 5,000,000/-", getPct(slab1));
      // Slab 3: Use slab2 for 0.50%
      addBothProducts("Rs 5,000,001/- — 10,000,000/-", getPct(slab2));
      // Slab 4: Use slab3 for 0.25%
      addBothProducts("Over Rs 10,000,001/-", getPct(slab3));

      break; // only process once
    }
  }

  /* --- 5) Premature Settlement / Part Settlement Table (Dynamic, via OCR) --- */
  for (let i = 0; i < lines.length; ++i) {
    // Find start of the settlement table (header)
    if (/3\.5 Premature.*Loan outstanding at the time of the settlement/i.test(lines[i])) {
      // Look for 'Personal', 'Commercial', 'Housing' rows within next 10 lines
      for (let j = i + 1; j < Math.min(i + 12, lines.length); ++j) {
        const line = lines[j].replace(/\s+/g, " ").trim();

        // Personal Loan row
        let m = line.match(/^Personal\s+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)/i);
        if (m) {
          const slabs = [
            "Loan o/s 100%-75%",
            "Less than 75% - up to 50%",
            "Less than 50% - up to 25%",
            "Loan o/s less than 25%",
          ];
          for (let k = 0; k < 4; ++k) {
            out.push({
              bank: "Sampath Bank",
              product: "Personal Loan",
              feeType: "Premature settlement or part settlement",
              description: slabs[k],
              amount: m[k + 1],
              updatedAt: nowISO(),
              source,
            });
          }
        }

        // Housing (applies to both Home Loan and Loan Against Property)
        m = line.match(/^Housing\s+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)/i);
        if (m) {
          const slabs = [
            "Loan o/s 100%-75%",
            "Less than 75% - up to 50%",
            "Less than 50% - up to 25%",
            "Loan o/s less than 25%",
          ];
          for (let k = 0; k < 4; ++k) {
            ["Home Loan", "Loan Against Property"].forEach(product => {
              out.push({
                bank: "Sampath Bank",
                product,
                feeType: "Premature settlement or part settlement",
                description: slabs[k],
                amount: m[k + 1],
                updatedAt: nowISO(),
                source,
              });
            });
          }
        }
      }
      break; // Process only the first table found
    }
  }

  return out;
}

/* ---------------- main ---------------- */
export async function scrapeSampathTariff(): Promise<FeeRow[]> {
  const tmpDir = path.join(os.tmpdir(), "sampath-tariff");
  ensureDir(tmpDir);

  // Download PDF locally for pdftoppm
  const res = await fetch(PDF_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${PDF_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const pdfPath = path.join(tmpDir, "credit_charges.pdf");
  fs.writeFileSync(pdfPath, buf);

  // Render & OCR
  let combined = "";
  try {
    const images = pdfToImages(pdfPath, tmpDir, 300);
    for (const img of images) {
      combined += ocrImageToText(img) + "\n";
    }
  } catch (err) {
    throw new Error(`OCR pipeline failed (ensure 'pdftoppm' and 'tesseract' are installed): ${String(err)}`);
  }

  // Save raw OCR for debugging (optional)
  try {
    fs.writeFileSync(path.join(tmpDir, "ocr_output.txt"), combined, "utf8");
  } catch {}

  // Normalize → parse
  const lines = normAll(combined);
  return parseSampathTariffLines(lines, PDF_URL);
}

export default scrapeSampathTariff;
