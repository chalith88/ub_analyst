// src/scrapers/nsb-tariff.ts

import fs from "fs";

const BANK = "NSB";
const SOURCE_URL = "https://www.nsb.lk/wp-content/uploads/2022/08/New-Fee-Based-Income.pdf";
const OCR_FILE = "./output/nsb-tariff-ocr-lines.txt";

/** Utility: Clean OCR lines */
function cleanLine(line: string): string {
  return line.replace(/^\[\d+\]\s*/, "").trim();
}

export async function scrapeNSBTariff() {
  const lines = fs
    .readFileSync(OCR_FILE, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let rows: any[] = [];

  // --- 1. Legal Fees - Rental / Lease Agreement ---
  for (let i = 0; i < lines.length; ++i) {
    if (/Legal fees for Rental \/ Lease Agreement/i.test(cleanLine(lines[i]))) {
      let description = cleanLine(lines[i]);
      let j = i + 1;
      while (
        j < lines.length &&
        !/Rs\.?/i.test(cleanLine(lines[j])) &&
        !/Deed of Postponement/i.test(cleanLine(lines[j]))
      ) {
        description += " " + cleanLine(lines[j]);
        j++;
      }
      let amount = "";
      if (j < lines.length && /Rs\.?/i.test(cleanLine(lines[j]))) {
        amount = cleanLine(lines[j]).match(/Rs\.?\s?[\d,\/\-]+/)?.[0] || "";
      }
      while (
        j < lines.length &&
        /agreement\)/i.test(cleanLine(lines[j]))
      ) {
        description += " " + cleanLine(lines[j]);
        j++;
      }
      description = description.replace(/\s+/g, " ").trim();
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Legal Fees - Rental / Lease Agreement",
        description,
        amount,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
      break;
    }
  }

  // --- 2. Legal Fees - Deed of Postponement ---
  for (let i = 0; i < lines.length; ++i) {
    if (/Deed of Postponement/i.test(cleanLine(lines[i]))) {
      let description = cleanLine(lines[i]);
      let j = i + 1;
      while (
        j < lines.length &&
        !/Rs\.?/i.test(cleanLine(lines[j])) &&
        !/B\)/i.test(cleanLine(lines[j]))
      ) {
        description += " " + cleanLine(lines[j]);
        j++;
      }
      let amount = "";
      if (j < lines.length && /Rs\.?/i.test(cleanLine(lines[j]))) {
        amount = cleanLine(lines[j]).match(/Rs\.?\s?[\d,\/\-]+/)?.[0] || "";
      }
      while (
        j < lines.length &&
        /agreement\)/i.test(cleanLine(lines[j]))
      ) {
        description += " " + cleanLine(lines[j]);
        j++;
      }
      description = description.replace(/\s+/g, " ").trim();
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Legal Fees - Deed of Postponement",
        description,
        amount,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
      break;
    }
  }

  // --- 3. Processing Fees - CRIB Report (Home/Personal/Education Loan) ---
  for (let i = 0; i < lines.length; ++i) {
    if (/Charges on CRIB report/i.test(cleanLine(lines[i]))) {
      for (let j = 1; j <= 3 && i + j < lines.length; ++j) {
        const subLine = cleanLine(lines[i + j]);
        if (/retail/i.test(subLine)) {
          const amountMatch = subLine.match(/Rs\.?\s?[\d,]+/i);
          if (amountMatch) {
            let amount = amountMatch[0].replace(/\s+/g, "");
            if (!amount.endsWith("/-")) amount += "/-";
            ["Home Loan", "Personal Loan", "Education Loan"].forEach((product) =>
              rows.push({
                bank: BANK,
                product,
                feeType: "Processing Fees - CRIB Report",
                description: "CRIB report processing fee (Retail)",
                amount,
                updatedAt: new Date().toISOString(),
                source: SOURCE_URL,
              })
            );
          }
        }
      }
      break;
    }
  }

  // --- 4. Early Settlement Charges (Home/Personal/Education Loan) ---
  for (let i = 0; i < lines.length; ++i) {
    if (/Early settlement charges/i.test(cleanLine(lines[i]))) {
      const line = cleanLine(lines[i]);
      const percMatch = line.match(/(\d+\.\d+)%/);
      const amount = percMatch ? percMatch[0] : "5.00%";
      ["Home Loan", "Personal Loan", "Education Loan"].forEach((product) =>
        rows.push({
          bank: BANK,
          product,
          feeType: "Early Settlement Charges",
          description: "Early settlement charges",
          amount,
          updatedAt: new Date().toISOString(),
          source: SOURCE_URL,
        })
      );
      break;
    }
  }

// --- 5. General Fees - Home Loan (Correct: Rs. 3,000/- per year) ---
for (let i = 0; i < lines.length; ++i) {
  // Look for "Obtaining deed settling of the housing loan"
  if (/Obtaining deed settling of the housing loan/i.test(cleanLine(lines[i]))) {
    let description = cleanLine(lines[i]);
    let amount = "";
    // Check next 4 lines for "Rs." and "per year"
    for (let j = i; j < i + 4 && j < lines.length; ++j) {
      const curr = cleanLine(lines[j]);
      if (/Rs\./.test(curr) && /per year/i.test(curr)) {
        // Prefer full phrase "Rs. 3,000/- per year"
        amount = curr.match(/Rs\.?\s?[\d,]+\/-?\s*per year/i)?.[0]
          || curr.match(/Rs\.?\s?[\d,]+.*per year/i)?.[0]
          || curr;
        break;
      } else if (/Rs\./.test(curr) && !amount) {
        // fallback if "per year" not found
        amount = curr.match(/Rs\.?\s?[\d,]+/)?.[0] || "";
      }
      if (/months/i.test(curr)) {
        description += " " + curr;
      }
    }
    description = description.replace(/\s+/g, " ").trim();
    rows.push({
      bank: BANK,
      product: "Home Loan",
      feeType: "General Fees",
      description,
      amount,
      updatedAt: new Date().toISOString(),
      source: SOURCE_URL,
    });
  }
  // Not obtaining loan in full (logic unchanged)
  if (/Not obtaining loan in full/i.test(cleanLine(lines[i]))) {
    let description = cleanLine(lines[i]);
    let amount = description.match(/Rs\..*$/)?.[0] || "";
    if (!amount && i + 1 < lines.length) {
      amount = cleanLine(lines[i + 1]).match(/Rs\..*$/)?.[0] || "";
    }
    description = description.replace(amount, "").trim();
    rows.push({
      bank: BANK,
      product: "Home Loan",
      feeType: "General Fees",
      description,
      amount,
      updatedAt: new Date().toISOString(),
      source: SOURCE_URL,
    });
  }
}

  // --- 6. Legal Fees - Deed of Release (Fix Rs. 4,500 and Rs. 9,000) ---
  for (let i = 0; i < lines.length; ++i) {
    // Corrected: scan for Rs. 4,500 and Rs. 9,000 only at the right lines
    if (/Loan Balance upto/i.test(cleanLine(lines[i])) && /Rs\.\s?4,500/.test(cleanLine(lines[i]))) {
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Legal Fees - Deed of Release",
        description: "Loan Balance upto Rs. 1 Mn",
        amount: "Rs. 4,500",
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
    }
    if (/Loan balance above Rs\.?1 Mn/i.test(cleanLine(lines[i])) && /Rs\.\s?9,000/.test(cleanLine(lines[i]))) {
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Legal Fees - Deed of Release",
        description: "Loan balance above Rs.1 Mn",
        amount: "Rs. 9,000",
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
    }
  }

  // --- 7. Processing Fees - Government Housing Loan ---
  for (let i = 0; i < lines.length; ++i) {
    if (/Government Housing Loan Processing Fee/i.test(cleanLine(lines[i]))) {
      const amount = cleanLine(lines[i]).match(/Rs\..*?\/-?/)?.[0] || "";
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Processing Fees - Government Housing Loan",
        description: "",
        amount,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
    }
  }

  // --- 8. Processing Fees (Upto/Above 2.5Mn) ---
  for (let i = 0; i < lines.length; ++i) {
    const l = cleanLine(lines[i]);
    if (/Upto Rs\./.test(l) && /Actual Cost/i.test(l)) {
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Processing Fees",
        description: "Upto Rs. 2,500,000/ ",
        amount: "Actual Cost",
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
    }
    if (/Above Rs\./.test(l) && /0\.5% of the loan/i.test(l + lines[i + 1])) {
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Processing Fees",
        description: "Above Rs. 2,500,000/ ",
        amount: "0.5% of the loan amount",
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
    }
  }

  // --- 9. Legal Fees - Cancellation of Mortgage bond ---
  for (let i = 0; i < lines.length; ++i) {
    if (/Cancellation of Mortgage bond/i.test(cleanLine(lines[i]))) {
      let description = cleanLine(lines[i]);
      let amount = "";
      for (let j = i; j <= i + 2 && j < lines.length; ++j) {
        const amtLine = cleanLine(lines[j]);
        if (/Rs\./.test(amtLine)) {
          amount = amtLine.match(/Rs\..*?[\d,\/\-]+/)?.[0] || "";
        }
      }
      description = description.replace(/Rs\..*$/, "").trim();
      rows.push({
        bank: BANK,
        product: "Home Loan",
        feeType: "Legal Fees",
        description,
        amount,
        updatedAt: new Date().toISOString(),
        source: SOURCE_URL,
      });
    }
  }

  // --- 10. Processing Fees - Express (Home Loan: 4 days & 10 days, matches with or without dash and with extra spaces) ---
for (let i = 0; i < lines.length; ++i) {
  const l = cleanLine(lines[i]);
  // Robustly match: 4 days Rs. 50,000/ - or 10 days Rs. 20,000/ - (with/without dash)
  const expressMatch = l.match(/(4 days|10 days)\s*-?\s*Rs\.?\s?[\d,]+\/\s*-\s*/i);
  if (expressMatch) {
    // Description: "4 days" or "10 days"
    const desc = expressMatch[1];
    // Extract the full amount (allow for spaces and dash): e.g. Rs. 50,000/ -
    const amtMatch = l.match(/Rs\.?\s?[\d,]+\/\s*-\s*/i);
    const amt = amtMatch ? amtMatch[0].replace(/\s+/g, " ").replace(/-/, "-") : "";
    rows.push({
      bank: BANK,
      product: "Home Loan",
      feeType: "Processing Fees - Express",
      description: desc.trim(),
      amount: amt.trim(),
      updatedAt: new Date().toISOString(),
      source: SOURCE_URL,
    });
  }
}

  // --- 11. Processing Fees - Express (Personal Loan) (FIX: Accurate Amounts) ---
let note = "";
for (let i = 0; i < lines.length; ++i) {
  if (/Personal Loan related/i.test(cleanLine(lines[i]))) {
    // Find the note (Service Charges line)
    for (let j = i + 1; j < i + 10 && j < lines.length; ++j) {
      if (/Service Charges for Personal Loan Including/i.test(cleanLine(lines[j]))) {
        note = cleanLine(lines[j]);
        for (let k = j + 1; k < j + 6 && k < lines.length; ++k) {
          note += " " + cleanLine(lines[k]);
          if (/Gurantors/i.test(cleanLine(lines[k]))) break;
        }
        break;
      }
    }
    // Now extract each band
    for (let j = i + 1; j < i + 20 && j < lines.length; ++j) {
      const l = cleanLine(lines[j]);
      let description = "";
      let amount = "";
      // Upto Rs. 1 Mn Rs. 5,000/ -
      if (/Upto Rs\. 1 Mn/i.test(l)) {
        description = "Upto Rs. 1 Mn";
        amount = l.match(/Rs\.\s?\d{1,3}(,\d{3})*\/\s?-?/)?.[0].replace(/\s?-\s?$/, "") || "";
      }
      // from Rs. 1,000,001 to Rs. 3 Mn Rs. 8,500/ -
      if (/from Rs\. 1,000,001 to Rs\. 3 Mn/i.test(l)) {
        description = "from Rs. 1,000,001 to Rs. 3 Mn";
        amount = l.match(/Rs\.\s?\d{1,3}(,\d{3})*\/\s?-?/)?.[0].replace(/\s?-\s?$/, "") || "";
      }
      // Above Rs. 3,000,001 Rs. 10,000/ -
      if (/Above Rs\. 3,000,001/i.test(l)) {
        description = "Above Rs. 3,000,001";
        amount = l.match(/Rs\.\s?\d{1,3}(,\d{3})*\/\s?-?/)?.[0].replace(/\s?-\s?$/, "") || "";
      }
      if (description && amount) {
        rows.push({
          bank: BANK,
          product: "Personal Loan",
          feeType: "Processing Fees",
          note: note.trim(),
          description,
          amount,
          updatedAt: new Date().toISOString(),
          source: SOURCE_URL,
        });
      }
    }
    break;
  }
}

  // ----------- Output -----------
  return {
    bank: BANK,
    count: rows.length,
    debugFile: OCR_FILE,
    ambiguous: 0,
    rows,
  };
}

// ---------------- EXPRESS ROUTE ----------------
/*
  In your server.ts:
    import { scrapeNSBTariff } from "./scrapers/nsb-tariff";
    app.get("/scrape/nsb-tariff", async (req, res) => {
      try {
        const result = await scrapeNSBTariff();
        if (req.query.save === "true") {
          fs.writeFileSync("./output/nsb-tariff.json", JSON.stringify(result, null, 2));
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message || err });
      }
    });
*/

export default scrapeNSBTariff;
