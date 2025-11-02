import fs from "fs";

const BANK = "Union Bank of Colombo";
const SOURCE = "https://www.unionb.com/wp-content/uploads/2025/09/UBC-Retail-Tariff-22.09.2025_English.pdf";

const PRODUCT_MAP: Record<string, string> = {
  "personal loan": "Personal Loan",
  "personal loans": "Personal Loan",
  "home loan+": "Home Loan+",
  "home loan": "Home Loan",
  "home loans": "Home Loan",
  "housing loan": "Home Loan",
  "housing loans": "Home Loan",
  "mortgage loan": "Home Loan",
  "mortgage loans": "Home Loan",
  "loan against property": "Loan Against Property",
  "loan against properties": "Loan Against Property",
  "education loan": "Education Loan",
  "education loans": "Education Loan",
};

const SECTION_BREAK_REGEX = /^1[23]\.\d{2}/i;
const AMOUNT_PREFIX_REGEX = /^(LKR ?[\d,\.]+|USD ?[\d,\.]+|[\d,\.]+%)/i;
const AMOUNT_ANYWHERE_REGEX = /(LKR ?[\d,\.]+|USD ?[\d,\.]+|[\d,\.]+%)/i;
const BAND_REGEX = /^(below|above|up to|over|from|between|less than|lkr\b)/i;
const HEADING_REGEX = /(processing fees?|application fee|express processing|green channel|legal fees?|penalty|valuation)/i;

interface FeeRow {
  bank: string;
  product: string;
  feeCategory: string;
  description: string;
  amount: string;
  notes?: string;
  updatedAt: string;
  source: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const normalizeLabel = (label: string) => clean(label.replace(/^([a-z]\)|[ivx]+\)|\d+\.)\s*/i, "").replace(/\b1[23]\.\d{2}\b/g, ""));
const stripTrailingReferences = (amount: string) => {
  const withoutRefs = amount.replace(/\b1[23]\.\d{2}\b/g, "");
  const normalized = clean(withoutRefs).replace(/\s+%/g, "%");
  return clean(normalized);
};

// --- loader with line number support ---
function loadTariffLines(filename: string): string[] {
  return fs
    .readFileSync(filename, "utf-8")
    .split(/\r?\n/)
    .map((line) => {
      // Remove [123] if present
      const m = line.match(/^\[(\d+)\]\s*(.*)$/);
      return m ? m[2] : line;
    })
    .map((line) => clean(line))
    .filter(Boolean);
}

function extractProduct(line: string): string | undefined {
  const lower = line.toLowerCase();
  for (const [keyword, product] of Object.entries(PRODUCT_MAP)) {
    if (lower.includes(keyword)) return product;
  }
  return undefined;
}

function deriveProductsFromHeading(line: string, fallbackProducts: string[]): string[] {
  const lower = line.toLowerCase();

  if (/loan against property/.test(lower)) {
    return ["Loan Against Property"];
  }

  if (/housing loan|home loan|mortgage loan/.test(lower)) {
    return ["Home Loan", "Home Loan+"];
  }

  const extracted = extractProduct(line);
  if (extracted) return [extracted];

  return [...fallbackProducts];
}

function deriveHeading(line: string, fallbackProducts: string[]): { products: string[]; feeCategory: string } {
  const lower = line.toLowerCase();
  const products = deriveProductsFromHeading(line, fallbackProducts);

  const inlineAmount = splitAmountAnywhere(line);
  let feeCategory = normalizeLabel(inlineAmount?.prefix ? inlineAmount.prefix : line);

  if (/application fee at the time of lodgement/.test(lower)) {
    return { products: ["Home Loan", "Home Loan+", "Loan Against Property"], feeCategory: "Application Fee" };
  }

  if (/penalty fees applicable/i.test(lower)) {
    return { products: ["Personal Loan", "Home Loan", "Home Loan+", "Loan Against Property"], feeCategory: "Early Settlement Fees" };
  }

  if (/green channel/.test(lower) && /processing/.test(lower)) {
    return { products, feeCategory: "Processing Fees - Green Channel" };
  }

  return { products, feeCategory };
}

function splitAmount(line: string): { amount: string; rest?: string; note?: string } | null {
  const match = line.match(AMOUNT_PREFIX_REGEX);
  if (!match) return null;

  const amountToken = clean(match[0]);
  let remainderRaw = line.slice(match[0].length);
  let rest: string | undefined;
  let note: string | undefined;

  if (remainderRaw) {
    const lowerRaw = remainderRaw.toLowerCase();
    const keywords = ["below", "above", "up to", "over", "from", "between", "less than", "lkr"];
    let keywordIndex: number | undefined;

    for (const keyword of keywords) {
      let searchStart = 0;
      while (searchStart < lowerRaw.length) {
        const idx = lowerRaw.indexOf(keyword, searchStart);
        if (idx === -1) break;

        const prefixSlice = remainderRaw.slice(0, idx);
        const prefixMeaningful = prefixSlice.replace(/^[\s:/\-–]+/, "").trim();
        const prefixTrimmed = prefixSlice.trim();
        const acceptable = !prefixMeaningful.length || /\)$/.test(prefixTrimmed);

        if (acceptable && (keywordIndex === undefined || idx < keywordIndex)) {
          keywordIndex = idx;
          break;
        }

        searchStart = idx + keyword.length;
      }
    }

    if (keywordIndex !== undefined) {
      if (keywordIndex === 0) {
        rest = clean(remainderRaw);
        remainderRaw = "";
      } else {
        rest = clean(remainderRaw.slice(keywordIndex));
        remainderRaw = remainderRaw.slice(0, keywordIndex);
      }
    } else if (SECTION_BREAK_REGEX.test(remainderRaw)) {
      rest = clean(remainderRaw);
      remainderRaw = "";
    }
  }

  let remainder = clean(remainderRaw);

  if (!rest && /non refundable|reimbursement|upon|customer|penalty|subject/i.test(remainder)) {
    note = remainder;
    remainder = "";
  }

  const amount = stripTrailingReferences(clean(`${amountToken} ${remainder}`)).replace(/ \/-/g, "/-");
  return { amount, rest, note };
}

function splitAmountAnywhere(line: string): { amount: string; note?: string; prefix?: string } | null {
  const match = line.match(AMOUNT_ANYWHERE_REGEX);
  if (!match || match.index === undefined) return null;

  const amountToken = clean(match[0]);
  const prefix = clean(line.slice(0, match.index));
  let remainder = clean(line.slice(match.index + match[0].length));
  let note: string | undefined;

  if (remainder && /non refundable|reimbursement|upon|customer|penalty|subject/i.test(remainder) && !/Min|Max|Flat|per|%|Mn/i.test(remainder)) {
    note = remainder;
    remainder = "";
  }

  const amount = stripTrailingReferences(clean(`${amountToken} ${remainder}`));
  return { amount, note, prefix };
}

function splitPenaltyAmount(line: string): { amount: string; rest?: string; note?: string } | null {
  const match = line.match(AMOUNT_PREFIX_REGEX);
  if (!match) return null;

  let remainder = clean(line.slice(match[0].length));
  let rest: string | undefined;
  let note: string | undefined;

  const nextDescriptions = [
    "Part Settlement Penalty",
    "Penalty interest on arrears payments",
  ];

  for (const desc of nextDescriptions) {
    const idx = remainder.indexOf(desc);
    if (idx >= 0) {
      rest = clean(remainder.slice(idx));
      remainder = clean(remainder.slice(0, idx));
      break;
    }
  }

  if (!rest && /classification:/i.test(remainder)) {
    const idx = remainder.indexOf("Classification:");
    note = clean(remainder.slice(idx));
    remainder = clean(remainder.slice(0, idx));
  }

  const amount = stripTrailingReferences(clean(`${match[0]} ${remainder}`));
  return { amount, rest, note };
}

type BandEntry = { description: string; amount: string; note?: string };

function parseBandEntries(lines: string[]): BandEntry[] {
  const queue = [...lines];
  const entries: BandEntry[] = [];
  let description: string | null = null;

  for (let i = 0; i < queue.length; i++) {
    const line = queue[i];
    if (!line) continue;

    if (!AMOUNT_PREFIX_REGEX.test(line)) {
      const inline = splitAmountAnywhere(line);
      if (inline) {
        const prefix = inline.prefix ? clean(inline.prefix) : "";
        const labelSource = prefix.length ? prefix : description || "";
        const isPercentageAmount = /%/.test(inline.amount) || /\bflat\b/i.test(inline.amount) || /\bper\b/i.test(inline.amount);

        if (!isPercentageAmount && BAND_REGEX.test(prefix)) {
          const composite = clean(`${prefix} ${inline.amount}`);
          description = composite;
          continue;
        }

        const label = normalizeLabel(labelSource);
        entries.push({ description: label, amount: inline.amount, note: inline.note });
        description = null;
        continue;
      }

      description = description ? clean(`${description} ${line}`) : line;
      continue;
    }

    const amountInfo = splitAmount(line);
    if (!amountInfo) continue;

    const label = normalizeLabel(description || "");
    entries.push({ description: label, amount: amountInfo.amount, note: amountInfo.note });
    description = null;

    if (amountInfo.rest) {
      queue.splice(i + 1, 0, amountInfo.rest);
    }
  }

  return entries;
}

function parseLegalEntries(lines: string[]): { mortgage: BandEntry[]; panel: BandEntry[] } {
  const mortgage: BandEntry[] = [];
  const panel: BandEntry[] = [];
  let current = mortgage;
  let pendingDesc: string | null = null;

  const setDescription = (raw: string) => {
    const trimmed = clean(raw.replace(/^\W+/, ""));
    if (!trimmed) return;
    if (/^panel lawyer charges:?/i.test(trimmed)) {
      current = panel;
      pendingDesc = normalizeLabel(trimmed);
      return;
    }
    pendingDesc = normalizeLabel(trimmed);
  };

  const pushEntry = (amountRaw: string) => {
    if (!pendingDesc) return;
    current.push({ description: pendingDesc, amount: stripTrailingReferences(clean(amountRaw)) });
    pendingDesc = null;
  };

  const amountStartRegex = /\d+(?:\.\d+)?\s?%/;
  const nextDescriptionPattern = /\b(Up to|From|Between|Above|Over|Less than|Panel Lawyer Charges:?|LKR\.?|LKR\s)/i;

  for (const rawLine of lines) {
    let segment = clean(rawLine);
    if (!segment) continue;

    while (segment.length) {
      const amountMatch = segment.match(amountStartRegex);
      if (!amountMatch || amountMatch.index === undefined) {
        setDescription(segment);
        break;
      }

      const prefix = segment.slice(0, amountMatch.index);
      if (prefix.trim()) {
        setDescription(prefix);
      }

      const startIdx = amountMatch.index;
      const afterTokenIdx = startIdx + amountMatch[0].length;
      const remainder = segment.slice(afterTokenIdx);
      let cutoff = remainder.length;
      const descRegex = new RegExp(nextDescriptionPattern.source, "gi");
      let searchIndex = 0;
      while (searchIndex < remainder.length) {
        descRegex.lastIndex = searchIndex;
        const match = descRegex.exec(remainder);
        if (!match || match.index === undefined) break;
        const candidate = remainder.slice(0, match.index);
        const opens = (candidate.match(/\(/g) || []).length;
        const closes = (candidate.match(/\)/g) || []).length;
        if (opens > closes) {
          searchIndex = match.index + match[0].length;
          continue;
        }
        cutoff = match.index;
        break;
      }

      const amountText = clean(segment.slice(startIdx, afterTokenIdx + cutoff));
      pushEntry(amountText);

      segment = remainder.slice(cutoff);
    }
  }

  return { mortgage, panel };
}

function buildPenaltyRows(baseLines: string[], now: string): FeeRow[] {
  const idx = baseLines.findIndex((line) => /penalty fees applicable for personal, housing loans and loan against property/i.test(line));
  if (idx === -1) return [];

  const block: string[] = [];
  for (let j = idx + 1; j < baseLines.length; j++) {
    const line = baseLines[j];
    if (SECTION_BREAK_REGEX.test(line)) break;
    if (HEADING_REGEX.test(line) && extractProduct(line)) break;
    block.push(line);
  }

  const queue = [...block];
  const entries: BandEntry[] = [];
  let description: string | null = null;

  for (let k = 0; k < queue.length; k++) {
    const line = queue[k];

    if (/^confidential$/i.test(line)) {
      if (entries.length) {
        const last = entries[entries.length - 1];
        if (!last.note || !/confidential/i.test(last.note)) {
          last.note = last.note ? `${last.note} Confidential` : "Confidential";
        }
      }
      continue;
    }

    const amountInfo = splitPenaltyAmount(line);

    if (amountInfo) {
      if (description) {
        entries.push({ description: normalizeLabel(description), amount: amountInfo.amount, note: amountInfo.note });
        description = null;
      }

      if (amountInfo.rest) {
        queue.splice(k + 1, 0, amountInfo.rest);
      }

      continue;
    }

    description = line;
  }

  const products = ["Personal Loan", "Home Loan", "Home Loan+", "Loan Against Property"];
  const rows: FeeRow[] = [];

  for (const entry of entries) {
    for (const product of products) {
      rows.push({
        bank: BANK,
        product,
        feeCategory: "Early Settlement Fees",
        description: entry.description,
        amount: entry.amount,
        notes: entry.note,
        updatedAt: now,
        source: SOURCE,
      });
    }
  }

  return rows;
}

function buildLegalRows(baseLines: string[], now: string): FeeRow[] {
  const rows: FeeRow[] = [];
  const start = baseLines.findIndex((line) => /legal fees for mortgage over immovable property/i.test(line));
  if (start === -1) return rows;

  const legalProducts = ["Home Loan", "Home Loan+", "Loan Against Property"];

  const block: string[] = [];
  let idx = start + 1;
  while (idx < baseLines.length) {
    const line = baseLines[idx];
    if (!line) {
      idx++;
      continue;
    }
    if (/^in house title clearance charge/i.test(line)) break;
    if (SECTION_BREAK_REGEX.test(line) || (HEADING_REGEX.test(line) && extractProduct(line))) break;
    block.push(line);
    idx++;
  }

  const legalSections = parseLegalEntries(block);
  for (const entry of legalSections.mortgage) {
    for (const product of legalProducts) {
      rows.push({
        bank: BANK,
        product,
        feeCategory: "Legal fees for Mortgage over Immovable Property",
        description: entry.description,
        amount: entry.amount,
        notes: entry.note,
        updatedAt: now,
        source: SOURCE,
      });
    }
  }

  for (const entry of legalSections.panel) {
    for (const product of legalProducts) {
      rows.push({
        bank: BANK,
        product,
        feeCategory: "Panel Lawyer Charges",
        description: entry.description,
        amount: entry.amount,
        notes: entry.note,
        updatedAt: now,
        source: SOURCE,
      });
    }
  }

  if (idx < baseLines.length && /^in house title clearance charge/i.test(baseLines[idx])) {
    const amountLine = baseLines[idx + 1] ?? "";
    const amountInfo = splitAmount(amountLine);
    if (amountInfo) {
      for (const product of legalProducts) {
        rows.push({
          bank: BANK,
          product,
          feeCategory: "In house Title Clearance Charge",
          description: "",
          amount: amountInfo.amount,
          notes: amountInfo.note,
          updatedAt: now,
          source: SOURCE,
        });
      }
    }
    idx += 2;
  }

  const tripIdx = baseLines.findIndex((line, i) => i >= idx && /a\) legal fees applicable for tripartite agreements/i.test(line));
  if (tripIdx !== -1) {
    let amountIdx = tripIdx + 1;
    while (amountIdx < baseLines.length && !AMOUNT_PREFIX_REGEX.test(baseLines[amountIdx])) amountIdx++;
    if (amountIdx < baseLines.length) {
      const amountInfoA = splitAmount(baseLines[amountIdx]);
      if (amountInfoA) {
        const generalProducts = ["Home Loan", "Loan Against Property"];
        for (const product of generalProducts) {
          rows.push({
            bank: BANK,
            product,
            feeCategory: "Legal Fees - Tripartite Agreements",
            description: "",
            amount: amountInfoA.amount,
            notes: amountInfoA.note,
            updatedAt: now,
            source: SOURCE,
          });
        }

        const restDesc = amountInfoA.rest ? normalizeLabel(amountInfoA.rest) : "";
        let amountIdxB = amountIdx + 1;
        while (amountIdxB < baseLines.length && !AMOUNT_PREFIX_REGEX.test(baseLines[amountIdxB])) amountIdxB++;
        if (restDesc && amountIdxB < baseLines.length) {
          const amountInfoB = splitAmount(baseLines[amountIdxB]);
          if (amountInfoB) {
            rows.push({
              bank: BANK,
              product: "Home Loan+",
              feeCategory: "Legal Fees - Tripartite Agreements (Home Loan+)",
              description: restDesc,
              amount: amountInfoB.amount,
              notes: amountInfoB.note,
              updatedAt: now,
              source: SOURCE,
            });
          }
        }
      }
    }
  }

  return rows;
}

// --- Valuation rows ---
function buildValuationRows(baseLines: string[], now: string): FeeRow[] {
  const rows: FeeRow[] = [];
  const start = baseLines.findIndex((l) => /valuation fees property value/i.test(l));
  if (start === -1) return rows;

  const products = ["Home Loan", "Home Loan+", "Loan Against Property"];

  const bandLines: string[] = [];
  const noteLines: string[] = [];
  let i = start + 1;
  let inNotes = false;

  while (i < baseLines.length) {
    const line = (baseLines[i] || "").trim();
    if (!line) {
      i++;
      continue;
    }

    if (SECTION_BREAK_REGEX.test(line) || (HEADING_REGEX.test(line) && extractProduct(line))) break;

    const lower = line.toLowerCase();
    if (!inNotes && (lower.startsWith("negotiable") || lower.startsWith("note"))) {
      inNotes = true;
      noteLines.push(line);
      i++;
      continue;
    }

    if (inNotes) {
      noteLines.push(line);
      i++;
      continue;
    }

    bandLines.push(line);
    i++;
  }

  if (!bandLines.length) return rows;

    let notes: string | undefined = noteLines.join(" ").replace(/\s+/g, " ").trim();
  if (notes) {
    notes = notes.replace(/Classification:\s*Confidential$/i, "").trim();
    if (!notes) {
      notes = undefined;
    }
  } else {
    notes = undefined;
  }

  const headingLine = clean(baseLines[start] || "");
  const headingDesc = clean(headingLine.split(":").slice(1).join(":")) || headingLine;

  let currentDesc = headingDesc;

  for (const rawLine of bandLines) {
    const amountInfo = splitAmount(rawLine);
        if (!amountInfo) {
      currentDesc = clean(rawLine);
      continue;
    }

    const description = clean(currentDesc);
    if (description) {
      for (const product of products) {
        rows.push({
          bank: BANK,
          product,
          feeCategory: "Valuation Fees",
          description,
          amount: amountInfo.amount,
          notes,
          updatedAt: now,
          source: SOURCE,
        });
      }
    }

    currentDesc = amountInfo.rest ? clean(amountInfo.rest) : "";
  }

  return rows;
}

function withoutCategories(rows: FeeRow[], patterns: RegExp[]): FeeRow[] {
  return rows.filter((row) => !patterns.some((re) => re.test(row.feeCategory)));
}

function withPenaltyFees(rows: FeeRow[], baseLines: string[], now: string): FeeRow[] {
  const cleaned = rows.filter((row) => row.feeCategory !== "Early Settlement Fees");
  const penaltyRows = buildPenaltyRows(baseLines, now);
  return [...cleaned, ...penaltyRows];
}

function appendApplicationFee(rows: FeeRow[], baseLines: string[], now: string) {
  if (rows.some((row) => row.feeCategory === "Application Fee")) return;

  const idx = baseLines.findIndex((line) => /application fee at the time of lodgement/i.test(line));
  if (idx === -1) return;

  const amountLine = baseLines[idx + 2] ?? "";
  const amountInfo = splitAmount(amountLine);
  if (!amountInfo) return;

  const note = amountInfo.note || clean(amountLine.slice((amountInfo.amount || "").length));

  ["Home Loan", "Home Loan+", "Loan Against Property"].forEach((product) => {
    rows.push({
      bank: BANK,
      product,
      feeCategory: "Application Fee",
      description: "",
      amount: amountInfo.amount,
      notes: note || undefined,
      updatedAt: now,
      source: SOURCE,
    });
  });
}

// --- MAIN ---
export async function scrapeUnionbTariff(): Promise<FeeRow[]> {
  // ---- Swap file name as needed (with or without line numbers) ----
  const baseLines = loadTariffLines("unionb-tariff-lines.txt");
  // const baseLines = loadTariffLines("unionb-tariff-lines.txt");
  const mutableLines = [...baseLines];
  const collected: FeeRow[] = [];
  const now = new Date().toISOString();

  let currentProducts: string[] = [];
  let currentFeeCategory = "";
  let lastRows: FeeRow[] = [];

  let i = 0;
  while (i < mutableLines.length) {
    const line = mutableLines[i];

    if (SECTION_BREAK_REGEX.test(line)) {
      lastRows = [];
      i++;
      continue;
    }

    if (HEADING_REGEX.test(line) && extractProduct(line)) {
      const ctx = deriveHeading(line, currentProducts);
      currentProducts = ctx.products;
      currentFeeCategory = ctx.feeCategory;
      lastRows = [];

      const inline = splitAmountAnywhere(line);
      if (inline && currentProducts.length && currentFeeCategory) {
        const created: FeeRow[] = [];
        const description = inline.prefix ? normalizeLabel(inline.prefix) : "";
        for (const product of currentProducts) {
          collected.push({
            bank: BANK,
            product,
            feeCategory: currentFeeCategory,
            description,
            amount: inline.amount,
            notes: inline.note,
            updatedAt: now,
            source: SOURCE,
          });
          created.push(collected[collected.length - 1]);
        }
        lastRows = created;
      }

      i++;
      continue;
    }

    if (!currentProducts.length || !currentFeeCategory) {
      i++;
      continue;
    }

    if (BAND_REGEX.test(line)) {
      const description = line;
      let j = i + 1;
      while (j < mutableLines.length && !mutableLines[j]) j++;
      if (j >= mutableLines.length) {
        i++;
        continue;
      }

      if ((HEADING_REGEX.test(mutableLines[j]) && extractProduct(mutableLines[j])) || SECTION_BREAK_REGEX.test(mutableLines[j])) {
        i++;
        continue;
      }

      const amountInfo = splitAmount(mutableLines[j]);
      if (amountInfo) {
        const created: FeeRow[] = [];
        for (const product of currentProducts) {
          collected.push({
            bank: BANK,
            product,
            feeCategory: currentFeeCategory,
            description,
            amount: amountInfo.amount,
            notes: amountInfo.note,
            updatedAt: now,
            source: SOURCE,
          });
          created.push(collected[collected.length - 1]);
        }
        lastRows = created;

        if (amountInfo.rest) {
          mutableLines.splice(j + 1, 0, amountInfo.rest);
        }

        i = j + 1;
        continue;
      }

      i = j;
      continue;
    }

    const amountInfo = splitAmount(line);
    if (amountInfo) {
      const created: FeeRow[] = [];
      for (const product of currentProducts) {
        collected.push({
          bank: BANK,
          product,
          feeCategory: currentFeeCategory,
          description: "",
          amount: amountInfo.amount,
          notes: amountInfo.note,
          updatedAt: now,
          source: SOURCE,
        });
        created.push(collected[collected.length - 1]);
      }
      lastRows = created;

      if (amountInfo.rest) {
        mutableLines.splice(i + 1, 0, amountInfo.rest);
      }

      i++;
      continue;
    }

    if (lastRows.length) {
      for (const row of lastRows) {
        if (!row.notes) row.notes = line;
        else row.notes = `${row.notes} ${line}`;
      }
    }

    i++;
  }

  appendApplicationFee(collected, baseLines, now);
  let result = withPenaltyFees(collected, baseLines, now);
  result = withoutCategories(result, [/Legal fees for Mortgage over Immovable Property/i, /In house Title Clearance Charge/i, /Tripartite Agreements/i, /Valuation Fees/i]);
  const legalRows = buildLegalRows(baseLines, now);
  const valuationRows = buildValuationRows(baseLines, now);

  result = [...result, ...legalRows, ...valuationRows].filter((row) => row.product && row.amount);

  return result;
}

export default scrapeUnionbTariff;
