import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { API_BASE } from "./lib/api.js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { 
  calculateTariff, 
  selectBestRate, 
  type Product as TariffProduct,
  type RateSelectionInputs,
} from "./tariff-calculator";
import * as dfccCalculator from "./banks/dfcc";
import * as nsbCalculator from "./banks/nsb";
import * as bocCalculator from "./banks/boc";
import ubLogo from "./assets/unionbank-logo.png";
import hnbLogo from "./assets/hnb.png";
import ndbLogo from "./assets/ndb.png";
import dfccLogo from "./assets/dfcc.png";
import sampathLogo from "./assets/sampath.png";
import combankLogo from "./assets/combank.png";
import seylanLogo from "./assets/seylan.png";
import nsbLogo from "./assets/nsb.png";
import bocLogo from "./assets/boc.png";
import cargillsLogo from "./assets/cargills.png";
import ntbLogo from "./assets/ntb.png";
import amanaLogo from "./assets/amana.png";
import peoplesLogo from "./assets/peoples.png";
const BANK_LOGOS: Record<string, string> = {
  "HNB": hnbLogo,
  "DFCC": dfccLogo,
  "DFCC Bank": dfccLogo,
  "NDB": ndbLogo,
  "NDB Bank": ndbLogo,
  "Sampath Bank": sampathLogo,
  "Commercial Bank": combankLogo,
  "Seylan Bank": seylanLogo,
  "Seylan": seylanLogo,
  "Union Bank": ubLogo,
  "Union Bank of Colombo": ubLogo,
  "NSB": nsbLogo,
  "BOC": bocLogo,
  "Bank of Ceylon": bocLogo,
  "Cargills": cargillsLogo,
  "Cargills Bank": cargillsLogo,
  "NTB": ntbLogo,
  "Nations Trust Bank (NTB)": ntbLogo,
  "Amana": amanaLogo,
  "Amãna Bank": amanaLogo,
  "Peoples": peoplesLogo,
  "People's Bank": peoplesLogo,
};

function BankLogoName({ bank }: { bank: string }) {
  const logo = BANK_LOGOS[bank];
  return (
    <span className="inline-flex items-center gap-2">
      {logo && (
        <img
          src={logo}
          alt={bank}
          className="h-10 w-10 rounded-sm bg-white shadow border"
          style={{ objectFit: "contain" }}
        />
      )}
      <span>{bank}</span>
    </span>
  );
}

/* ---------------- UI helpers ---------------- */
type BtnProps = React.ComponentProps<typeof motion.button> & {
  className?: string;
  children?: React.ReactNode;
};
function Btn({ className = "", children, ...restProps }: BtnProps) {
  return (
    <motion.button
      type={(restProps as any).type || "button"}
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={className}
      {...restProps}
    >
      {children}
    </motion.button>
  );
}
/* ---------------- Theme ---------------- */
/* mapped to your Home Loan+ palette */
const BRAND = {
  bgTop: "#0a0f1c",       // main background
  bgBottom: "#0a0f1c",    // keep flat or same tone gradient
  orange: "#161b27",      // use accent blue for tiles/lines
  orangeSoft: "#161b27",  // lighter blue for gradients
  card: "#161b27",        // card surfaces
  Gold: "#f2b90f", // AWPR
};

/* ---------------- Auth (login gate) ---------------- */
const UB_PASSWORD = "5973"; // ← requested password

/* ---------------- Types ---------------- */
const PRODUCTS = [
  { key: "HL", label: "Home Loans" },
  { key: "LAP", label: "Loan Against Property" },
  { key: "PL", label: "Personal Loans" },
  { key: "EDU", label: "Education Loans" },
] as const;
type ProductKey = (typeof PRODUCTS)[number]["key"];

type TenorKey = "1M" | "3M" | "6M" | "12M" | "24M" | "36M" | "48M" | "60M";
export interface UbFtpMonth {
  month: string; // "YYYY-MM"
  sourceName: string; // filename
  asset: Partial<Record<TenorKey, number>>; // % per tenor
  liquidityPremium?: number | Partial<Record<TenorKey, number>>;
  uploadedAt: string;
}

interface RateRow {
  bank: string;
  product: ProductKey;
  rate: number;                 // numeric if known; NaN if formula
  type: "Fixed" | "Floating";
  fixedYears?: number;
  notes?: string;               // keep "AWPR + 2%" etc.
  updatedAt: string;
  source?: string;
  salaryRequired?: boolean;     // generic “with salary” flag from scraper
  ltv?: number;                 // max LTV allowed (%) if present
  logoUrl?: string;
  raw?: Record<string, any>;
}
export type TariffBasis = "flat" | "percent" | "actuals";
export type TariffFeeType =
  | "processing"
  | "legal"
  | "valuation"
  | "crib"
  | "early_settlement"
  | "stamp_duty"
  | "penalty"
  | "other";

// REPLACE your current TariffRow interface with this (adds feeTypeRaw)
export interface TariffRow {
  bank: string;
  product: ProductKey;        // "HL" | "LAP" | "PL" | "EDU"
  feeType: TariffFeeType;     // normalized bucket => shown as "Category"
  feeTypeRaw?: string;        // NEW: raw feeType from scraper => shown as "Fee Type"
  basis: TariffBasis;         // "flat" | "percent" | "actuals"
  value?: number;
  min?: number;
  max?: number;
  description?: string;
  amount?: string;
  notes?: string;
  effectiveDate?: string;
  updatedAt: string;
  source: string;
}

// REPLACE your existing normalizer with this version.
// It applies your explicit business mappings FIRST, then falls back to regex rules.
function normalizeTariffFeeType(s?: string, description?: string): TariffFeeType {
  const raw = String(s || "").trim();
  const desc = String(description || "").trim();

  const lc = (x: string) => x.toLowerCase().replace(/\s+/g, " ");
  const rawLC = lc(raw);
  const descLC = lc(desc);

  // 1) YOUR EXPLICIT MAPPINGS — exact or contains (order matters)
  // Fee Type (raw) → Category
  const FEE_RAW_MAP: Record<string, TariffFeeType> = {
    "penal": "penalty",
    "in house title clearance charge": "legal",
    "tripartite agreement on condominiums": "legal",
    "handling fee": "processing",
    "premature settlement or part settlement": "early_settlement",

  };
  if (FEE_RAW_MAP[rawLC]) return FEE_RAW_MAP[rawLC];

  // Description → Category (exact or contains)
  const DESC_RULES: Array<{ test: (s: string) => boolean; cat: TariffFeeType }> = [
    { test: (t) => t.includes("housing - primary bonds"), cat: "legal" },
    { test: (t) => t.includes("housing - further bonds"), cat: "legal" },
    { test: (t) => t.includes("mortgage bond"),            cat: "legal" },
    { test: (t) => t.includes("stamp duty"),               cat: "legal" },      // ← your override
    { test: (t) => t.includes("valuation fee"),            cat: "valuation" },
    { test: (t) => /crib|credit\s*information\s*report|credit\s*bureau/i.test(t), cat: "crib" },
    { test: (t) => t.includes("title report"),             cat: "legal" },
    { test: (t) => t.includes("documentation charges"),    cat: "processing" },    
    { test: (t) => t.includes("early settlement / part payment charges"), cat: "early_settlement" },
  ];
  for (const r of DESC_RULES) { if (r.test(descLC)) return r.cat; }

  // 2) GENERIC FALLBACK RULES — catch common variants across banks
  const txt = `${rawLC} ${descLC}`;

  // Processing / documentation / service charges
  if (/(process|documentation|doc\.?\s*charges?|service\s*charge|application\s*fee|app\s*fee|handling)/i.test(txt))
    return "processing";

  // Legal / notary / deed
  if (/(legal|lawyer|attorney|notary|mortgage\s*deed|deed|title\s*(report|search))/i.test(txt))
    return "legal";

  // Valuation / inspection
  if (/(valuat|valuer|inspection\s*fee)/i.test(txt))
    return "valuation";
  // CRIB
  if (/\bcrib\b|credit\s*information\s*report|credit\s*bureau/i.test(txt))
  return "crib";
  // Early settlement / prepayment / foreclosure / exit
  if (/(early\s*(settle|closure|close)|pre[-\s]?settle|pre[-\s]?payment|prepayment|foreclos(e|ure)|termination\s*fee|exit\s*fee)/i.test(txt))
    return "early_settlement";

  // Penalty / penal / default / late payment
  if (/\bpenal\b|penalt(y|ies)|late\s*payment|overdue|past\s*due|default\s*(interest|charge|fee)/i.test(txt))
    return "penalty";

  // If nothing matched, keep as other
  return "other";
}


/* ---------------- Tariffs: types & constants ---------------- */



const LS_TARIFFS = "ub.tariffs.v1";

/** Build tariff scraper endpoint from rate key (with graceful underscore fallback for ComBank, etc.) */
function tariffEndpointFor(rateKey: string, apiBase: string): string[] {
  const dash = `${apiBase}/scrape/${rateKey}-tariff`;
  const underscore = `${apiBase}/scrape/${rateKey}_tariff`;
  return [dash, underscore]; // try dash first; if 404, try underscore
}

/** Extract min/max from notes text */
function parseMinMaxFromNotes(notes?: string): { min?: number; max?: number } {
  if (!notes) return {};
  const s = notes.toLowerCase();
  // Min
  const minMatch =
    s.match(/(?:^|\b)(min|minimum)\b[^0-9]{0,12}([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i) ||
    s.match(/(?:>=|above|over)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
  // Max
  const maxMatch =
    s.match(/(?:^|\b)(max|maximum)\b[^0-9]{0,12}([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i) ||
    s.match(/(?:<=|upto|up\s*to)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);

  const min = minMatch ? toMoneyLkr(minMatch[2] || minMatch[1], (minMatch[3] || "") as any) : undefined;
  const max = maxMatch ? toMoneyLkr(maxMatch[2] || maxMatch[1], (maxMatch[3] || "") as any) : undefined;
  return { min: Number.isFinite(min as number) ? (min as number) : undefined,
           max: Number.isFinite(max as number) ? (max as number) : undefined };
}

// REPLACE your current coerceTariffs with this version (stores feeTypeRaw)
function coerceTariffs(raw: any): TariffRow[] {
  const arr = Array.isArray(raw) ? raw : raw?.rows || raw?.data || [];
  if (!Array.isArray(arr)) return [];

  return arr.map((r) => {
    const bank = String(r.bank || r.Bank || "Unknown");

    const product = ((): ProductKey => {
      const p = r.product ?? r.Product ?? r.category;
      return (["HL","LAP","PL","EDU"] as ProductKey[]).includes(p) ? p : normProductName(p);
    })();

    // Long label first—may be used by the normalizer
    const feeRaw = r.feeType ?? r.feeCategory ?? r.category ?? r.type ?? r.fee ?? "";
    const description: string | undefined =
      r.description ?? r.desc ?? r.label ?? r.item ?? r.details ?? r.text ?? r.line ??
      (feeRaw ? String(feeRaw) : undefined);

    // Category (normalized) and raw fee type
    const feeType = normalizeTariffFeeType(String(feeRaw), description);
    const feeTypeRaw = feeRaw ? String(feeRaw) : undefined;

    const basis = String(r.basis || "actuals").toLowerCase() as TariffBasis;

    const valueNum =
      basis === "actuals" ? undefined :
      (typeof r.value === "number" ? r.value :
        ((): number | undefined => {
          const m = String(r.value ?? "").match(/([0-9]+(?:\.[0-9]+)?)/);
          const n = m ? parseFloat(m[1]) : NaN;
          return isFinite(n) ? n : undefined;
        })());

    const minN = readNumber(r.min ?? r.minimum ?? r.minAmount ?? r.min_amt ?? r.floor);
    const maxN = readNumber(r.max ?? r.maximum ?? r.maxAmount ?? r.max_amt ?? r.cap);

    // Preserve raw "amount" provided by scraper, if present
    const amount: string | undefined =
      (typeof r.amount === "string" && r.amount.trim()) ? r.amount.trim()
      : (typeof r.Amount === "string" && r.Amount.trim()) ? r.Amount.trim()
      : undefined;

    const notes: string | undefined = r.notes || r.note || r.remark || r.remarks || undefined;

    const effField = r.effectiveDate ?? r.effective_from ?? r.effectiveFrom ?? r.validFrom ?? r.valid_from ?? r.wef;
    const effectiveISO =
      effField && !isNaN(Date.parse(effField)) ? new Date(effField).toISOString().slice(0,10) : undefined;

    const upd = r.updatedAt && !isNaN(Date.parse(r.updatedAt)) ? r.updatedAt : new Date().toISOString();

    return {
      bank,
      product,
      feeType,
      feeTypeRaw, // <- NEW
      basis: (basis === "flat" || basis === "percent" || basis === "actuals") ? basis : "actuals",
      value: typeof valueNum === "number" && isFinite(valueNum) ? valueNum : undefined,
      min: typeof minN === "number" && isFinite(minN) ? minN : undefined,
      max: typeof maxN === "number" && isFinite(maxN) ? maxN : undefined,
      description,
      amount,
      notes,
      effectiveDate: effectiveISO,
      updatedAt: upd,
      source: String(r.source || r.url || ""),
    } as TariffRow;
  });
}

// REPLACE your current tariff merge function with this version.
// It preserves distinct slabs by including description/amount/basis/value in the key.
// Identical duplicates (same content) still collapse; different slabs remain separate.
function mergeTariffs(existing: TariffRow[], incoming: TariffRow[]): TariffRow[] {
  const toKey = (t: TariffRow) =>
    [
      t.bank,
      t.product,
      t.feeType,
      t.basis,                                 // percent / flat / actuals
      (t.value != null && isFinite(t.value)) ? String(t.value) : "", // numeric value if any
      (t.description || "").toLowerCase().trim(), // long label, e.g., "Up to Rs. 1,000,000/-"
      (t.amount || "").toLowerCase().trim(),      // raw amount text from scraper
    ].join("||");

  const map = new Map<string, TariffRow>();
  for (const r of existing) map.set(toKey(r), r);
  for (const r of incoming) map.set(toKey(r), r);
  return [...map.values()];
}

/* ---------------- LocalStorage utils ---------------- */
const LS_RATES = "ub.rates.v1";
const LS_PANEL = "ub.panel.v1";
const LS_CBSL = "ub.cbsl.v1";        // CBSL monthly AWPR series
const LS_FTP  = "ub.ftp.v1";         // FTP uploads
const LS_COMPARE_PREFS = "ub.compare.prefs.v1";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}
/* ---------------- Helpers ---------------- */
function normProductName(s: any): ProductKey {
  const t = String(s ?? "").toLowerCase();
  if (/lap|against\s+property|mortgage|equity\s*release|property\s*loan/.test(t)) return "LAP";
  if (/education|student|scholar/.test(t)) return "EDU";
  if (/personal|consumption/.test(t)) return "PL";
  return "HL";
}
function readNumber(x: any): number | undefined {
  if (x == null) return undefined;
  if (typeof x === "number" && isFinite(x)) return x;
  const m = String(x).match(/([0-9]+(?:\.[0-9]+)?)/);
  const n = m ? parseFloat(m[1]) : NaN;
  return isFinite(n) ? n : undefined;
}
function containsFormula(str?: string): boolean {
  return !!str && /awpr|awplr/i.test(str);
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
function byAlpha<T>(sel: (t: T) => string) {
  return (a: T, b: T) => sel(a).localeCompare(sel(b));
}
const CATEGORY_ORDER: TariffFeeType[] = [
  "processing", "legal", "valuation", "crib", "early_settlement", "stamp_duty", "penalty", "other",
];

// ---- Tariff math helpers (Compare tab) ----
function lkr(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

type TariffComputationMeta = {
  basis: TariffBasis;
  value?: number;
  min?: number;
  max?: number;
  valueDerived?: boolean;
  valueSource?: "value" | "amount" | "description" | "notes";
  minDerived?: boolean;
  maxDerived?: boolean;
  loanMin?: number;
  loanMax?: number;
  loanMinExclusive?: boolean;
  loanMaxExclusive?: boolean;
  loanSource?: "feeType" | "amount" | "description" | "notes";
  rawText?: string;
};

function firstPercent(text: string): number | undefined {
  const m = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return m ? parseFloat(m[1]) : undefined;
}

function firstMoney(text: string): number | undefined {
  const m = text.match(/(?:rs\.?|lkr|rupees?)\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
  if (m) {
    return toMoneyLkr(m[1], m[2] || null);
  }
  const slash = text.match(/([0-9][0-9,\.]*)\s*(?:\/-|\/=)/);
  if (slash) {
    const n = parseFloat(slash[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  const bare = text.match(/^\s*([0-9][0-9,\.]*)\s*$/);
  if (bare) {
    const n = parseFloat(bare[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

type LoanRange = {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
};

function isLoanRangeText(text: string): boolean {
  const lower = text.toLowerCase();
  if (/(loan\s*(amount|range|band)|slab|tier\s*\d|facility)/.test(lower)) return true;
  if (/(up\s*to|upto|between|from|above|over|less\s*than|below|not\s*exceeding|greater\s*than)/.test(lower)) return true;
  if (/\b[0-9][0-9,\.]*\s*(mn|million|bn|billion)?\s*(?:\/-|\/=)?\s*(?:-|to)\s*(?:rs\.?|lkr)?\s*[0-9]/i.test(text)) return true;
  return false;
}

function parseLoanRangeFromText(text: string): LoanRange | undefined {
  if (!text) return undefined;
  const clean = text.replace(/[\u2012\u2013\u2014\u2015]/g, "-").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const lower = clean.toLowerCase();

  const parseNum = (numStr: string, unit?: string | null) => toMoneyLkr(numStr.replace(/,/g, ""), unit ?? null);
  const range: LoanRange = {};

  const between = lower.match(/(?:between|from)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?\s*(?:\/-)?\s*(?:to|and|-)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
  if (between) {
    range.min = parseNum(between[1], between[2]);
    range.max = parseNum(between[3], between[4]);
  } else {
    const explicit = lower.match(/(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?\s*(?:\/-)?\s*(?:to|-)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
    if (explicit) {
      range.min = parseNum(explicit[1], explicit[2]);
      range.max = parseNum(explicit[3], explicit[4]);
    }
  }

  const upTo = lower.match(/(?:up\s*to|upto|less\s*than|below|not\s*exceeding)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
  if (upTo) {
    const maxVal = parseNum(upTo[1], upTo[2]);
    if (Number.isFinite(maxVal)) {
      range.max = maxVal;
      range.maxExclusive = /less\s*than|below/.test(upTo[0]);
    }
  }

  const above = lower.match(/(?:above|over|greater\s*than|exceeding)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
  if (above) {
    const minVal = parseNum(above[1], above[2]);
    if (Number.isFinite(minVal)) {
      range.min = minVal;
      range.minExclusive = /above|over|greater/.test(above[0]);
    }
  }

  const minimum = lower.match(/(?:minimum|min)\s*(?:loan\s*)?(?:amount\s*)?(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
  if (minimum) {
    const minVal = parseNum(minimum[1], minimum[2]);
    if (Number.isFinite(minVal)) {
      range.min = minVal;
      range.minExclusive = false;
    }
  }

  const maximum = lower.match(/(?:maximum|max)\s*(?:loan\s*)?(?:amount\s*)?(?:rs\.?|lkr)?\s*([0-9][0-9,\.]*)\s*(mn|million|bn|billion)?/i);
  if (maximum) {
    const maxVal = parseNum(maximum[1], maximum[2]);
    if (Number.isFinite(maxVal)) {
      range.max = maxVal;
      range.maxExclusive = false;
    }
  }

  if (range.min == null && range.max == null) return undefined;
  return range;
}

function normalizeTariffForComputation(r: TariffRow): TariffComputationMeta | undefined {
  let basis: TariffBasis = r.basis === "percent" || r.basis === "flat" ? r.basis : "actuals";
  let value = typeof r.value === "number" && isFinite(r.value) ? r.value : undefined;
  let min = typeof r.min === "number" && isFinite(r.min) ? r.min : undefined;
  let max = typeof r.max === "number" && isFinite(r.max) ? r.max : undefined;
  let valueDerived = false;
  let valueSource: TariffComputationMeta["valueSource"] = value != null ? "value" : undefined;
  let minDerived = false;
  let maxDerived = false;
  let loanMin: number | undefined;
  let loanMax: number | undefined;
  let loanMinExclusive = false;
  let loanMaxExclusive = false;
  let loanSource: TariffComputationMeta["loanSource"];

  const fields: Array<{ text: string; source: TariffComputationMeta["valueSource"] | "feeType" }> = [
    { text: typeof r.feeTypeRaw === "string" ? r.feeTypeRaw : "", source: "feeType" },
    { text: typeof r.amount === "string" ? r.amount : "", source: "amount" },
    { text: typeof r.description === "string" ? r.description : "", source: "description" },
    { text: typeof r.notes === "string" ? r.notes : "", source: "notes" },
  ];
  const text = fields
    .filter((f) => f.source !== "feeType")
    .map((f) => f.text.trim())
    .filter(Boolean)
    .join(" | ");
  if (text) {
    const mm = parseMinMaxFromNotes(text);
    if (min == null && mm.min != null) { min = mm.min; minDerived = true; }
    if (max == null && mm.max != null) { max = mm.max; maxDerived = true; }
  }

  for (const field of fields) {
    if (!field.text) continue;
    const range = parseLoanRangeFromText(field.text);
    if (range) {
      if (range.min != null && (loanMin == null || range.min > loanMin)) {
        loanMin = range.min;
        loanMinExclusive = !!range.minExclusive;
        loanSource =
          field.source === "feeType" ? "feeType" :
          field.source === "amount" ? "amount" :
          field.source === "notes" ? "notes" :
          "description";
      }
      if (range.max != null && (loanMax == null || range.max < loanMax)) {
        loanMax = range.max;
        loanMaxExclusive = !!range.maxExclusive;
        loanSource =
          field.source === "feeType" ? "feeType" :
          field.source === "amount" ? "amount" :
          field.source === "notes" ? "notes" :
          "description";
      }
    }
  }

  if (basis === "actuals" || value == null) {
    for (const field of fields) {
      if (!field.text || isLoanRangeText(field.text)) continue;
      const pct = firstPercent(field.text);
      if (pct != null) {
        basis = "percent";
        value = pct;
        valueDerived = true;
        valueSource = field.source === "feeType" ? "description" : (field.source as TariffComputationMeta["valueSource"]);
        break;
      }
    }
  }

  if (basis === "actuals" || value == null) {
    for (const field of fields) {
      if (!field.text || isLoanRangeText(field.text)) continue;
      const amt = firstMoney(field.text);
      if (amt != null) {
        basis = "flat";
        value = amt;
        valueDerived = true;
        valueSource = field.source === "feeType" ? "description" : (field.source as TariffComputationMeta["valueSource"]);
        break;
      }
    }
  }

  if (basis === "actuals" || value == null) return undefined;

  return {
    basis,
    value,
    min,
    max,
    valueDerived,
    valueSource,
    minDerived,
    maxDerived,
    loanMin,
    loanMax,
    loanMinExclusive,
    loanMaxExclusive,
    loanSource,
    rawText: text,
  };
}

// Sum best-computable upfront fees for a bank & product.
// Included categories: processing, legal, valuation.
// - percent  -> amount * value/100 (clamped by min/max if provided)
// - flat     -> value
// - actuals  -> excluded from total, but flagged via `actualsFlags`
function sumUpfrontTariffsForBank(
  tariffs: TariffRow[],
  bank: string,
  product: ProductKey,
  loanAmount?: number
): {
  total: number;
  actualsFlags: string[];
  picked: Array<{ cat: TariffFeeType; row?: TariffRow; computed?: number; note?: string; meta?: TariffComputationMeta }>;
} {
  // Product rules:
// - HL & LAP: include processing + legal + exactly one valuation + CRIB
// - PL:       include processing + CRIB only (no legal/title, no valuation)
const include = new Set<TariffFeeType>(
  product === "PL"
    ? ["processing", "crib"]
    : ["processing", "legal", "valuation", "crib"]
);
  const rows = tariffs
  .filter(t => t.bank === bank && t.product === product && include.has(t.feeType))
  .filter(t => {
    const text = `${t.feeTypeRaw || ""} ${t.description || ""}`.toLowerCase();
    if (/\binsurance\b/.test(text)) return false; // Exclude insurance
    if (/\brelease\b/.test(text)) return false;   // Exclude release/part release
    return true;
  });

  const byCat: Record<TariffFeeType, TariffRow[]> = {
    processing: [],
    legal: [],
    valuation: [],
    crib: [],
    early_settlement: [],
    stamp_duty: [],
    penalty: [],
    other: [],
  };
  for (const r of rows) byCat[r.feeType].push(r);

  const actualsFlags: string[] = [];
  const picked: Array<{ cat: TariffFeeType; row?: TariffRow; computed?: number; note?: string; meta?: TariffComputationMeta }> = [];

  function loanMatches(meta: TariffComputationMeta | undefined, amt?: number): boolean {
    if (!meta || amt == null || !isFinite(amt)) return true;
    if (meta.loanMin != null) {
      if (meta.loanMinExclusive ? amt <= meta.loanMin : amt < meta.loanMin) return false;
    }
    if (meta.loanMax != null) {
      if (meta.loanMaxExclusive ? amt >= meta.loanMax : amt > meta.loanMax) return false;
    }
    return true;
  }

  function compute(r: TariffRow): { amount: number; meta: TariffComputationMeta; inRange: boolean } | undefined {
    const meta = normalizeTariffForComputation(r);
    if (!meta) return undefined;
    if (meta.basis === "percent") {
      if (!loanAmount || !isFinite(loanAmount)) return undefined;
      let v = (loanAmount * (meta.value ?? 0)) / 100;
      if (typeof meta.min === "number") v = Math.max(v, meta.min);
      if (typeof meta.max === "number") v = Math.min(v, meta.max);
      return { amount: v, meta, inRange: loanMatches(meta, loanAmount) };
    }
    if (meta.basis === "flat") {
      let v = meta.value ?? 0;
      if (typeof meta.min === "number") v = Math.max(v, meta.min);
      if (typeof meta.max === "number") v = Math.min(v, meta.max);
      return { amount: v, meta, inRange: loanMatches(meta, loanAmount) };
    }
    return undefined;
  }

  let total = 0;

  for (const cat of ["processing", "legal", "valuation"] as const) {
    const list = byCat[cat] || [];
    let bestVal: number | undefined;
    let bestRow: TariffRow | undefined;
    let bestMeta: TariffComputationMeta | undefined;
    let bestInRangeVal: number | undefined;
    let bestInRangeRow: TariffRow | undefined;
    let bestInRangeMeta: TariffComputationMeta | undefined;
    let sawActuals = false;

    for (const r of list) {
      const out = compute(r);
      if (!out) {
        if (r.basis === "actuals") sawActuals = true;
        continue;
      }
      if (out.inRange) {
        if (bestInRangeVal == null || out.amount < bestInRangeVal) {
          bestInRangeVal = out.amount;
          bestInRangeRow = r;
          bestInRangeMeta = out.meta;
        }
      }
      if (bestVal == null || out.amount < bestVal) {
        bestVal = out.amount;
        bestRow = r;
        bestMeta = out.meta;
      }
    }

    if (bestInRangeVal != null) {
      total += bestInRangeVal;
      picked.push({ cat, row: bestInRangeRow, computed: bestInRangeVal, meta: bestInRangeMeta });
    } else if (bestVal != null) {
      total += bestVal;
      picked.push({ cat, row: bestRow, computed: bestVal, meta: bestMeta });
    } else {
      if (sawActuals) { actualsFlags.push(cat); picked.push({ cat, note: "At actuals" }); }
      else if (!list.length) { picked.push({ cat, note: "No data" }); }
      else { picked.push({ cat, note: "Not computable" }); }
    }
  }

  return { total, actualsFlags, picked };
}

function MatrixRain() {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const onResize = () => { resize(); initColumns(); };
    window.addEventListener("resize", onResize);
    resize();

    const chars = "アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let columns: { x: number; y: number }[] = [];
    function initColumns() {
      const colWidth = 16;
      const cols = Math.ceil(canvas.clientWidth / colWidth);
      columns = Array.from({ length: cols }, (_, i) => ({ x: i * colWidth, y: (Math.random() * -100) | 0 }));
    }
    initColumns();

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // fade the frame (tail)
      ctx.fillStyle = "rgba(10,15,28,0.12)";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "#65a30d"; // lime-600
      ctx.font = "16px monospace";
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(ch, col.x, col.y);
        col.y += 18 + Math.random() * 8;
        if (col.y > h + 50) col.y = -50 - Math.random() * 300;
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full"
      style={{ display: "block" }}
    />
  );
}

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [showPw, setShowPw] = React.useState(false);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (pw.trim() === UB_PASSWORD) {      
      onSuccess();
    } else {
      setErr("Incorrect password. Please try again.");
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden text-white">
      {/* Matrix rain background */}
      <MatrixRain />
      {/* Dark overlay for contrast */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,15,28,0.55) 0%, rgba(10,15,28,0.85) 100%)" }} />

      {/* Center content */}
      <div className="relative z-10 h-full w-full flex items-center justify-center p-6">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl"
          style={{ backgroundColor: "#161b27cc", backdropFilter: "blur(6px)" }}
        >
          {/* Brand header */}
          <div className="text-center mb-5">
            <div className="text-2xl font-extrabold">UB Analyst</div>
            <div className="text-white/70 text-sm">Secure Access</div>
          </div>

          {/* Password input */}
          <label className="block text-sm mb-1 text-white/80">Password</label>
          <div className="flex items-center gap-2">
            <input
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white/10 outline-none"
              placeholder="Enter password"
              autoFocus
            />
            <Btn
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="px-3 py-2 rounded bg-white/10"
              title={showPw ? "Hide" : "Show"}
            >
              {showPw ? "Hide" : "Show"}
            </Btn>
          </div>

          {err && <div className="mt-2 text-xs text-red-300">{err}</div>}

          <Btn
            type="submit"
            className="mt-4 w-full px-4 py-2 rounded-xl bg-[#3b82f6] text-white shadow-lg"
            whileTap={{ scale: 0.98 }}
          >
            Enter
          </Btn>

          {/* small footer */}
          <div className="mt-4 text-center text-[11px] text-white/60">
            © {new Date().getFullYear()} Chalith Perera. All Rights Reserved. This software is proprietary and confidential.
  Unauthorized copying, distribution, reverse engineering, or disclosure is strictly prohibited.<br />
  Developed by Chalith Perera – Head of Product Management, Retail Assets &amp; Liabilities,
  Union Bank of Colombo PLC. Contact: 077 395 1370
          </div>
        </motion.form>
      </div>
    </div>
  );
}

/* ---------------- Normalize formulas using AWPR/AWPLR ---------------- */
type FormulaMatch = {
  base: "AWPR" | "AWPLR";
  offset: number;
  label: string;
  rawSource?: string;
};

function extractFormulaFromString(source?: string): FormulaMatch | undefined {
  if (typeof source !== "string") return undefined;
  const text = source.trim();
  if (!text) return undefined;

  const withOffset = text.match(/\b(AWPR|AWPLR)\b\s*([+-])\s*([0-9]+(?:\.[0-9]+)?)(\s*%)?/i);
  if (withOffset) {
    const base = withOffset[1].toUpperCase() as FormulaMatch["base"];
    const sign = withOffset[2] === "-" ? -1 : 1;
    const magnitude = parseFloat(withOffset[3]);
    if (!isFinite(magnitude)) return undefined;
    const label = `${base} ${sign === 1 ? "+" : "-"} ${withOffset[3]}%`;
    return { base, offset: magnitude * sign, label, rawSource: text };
  }

  const baseIndex = text.search(/\b(AWPR|AWPLR)\b/i);
  if (baseIndex >= 0) {
    const baseMatch = /\b(AWPR|AWPLR)\b/i.exec(text.slice(baseIndex));
    if (!baseMatch) return undefined;
    const base = baseMatch[1].toUpperCase() as FormulaMatch["base"];
    const tail = text.slice(baseIndex);
    const stopAt = tail.search(/[.;,\n]/);
    const snippet = (stopAt >= 0 ? tail.slice(0, stopAt) : tail).trim();
    const label = snippet || base;
    return { base, offset: 0, label, rawSource: text };
  }

  return undefined;
}

function extractFormulaFromRow(row: RateRow): FormulaMatch | undefined {
  const raw: Record<string, any> = row.raw ?? {};
  const candidates: unknown[] = [
    row.notes,
    raw.notes,
    raw.note,
    raw.rateWithSalary,
    raw.rateWithoutSalary,
    raw.rate,
    raw.Rate,
    raw.minRate,
    raw.maxRate,
    raw.Min,
    raw.Max,
    raw.description,
  ];
  for (const candidate of candidates) {
    const info = extractFormulaFromString(typeof candidate === "string" ? candidate : undefined);
    if (info) return info;
  }
  return undefined;
}

function mergeFormulaNote(existing: string | undefined, label: string): string {
  if (!existing) return label;
  const lower = existing.toLowerCase();
  if (lower.includes("awpr") || lower.includes("awplr")) return existing;
  return `${existing}   ${label}`;
}

function normalizeFormulaRates(rows: RateRow[], awpr?: number, awplr?: number): RateRow[] {
  if (typeof awpr !== "number" && typeof awplr !== "number") return rows;
  return rows.map((r) => {
    if (isFinite(r.rate)) return r;
    const formula = extractFormulaFromRow(r);
    if (!formula) return r;
    let baseValue = formula.base === "AWPR" ? awpr : awplr;

    if (formula.base === "AWPLR") {
      const text = (formula.rawSource || r.notes || "").toLowerCase();
      const mentionsPrevailing = text.includes("prevailing at disbursement");
      if (mentionsPrevailing && typeof awpr === "number") {
        baseValue = awpr;
      } else if (typeof baseValue !== "number" && typeof awpr === "number") {
        baseValue = awpr;
      }
    }

    if (typeof baseValue !== "number") return r;
    return {
      ...r,
      rate: baseValue + formula.offset,
      notes: mergeFormulaNote(r.notes, formula.label),
    };
  });
}

function prepareRateRows(rows: RateRow[], awpr?: number, awplr?: number): RateRow[] {
  const normalized = normalizeFormulaRates(rows, awpr, awplr);
  
  // Debug logging for People's Bank before filtering
  const peoplesInput = normalized.filter(r => r.bank?.toLowerCase().includes("people"));
  if (peoplesInput.length > 0) {
    console.log("🏦 prepareRateRows input - People's Bank rows:", peoplesInput.length);
    peoplesInput.forEach((row, i) => {
      console.log(`  ${i}: ${row.product} | ${(row as any).tenureLabel} | rateWithSalary: ${(row as any).rateWithSalary}`);
    });
  }
  
  const filtered = normalized.filter((r) => r && typeof r.bank === "string" && r.bank.trim().length > 0);
  const processed = filtered.map((r) => {
      // Preserve original raw data for scenario selection
      const raw = r.raw || r;
      let rate = r.rate;
      let product = r.product;
      
      // Normalize product names to ProductKey format
      if (typeof product === "string") {
        const productLower = product.toLowerCase();
        if (productLower === "home loan" || productLower === "housing loan") product = "HL";
        else if (productLower === "personal loan" || productLower === "personal loans") product = "PL";
        else if (productLower === "education loan" || productLower === "education loans") product = "EDU";
        else if (productLower === "lap" || productLower === "loan against property") product = "LAP";
      }
      
      // For rows without a base rate field, extract fallback rate from raw fields
      // Use the BEST rate (lowest) as the display rate for Interest Rates tab
      // Actual scenario-based rate selection happens in selectRateScenario()
      if (!Number.isFinite(rate)) {
        const rateFields: Array<{ key: string; value: any }> = [];
        for (const key of Object.keys(raw)) {
          if (/^rate/i.test(key)) {
            const val = (raw as any)[key];
            if (val != null) {
              rateFields.push({ key, value: val });
            }
          }
        }
        
        // Parse all rate fields and pick the lowest (best) for display
        const parsedRates: number[] = [];
        for (const field of rateFields) {
          const numRate = readNumber(field.value);
          if (numRate != null && Number.isFinite(numRate)) {
            parsedRates.push(numRate);
          }
        }
        
        if (parsedRates.length > 0) {
          rate = Math.min(...parsedRates); // Best rate for display
        }
      }
      
      return {
        ...r,
        rate,
        product,
        bank: r.bank.trim(),
        notes: typeof r.notes === "string" ? r.notes.trim() : r.notes,
        raw, // Preserve raw data for scenario selection
      };
    });
  
  // Debug logging for People's Bank after processing
  const peoplesOutput = processed.filter(r => r.bank?.toLowerCase().includes("people"));
  if (peoplesOutput.length > 0) {
    console.log("✅ prepareRateRows output - People's Bank rows:", peoplesOutput.length);
    peoplesOutput.forEach((row, i) => {
      console.log(`  ${i}: ${row.product} | ${(row as any).tenureLabel} | rate: ${row.rate}`);
    });
  }
  
  return processed;
}

/* ---------------- Month helpers (FTP & CBSL reduction) ---------------- */
function ym(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function inferMonthFromFilename(name: string): string | null {
  const s = name.toLowerCase();
  const m1 = s.match(/(20\d{2})[ -_]?([01]?\d)\b/);
  if (m1) {
    const y = Number(m1[1]);
    const mo = Number(m1[2]);
    if (y >= 2000 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, "0")}`;
  }
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const m2 = s.match(new RegExp(`\\b(${months.join("|")})\\s*-?\\s*(['’]?\\d{2}|20\\d{2})`, "i"));
  if (m2) {
    const idx = months.indexOf(m2[1].slice(0,3).toLowerCase());
    const ystr = m2[2].replace(/['’]/g,"");
    const y = ystr.length === 2 ? 2000 + Number(ystr) : Number(ystr);
    if (y >= 2000 && idx >= 0) return `${y}-${String(idx+1).padStart(2, "0")}`;
  }
  return null;
}
function UBRateAnalyst() {
  const [page, setPage] = useState<"dashboard" | "interest" | "tariffs" | "compare" | "news" | "admin" | "scrapers">(
  "dashboard"
);

  const [rates, setRates] = useState<RateRow[]>(() =>
    loadJSON<RateRow[]>(LS_RATES, [])
  );
  useEffect(() => saveJSON(LS_RATES, rates), [rates]);

    /* ---- Tariffs state (persist to LS_TARIFFS) ---- */
  const [tariffs, setTariffs] = useState<TariffRow[]>(
    () => loadJSON<TariffRow[]>(LS_TARIFFS, [])
  );
  useEffect(() => saveJSON(LS_TARIFFS, tariffs), [tariffs]);

  function onMergeTariffs(rows: TariffRow[]) {
    setTariffs((prev) => mergeTariffs(prev, rows));
  }

  type CbslRow = { period: string; weekEnd: string; metric: string; rate: string; source: string; updatedAt: string };
  const [cbslRows, setCbslRows] = useState<CbslRow[]>(
    () => loadJSON<CbslRow[]>(LS_CBSL, [])
  );
  useEffect(() => saveJSON(LS_CBSL, cbslRows), [cbslRows]);

  const [ftpMonths, setFtpMonths] = useState<UbFtpMonth[]>(
    () => loadJSON<UbFtpMonth[]>(LS_FTP, [])
  );
  useEffect(() => saveJSON(LS_FTP, ftpMonths), [ftpMonths]);

  const awprLatest = useMemo(() => {
    if (!cbslRows.length) return undefined;
    let latestRate: number | undefined;
    let latestTs = -Infinity;
    for (const r of cbslRows) {
      const metric = (r.metric || "").toUpperCase();
      const treatAsAwpr = metric ? metric.includes("AWPR") : true;
      if (!treatAsAwpr) continue;
      const n = Number.parseFloat(String(r.rate));
      if (!Number.isFinite(n)) continue;
      const tsCandidate = r.weekEnd || r.period || r.updatedAt || "";
      const ts = Date.parse(tsCandidate);
      const tsValue = Number.isFinite(ts) ? ts : -Infinity;
      if (tsValue >= latestTs) {
        latestTs = tsValue;
        latestRate = n;
      }
    }
    return latestRate;
  }, [cbslRows]);

  const awplrLatest = useMemo(() => {
    if (!cbslRows.length) return undefined;
    let latestRate: number | undefined;
    let latestTs = -Infinity;
    for (const r of cbslRows) {
      const metric = (r.metric || "").toUpperCase();
      if (!metric.includes("AWPLR")) continue;
      const n = Number.parseFloat(String(r.rate));
      if (!Number.isFinite(n)) continue;
      const tsCandidate = r.weekEnd || r.period || r.updatedAt || "";
      const ts = Date.parse(tsCandidate);
      const tsValue = Number.isFinite(ts) ? ts : -Infinity;
      if (tsValue >= latestTs) {
        latestTs = tsValue;
        latestRate = n;
      }
    }
    return latestRate;
  }, [cbslRows]);

  useEffect(() => {
    if (typeof awprLatest !== "number" && typeof awplrLatest !== "number") return;
    setRates((prev) => normalizeFormulaRates(prev, awprLatest, awplrLatest));
  }, [awprLatest, awplrLatest]);

  const canonicalRates = useMemo(
    () => prepareRateRows(rates, awprLatest, awplrLatest),
    [rates, awprLatest, awplrLatest],
  );

  function mergeRates(existing: RateRow[], incoming: RateRow[]) {
    if (!incoming?.length) return existing;
    const keyOf = (row: RateRow) => [
      row.bank ?? "",
      row.product ?? "",
      row.type ?? "",
      row.fixedYears ?? "",
      row.notes ?? "",
      (row as any).tenureLabel ?? "",
    ].join("||");

    const map = new Map<string, RateRow>();
    for (const row of existing) {
      map.set(keyOf(row), row);
    }
    
    // Debug logging for People's Bank
    const peoplesRows = incoming.filter(r => r.bank?.toLowerCase().includes("people"));
    if (peoplesRows.length > 0) {
      console.log("🔍 Merging People's Bank rows:", peoplesRows.length);
      peoplesRows.forEach((row, i) => {
        const key = keyOf(row);
        console.log(`  ${i}: ${row.product} | ${(row as any).tenureLabel} | key: ${key}`);
      });
    }
    
    for (const row of incoming) {
      map.set(keyOf(row), row);
    }
    const merged = Array.from(map.values());
    
    // Debug logging for merged People's Bank
    const mergedPeoples = merged.filter(r => r.bank?.toLowerCase().includes("people"));
    if (mergedPeoples.length > 0) {
      console.log("✅ Merged People's Bank rows:", mergedPeoples.length);
      mergedPeoples.forEach((row, i) => {
        console.log(`  ${i}: ${row.product} | ${(row as any).tenureLabel} | rate: ${row.rate}`);
      });
    }
    
    return normalizeFormulaRates(merged, awprLatest, awplrLatest);
  }

  function bestForProduct(p: ProductKey) {
    const rows = rates.filter((r) => r.product === p && isFinite(r.rate));
    if (!rows.length) return undefined;
    return [...rows].sort((a, b) => a.rate - b.rate)[0];
  }

  // Use the centralized API_BASE configuration

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${BRAND.bgTop} 0%, ${BRAND.bgBottom} 100%)`,
        color: "white",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 pt-8 pb-24 text-white flex-1 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              whileTap={{ scale: 0.9 }}
              className="h-15 w-15 rounded-2xl overflow-hidden flex items-center justify-center shadow-md bg-white"
            >
              <img src={ubLogo} alt="Union Bank Logo" className="h-12 w-12 object-contain" />
              </motion.div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">UB Analyst</h1>
              <p className="text-white/80">Retail advances - peer comparison</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div className="mt-4 flex gap-3 overflow-x-auto">
          {(["dashboard", "interest", "tariffs", "compare", "news", "admin", "scrapers"] as const).map((p) => (
  <Btn
    key={p}
    onClick={() => setPage(p)}
    className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all ${
      page === p ? "bg-[#3b82f6] text-white shadow-lg" : "bg-white/10"
    }`}
  >
    {p === "dashboard" ? "Dashboard" :
     p === "interest" ? "Interest Rates" :
     p === "tariffs" ? "Tariffs" :
     p === "compare" ? "Compare" :
     p === "news" ? "News" :
     p === "admin" ? "Admin" : "Scrapers"}
  </Btn>
))}

        </div>

        {/* Dashboard */}
        {page === "dashboard" && (
          <div className="mt-6 space-y-6">
            {/* Market Overview */}
            <div className="rounded-2xl p-6 border border-white/10" style={{ backgroundColor: BRAND.card }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Market Overview</div>
                  <div className="text-white/70 text-sm">Current Sri Lankan banking sector lending rates</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/60">Last Updated</div>
                  <div className="text-xs text-green-400">
                    {(() => {
                      const latestUpdate = rates
                        .filter(r => r.updatedAt)
                        .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())[0];
                      if (!latestUpdate?.updatedAt) return "Unknown";
                      const date = new Date(latestUpdate.updatedAt);
                      const now = new Date();
                      const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
                      if (diffHours < 1) return "Just now";
                      if (diffHours < 24) return `${diffHours}h ago`;
                      const diffDays = Math.floor(diffHours / 24);
                      return `${diffDays}d ago`;
                    })()}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-400">
                    {rates.filter(r => isFinite(r.rate)).length}
                  </div>
                  <div className="text-xs text-white/60">Total Rate Options</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">
                    {Array.from(new Set(rates.map(r => r.bank))).length}
                  </div>
                  <div className="text-xs text-white/60">Banks Tracked</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-400">
                    {awprLatest ? `${awprLatest.toFixed(2)}%` : "—"}
                  </div>
                  <div className="text-xs text-white/60">CBSL AWPR</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">
                    {(() => {
                      const allRates = rates.filter(r => isFinite(r.rate));
                      if (!allRates.length) return "—";
                      const avg = allRates.reduce((sum, r) => sum + r.rate, 0) / allRates.length;
                      return `${avg.toFixed(2)}%`;
                    })()}
                  </div>
                  <div className="text-xs text-white/60">Market Average</div>
                </div>
              </div>
            </div>

            {/* Product Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PRODUCTS.map((p) => {
              const top = bestForProduct(p.key);
              return (
                <motion.div
                  key={p.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{
                    scale: 1.04,
                    boxShadow: "0 8px 32px 0 rgba(59,130,246,0.25)",
                    zIndex: 2,
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="rounded-2xl overflow-hidden shadow-lg border border-white/10 transition-all duration-200 cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeSoft} 100%)`,
                  }}
                >
                  <div className="p-6 text-white">
                    <div className="text-white/80 text-xs uppercase tracking-wider mb-1">
                      LOWEST IN {p.label}
                    </div>
                    <div className="text-white text-2xl font-extrabold">
                      {top ? `${top.rate}%` : "—"}{" "}
                      <span className="text-white/60 text-base font-semibold">
                        {top?.type}
                        {top?.type === "Fixed" && top?.fixedYears ? ` (${top.fixedYears}y)` : ""}
                      </span>
                    </div>
                    <div className="text-white/70 mb-2">{top?.bank ? <BankLogoName bank={top.bank} /> : "No data"}</div>
                    
                    {/* Enhanced: Show market stats */}
                    {top && (
                      <div className="flex justify-between items-center text-xs text-white/60 mb-2">
                        <span>Market avg: {(() => {
                          const productRates = rates.filter(r => r.product === p.key && isFinite(r.rate));
                          const avg = productRates.length ? productRates.reduce((sum, r) => sum + r.rate, 0) / productRates.length : 0;
                          return avg ? `${avg.toFixed(2)}%` : "—";
                        })()}</span>
                        <span>{rates.filter(r => r.product === p.key && isFinite(r.rate)).length} options</span>
                      </div>
                    )}
                    
                    {top?.notes && <div className="text-white/60 text-xs mt-1">Note: {top.notes}</div>}
                    
                    {/* Quick Actions */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPage("compare");
                        }}
                        className="flex-1 px-3 py-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                      >
                        Compare
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPage("interest");
                        }}
                        className="flex-1 px-3 py-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                      >
                        View All
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl p-6 border border-white/10" style={{ backgroundColor: BRAND.card }}>
                <div className="mb-4">
                  <div className="text-lg font-semibold">Union Bank vs Market</div>
                  <div className="text-white/70 text-sm">How Union Bank rates compare to market leaders</div>
                </div>
                <div className="space-y-4">
                  {PRODUCTS.map((p, idx) => {
                    const productRates = rates.filter(r => r.product === p.key && isFinite(r.rate));
                    if (!productRates.length) return null;
                    
                    // Find market best (lowest rate)
                    const marketBest = [...productRates].sort((a, b) => a.rate - b.rate)[0];
                    
                    // Find Union Bank's best rate for this product
                    const unionBankRates = productRates.filter(r => r.bank?.toLowerCase().includes('union'));
                    const unionBest = unionBankRates.length ? [...unionBankRates].sort((a, b) => a.rate - b.rate)[0] : null;
                    
                    if (!unionBest) {
                      return (
                        <div key={idx} className="py-2 border-b border-white/10 last:border-b-0">
                          <div className="flex justify-between items-center mb-1">
                            <div className="font-medium text-sm">{p.label}</div>
                            <div className="text-xs text-orange-400">No UB data</div>
                          </div>
                          <div className="text-xs text-white/60">
                            Market best: {marketBest.rate}% ({marketBest.bank})
                          </div>
                        </div>
                      );
                    }
                    
                    const spread = unionBest.rate - marketBest.rate;
                    const isCompetitive = spread <= 0.5; // Within 0.5% is considered competitive
                    const isLeading = spread <= 0;
                    
                    return (
                      <div key={idx} className="py-2 border-b border-white/10 last:border-b-0">
                        <div className="flex justify-between items-center mb-1">
                          <div className="font-medium text-sm">{p.label}</div>
                          <div className={`text-xs font-bold px-2 py-1 rounded ${
                            isLeading ? 'bg-green-500/20 text-green-400' :
                            isCompetitive ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {isLeading ? 'Leading' : isCompetitive ? 'Competitive' : 'Behind'}
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <div className="text-white/70">
                            UB: <span className="font-bold">{unionBest.rate}%</span> vs Market: <span className="font-bold">{marketBest.rate}%</span>
                          </div>
                          <div className={`font-bold ${spread >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {spread >= 0 ? '+' : ''}{spread.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              </div>

              <div className="rounded-2xl p-6 border border-white/10" style={{ backgroundColor: BRAND.card }}>
                <div className="mb-4">
                  <div className="text-lg font-semibold">Market Insights</div>
                  <div className="text-white/70 text-sm">Rate spreads and market dynamics</div>
                </div>
                <div className="space-y-4">
                  {PRODUCTS.map((p, idx) => {
                    const productRates = rates.filter(r => r.product === p.key && isFinite(r.rate));
                    if (!productRates.length) return null;
                    
                    const sorted = [...productRates].sort((a, b) => a.rate - b.rate);
                    const lowest = sorted[0];
                    const highest = sorted[sorted.length - 1];
                    const spread = highest.rate - lowest.rate;
                    
                    return (
                      <div key={idx} className="py-2 border-b border-white/10 last:border-b-0">
                        <div className="flex justify-between items-center mb-1">
                          <div className="font-medium text-sm">{p.label}</div>
                          <div className="text-xs text-white/60">{productRates.length} options</div>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <div className="text-white/70">
                            Spread: <span className="font-bold">{spread.toFixed(2)}%</span>
                          </div>
                          <div className="text-white/70">
                            Range: {lowest.rate}% - {highest.rate}%
                          </div>
                        </div>
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              </div>
            </div>

            {/* AWPR vs FTP (Union Bank) */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: BRAND.card }}>
              <div className="mb-4">
                <div className="text-lg font-semibold">AWPR vs FTP (Union Bank)</div>
                <div className="text-white/70 text-sm">
                  CBSL bi-annual AWPR compared with Union Bank FTP
                </div>
              </div>
              <div className="h-64 w-full">
                <AwprFtpChartMulti
                  cbslRows={cbslRows}
                  ftpMonths={ftpMonths}
                  brand={BRAND}
                />
              </div>
            </div>
          </div>
        )}

        {/* Interest Rates */}
        {page === "interest" && <InterestRatesView rows={canonicalRates} />}
        {page === "tariffs" && <TariffsView rows={tariffs} />}

        {/* Compare */}
          {page === "compare" && (
            <CompareAdvisor
              rows={canonicalRates}
              tariffs={loadJSON<TariffRow[]>("ub.tariffs.v1", [])}
              awpr={awprLatest}
              awplr={awplrLatest}
            />
          )}

        {/* News */}
        {page === "news" && <NewsRoom apiBase={API_BASE} />}

        {/* Admin */}
        {page === "admin" && (
          <div className="mt-6 text-white/80 space-y-6">
            <FtpFileUploader
              initialMonths={ftpMonths}
              onSaveAll={(months) => setFtpMonths(months)}
              onReset={() => setFtpMonths([])}
            />
          </div>
        )}

        {/* Scrapers */}
{page === "scrapers" && (
  <div className="mt-6">
    <ScraperPanel
      apiBase={API_BASE}
      onMerge={(rows) => setRates((prev) => mergeRates(prev, rows))}
      onMergeTariffs={onMergeTariffs}
      onResetRates={() => setRates([])}
      onResetTariffs={() => setTariffs([])}
      onCbsl={(rows) => {
        setCbslRows(rows);
        const { latestAwprFromFetch, latestAwplrFromFetch } = (() => {
          let awpr: number | undefined;
          let awprTs = -Infinity;
          let awplr: number | undefined;
          let awplrTs = -Infinity;
          for (const r of rows) {
            const n = parseFloat(String(r.rate));
            if (!isFinite(n)) continue;
            const tsCandidate = r.weekEnd || r.period || r.updatedAt || "";
            const tsParsed = Date.parse(tsCandidate);
            const tsValue = Number.isFinite(tsParsed) ? tsParsed : -Infinity;
            const metricRaw = String(r.metric || "");
            const metric = metricRaw.toUpperCase();
            const treatAsAwpr = metric ? metric.includes("AWPR") : true;
            if (treatAsAwpr && tsValue >= awprTs) {
              awprTs = tsValue;
              awpr = n;
            }
            if (metric.includes("AWPLR") && tsValue >= awplrTs) {
              awplrTs = tsValue;
              awplr = n;
            }
          }
          return { latestAwprFromFetch: awpr, latestAwplrFromFetch: awplr };
        })();
        if (typeof latestAwprFromFetch === "number" || typeof latestAwplrFromFetch === "number") {
          setRates((prev) =>
            normalizeFormulaRates(
              prev,
              typeof latestAwprFromFetch === "number" ? latestAwprFromFetch : awprLatest,
              typeof latestAwplrFromFetch === "number" ? latestAwplrFromFetch : awplrLatest,
            ));
        }
      }}
      awprLatest={awprLatest}
      awplrLatest={awplrLatest}
    />
  </div>
)}

      </div>

      {/* Global Footer (copyright) */}
      <footer className="bg-[#1f2937] text-white/80 text-xs text-center px-4 py-3">
        © 2025 Chalith Perera. All Rights Reserved. This software is proprietary and confidential.
        Unauthorized copying, distribution, reverse engineering, or disclosure is strictly prohibited.
        Developed by Chalith Perera – Head of Product Management, Retail Assets & Liabilities,
        Union Bank of Colombo PLC. Contact: 077 395 1370
      </footer>
    </div>
  );
}
type NewsEntry = {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt?: string;
  topics?: string[];
  origin?: string;
  image?: string;
};

type NewsResponse = {
  updatedAt?: string;
  count?: number;
  sources?: string[];
  items?: NewsEntry[];
};

const TOPIC_ORDER = ["Banking & Finance", "Policy & Regulation", "Real Estate", "Economy & Markets"];

// Enhanced topic categorization with visual indicators
const TOPIC_CONFIG = {
  "Banking & Finance": { emoji: "🏦", color: "from-blue-500/20 to-blue-600/30", borderColor: "border-blue-400/30" },
  "Policy & Regulation": { emoji: "📋", color: "from-purple-500/20 to-purple-600/30", borderColor: "border-purple-400/30" },
  "Real Estate": { emoji: "🏡", color: "from-green-500/20 to-green-600/30", borderColor: "border-green-400/30" },
  "Economy & Markets": { emoji: "📈", color: "from-orange-500/20 to-orange-600/30", borderColor: "border-orange-400/30" },
};

// Determine article importance based on keywords and recency
function getArticleImportance(article: NewsEntry): "breaking" | "high" | "medium" | "low" {
  const title = article.title.toLowerCase();
  const summary = article.summary.toLowerCase();
  const content = `${title} ${summary}`;
  
  // Breaking news indicators
  const breakingKeywords = ["breaking", "urgent", "alert", "emergency", "crisis"];
  if (breakingKeywords.some(keyword => content.includes(keyword))) {
    return "breaking";
  }
  
  // High importance indicators
  const highKeywords = [
    "central bank", "cbsl", "rate cut", "rate hike", "policy rate", "monetary policy",
    "bank closure", "new bank", "merger", "acquisition", "license",
    "government", "budget", "tax", "regulation change"
  ];
  if (highKeywords.some(keyword => content.includes(keyword))) {
    return "high";
  }
  
  // Medium importance indicators
  const mediumKeywords = [
    "loan", "interest", "mortgage", "housing", "property",
    "digital banking", "mobile app", "new product", "launch"
  ];
  if (mediumKeywords.some(keyword => content.includes(keyword))) {
    return "medium";
  }
  
  return "low";
}

// Get importance styling
function getImportanceStyle(importance: string) {
  switch (importance) {
    case "breaking":
      return {
        border: "border-red-400/60",
        background: "from-red-500/15 via-red-500/10 to-red-500/5",
        indicator: "🚨",
        label: "BREAKING",
        labelColor: "text-red-300 bg-red-500/20"
      };
    case "high":
      return {
        border: "border-yellow-400/50",
        background: "from-yellow-500/15 via-yellow-500/10 to-yellow-500/5",
        indicator: "⚡",
        label: "HIGH IMPACT",
        labelColor: "text-yellow-300 bg-yellow-500/20"
      };
    case "medium":
      return {
        border: "border-blue-400/40",
        background: "from-blue-500/10 via-blue-500/8 to-blue-500/5",
        indicator: "📊",
        label: "NOTABLE",
        labelColor: "text-blue-300 bg-blue-500/20"
      };
    default:
      return {
        border: "border-white/10",
        background: "from-white/5 via-white/5 to-white/[0.04]",
        indicator: "",
        label: "",
        labelColor: ""
      };
  }
}

function formatRelativeTime(iso?: string | null) {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  if (diffMs <= 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} yr${years === 1 ? "" : "s"} ago`;
}

function formatDisplayTime(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function NewsRoom({ apiBase }: { apiBase: string }) {
  const [articles, setArticles] = useState<NewsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTopics, setActiveTopics] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [importanceFilter, setImportanceFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");
  const [readArticles, setReadArticles] = useState<Set<string>>(new Set());
  const [bookmarkedArticles, setBookmarkedArticles] = useState<Set<string>>(new Set());
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"date" | "importance" | "relevance">("date");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const articlesRef = React.useRef<NewsEntry[]>([]);

  // Load read articles and bookmarks from localStorage
  useEffect(() => {
    const savedRead = localStorage.getItem('newsReadArticles');
    const savedBookmarks = localStorage.getItem('newsBookmarks');
    
    if (savedRead) {
      setReadArticles(new Set(JSON.parse(savedRead)));
    }
    if (savedBookmarks) {
      setBookmarkedArticles(new Set(JSON.parse(savedBookmarks)));
    }
  }, []);

  // Save read articles and bookmarks to localStorage
  useEffect(() => {
    localStorage.setItem('newsReadArticles', JSON.stringify([...readArticles]));
  }, [readArticles]);

  useEffect(() => {
    localStorage.setItem('newsBookmarks', JSON.stringify([...bookmarkedArticles]));
  }, [bookmarkedArticles]);

  const markAsRead = (articleId: string) => {
    setReadArticles(prev => new Set([...prev, articleId]));
  };

  const toggleBookmark = (articleId: string) => {
    setBookmarkedArticles(prev => {
      const newSet = new Set([...prev]);
      if (newSet.has(articleId)) {
        newSet.delete(articleId);
      } else {
        newSet.add(articleId);
      }
      return newSet;
    });
  };

  const toggleExpanded = (articleId: string) => {
    setExpandedArticles(prev => {
      const newSet = new Set([...prev]);
      if (newSet.has(articleId)) {
        newSet.delete(articleId);
      } else {
        newSet.add(articleId);
      }
      return newSet;
    });
  };

  const fetchNews = React.useCallback(async (force = false) => {
    try {
      setLoading(force || !articlesRef.current.length);
      setError(null);
      const base = (apiBase || "").replace(/\/$/, "");
      const params = new URLSearchParams({ limit: "60" });
      if (force) params.set("refresh", "true");
      const endpoint = `${base}/api/news?${params.toString()}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data: NewsResponse = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      articlesRef.current = items;
      setArticles(items);
      setUpdatedAt(data.updatedAt ?? null);
      setSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchNews(false);
    const timer = window.setInterval(() => fetchNews(false), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [fetchNews]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const article of articles) {
      if (!article?.topics) continue;
      for (const topic of article.topics) set.add(topic);
    }
    const list = Array.from(set);
    return list.sort((a, b) => {
      const ai = TOPIC_ORDER.indexOf(a);
      const bi = TOPIC_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [articles]);

  const filteredAndSortedArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    
    const filtered = articles.filter((article) => {
      // Topic filter
      const matchesTopic = activeTopics.length
        ? article.topics?.some((topic) => activeTopics.includes(topic))
        : true;
      
      // Source filter
      const matchesSource = activeSources.length
        ? activeSources.includes(article.source)
        : true;
      
      // Importance filter
      const importance = getArticleImportance(article);
      const matchesImportance = importanceFilter.length
        ? importanceFilter.includes(importance)
        : true;
      
      // Date range filter
      const matchesDate = (() => {
        if (dateRange === "all") return true;
        if (!article.publishedAt) return dateRange === "all";
        
        const articleTime = Date.parse(article.publishedAt);
        if (isNaN(articleTime)) return dateRange === "all";
        
        const diffMs = now - articleTime;
        switch (dateRange) {
          case "today": return diffMs <= 24 * 60 * 60 * 1000;
          case "week": return diffMs <= 7 * 24 * 60 * 60 * 1000;
          case "month": return diffMs <= 30 * 24 * 60 * 60 * 1000;
          default: return true;
        }
      })();
      
      // Search filter
      const matchesSearch = q
        ? `${article.title} ${article.summary} ${article.source}`.toLowerCase().includes(q)
        : true;
      
      return matchesTopic && matchesSource && matchesImportance && matchesDate && matchesSearch;
    });

    // Sort articles
    return filtered.sort((a, b) => {
      if (sortBy === "importance") {
        const importanceOrder = { "breaking": 0, "high": 1, "medium": 2, "low": 3 };
        const aImportance = getArticleImportance(a);
        const bImportance = getArticleImportance(b);
        const diff = importanceOrder[aImportance] - importanceOrder[bImportance];
        if (diff !== 0) return diff;
      }
      
      if (sortBy === "relevance" && q) {
        const aScore = (a.title + a.summary).toLowerCase().split(q).length - 1;
        const bScore = (b.title + b.summary).toLowerCase().split(q).length - 1;
        if (aScore !== bScore) return bScore - aScore;
      }
      
      // Default to date sorting
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bTime - aTime;
    });
  }, [articles, activeTopics, activeSources, importanceFilter, dateRange, search, sortBy]);

  const toggleTopic = (topic: string) => {
    setActiveTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const hasData = filteredAndSortedArticles.length > 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Industry Pulse</h2>
          <p className="text-white/70 text-sm md:text-base">
            Live digest of Sri Lanka banking, policy, and real estate developments.
          </p>
          {updatedAt && (
            <div className="text-xs text-white/50 mt-2">
              Synced {formatRelativeTime(updatedAt)}
              {` • ${formatDisplayTime(updatedAt)}`}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search headlines, keywords, sources..."
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/80"
              type="search"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-xs uppercase tracking-widest">
              ⌕
            </span>
          </div>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            style={{
              colorScheme: 'dark'
            }}
          >
            <option value="date" style={{ backgroundColor: '#1f2937', color: 'white' }}>📅 Latest First</option>
            <option value="importance" style={{ backgroundColor: '#1f2937', color: 'white' }}>⚡ By Importance</option>
            <option value="relevance" style={{ backgroundColor: '#1f2937', color: 'white' }}>🎯 Most Relevant</option>
          </select>

          <Btn
            onClick={() => fetchNews(true)}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-[#3b82f6] hover:text-white disabled:opacity-60 transition"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Btn>
        </div>
      </div>

      {/* News Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{articles.length}</div>
          <div className="text-xs text-white/60">Total Articles</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">
            {articles.filter(a => getArticleImportance(a) === "breaking" || getArticleImportance(a) === "high").length}
          </div>
          <div className="text-xs text-white/60">High Priority</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">{readArticles.size}</div>
          <div className="text-xs text-white/60">Articles Read</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-400">{bookmarkedArticles.size}</div>
          <div className="text-xs text-white/60">Bookmarked</div>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="text-xs text-white/50 flex flex-wrap items-center gap-2">
          <span className="text-white/40 uppercase tracking-widest">Active Feeds</span>
          <span>{sources.join(" • ")}</span>
          <span className="text-white/30">•</span>
          <span className="text-white/40">Updated every 5 minutes</span>
        </div>
      )}

      {availableTopics.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">Filter by Topic</h3>
            {activeTopics.length > 0 && (
              <button
                onClick={() => setActiveTopics([])}
                className="text-xs text-white/50 hover:text-white/80 underline underline-offset-4 transition-colors"
              >
                Clear all ({activeTopics.length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTopics.map((topic) => {
              const active = activeTopics.includes(topic);
              const topicConfig = TOPIC_CONFIG[topic as keyof typeof TOPIC_CONFIG];
              const count = articles.filter(article => article.topics?.includes(topic)).length;
              
              return (
                <button
                  key={topic}
                  onClick={() => toggleTopic(topic)}
                  className={`group px-4 py-2 rounded-full text-xs font-medium border transition-all duration-200 flex items-center gap-2 ${
                    active
                      ? topicConfig 
                        ? `${topicConfig.borderColor} bg-gradient-to-r ${topicConfig.color} text-white shadow-lg`
                        : "bg-[#3b82f6]/90 border-[#60a5fa]/70 text-white shadow-lg"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                  }`}
                >
                  <span>{topicConfig?.emoji || "📄"}</span>
                  <span>{topic}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[0.6rem] ${
                    active ? "bg-white/20" : "bg-white/10"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-white/10 bg-white/5">
        {/* Date Range Filter */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">📅 Time Range</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            style={{
              colorScheme: 'dark'
            }}
          >
            <option value="all" style={{ backgroundColor: '#1f2937', color: 'white' }}>All Time</option>
            <option value="today" style={{ backgroundColor: '#1f2937', color: 'white' }}>Today</option>
            <option value="week" style={{ backgroundColor: '#1f2937', color: 'white' }}>This Week</option>
            <option value="month" style={{ backgroundColor: '#1f2937', color: 'white' }}>This Month</option>
          </select>
        </div>

        {/* Source Filter */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">📰 Sources</label>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {sources.map((source) => {
              const active = activeSources.includes(source);
              const count = articles.filter(article => article.source === source).length;
              return (
                <button
                  key={source}
                  onClick={() => setActiveSources(prev => 
                    active ? prev.filter(s => s !== source) : [...prev, source]
                  )}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    active 
                      ? "bg-blue-500/80 text-white" 
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  {source} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Importance Filter */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">⚡ Impact Level</label>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "breaking", label: "Breaking", emoji: "🚨", color: "bg-red-500/20 text-red-300" },
              { key: "high", label: "High", emoji: "⚡", color: "bg-yellow-500/20 text-yellow-300" },
              { key: "medium", label: "Medium", emoji: "📊", color: "bg-blue-500/20 text-blue-300" },
              { key: "low", label: "Low", emoji: "📄", color: "bg-gray-500/20 text-gray-300" }
            ].map(({ key, label, emoji, color }) => {
              const active = importanceFilter.includes(key);
              const count = articles.filter(article => getArticleImportance(article) === key).length;
              
              return (
                <button
                  key={key}
                  onClick={() => setImportanceFilter(prev => 
                    active ? prev.filter(i => i !== key) : [...prev, key]
                  )}
                  className={`px-2 py-1 rounded-full text-xs transition-colors border ${
                    active 
                      ? `${color} border-current`
                      : "bg-white/10 text-white/70 border-white/10 hover:bg-white/20"
                  }`}
                >
                  {emoji} {label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Filters Summary */}
      {(activeTopics.length > 0 || activeSources.length > 0 || importanceFilter.length > 0 || dateRange !== "all") && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-400/20">
          <span className="text-sm font-medium text-blue-300">Active Filters:</span>
          {dateRange !== "all" && (
            <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs">
              📅 {dateRange}
            </span>
          )}
          {activeTopics.map(topic => (
            <span key={topic} className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs">
              {TOPIC_CONFIG[topic as keyof typeof TOPIC_CONFIG]?.emoji} {topic}
            </span>
          ))}
          {activeSources.map(source => (
            <span key={source} className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs">
              📰 {source}
            </span>
          ))}
          {importanceFilter.map(imp => (
            <span key={imp} className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs">
              {getImportanceStyle(imp).indicator} {imp}
            </span>
          ))}
          <button
            onClick={() => {
              setActiveTopics([]);
              setActiveSources([]);
              setImportanceFilter([]);
              setDateRange("all");
            }}
            className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs hover:bg-red-500/30 transition-colors"
          >
            Clear All
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Latest refresh failed: {error}
        </div>
      )}

      {loading && !articles.length && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 h-48 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Bookmarked Articles Section */}
      {bookmarkedArticles.size > 0 && activeTopics.length === 0 && activeSources.length === 0 && importanceFilter.length === 0 && !search && (
        <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 p-6">
          <h3 className="text-lg font-semibold text-yellow-300 mb-4 flex items-center gap-2">
            ⭐ Your Bookmarked Articles ({bookmarkedArticles.size})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {articles
              .filter(article => bookmarkedArticles.has(article.id))
              .slice(0, 4)
              .map(article => (
                <div key={article.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white text-sm mb-1 overflow-hidden" style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>{article.title}</h4>
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>{article.source}</span>
                    <span>{formatRelativeTime(article.publishedAt)}</span>
                  </div>
                </div>
              ))}
          </div>
          {bookmarkedArticles.size > 4 && (
            <div className="text-center mt-4">
              <button
                onClick={() => setActiveSources([])} // This would need to be modified to show only bookmarks
                className="text-sm text-yellow-400 hover:text-yellow-300 underline"
              >
                View all {bookmarkedArticles.size} bookmarked articles
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && !hasData && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-white/70">
          <div className="text-4xl mb-4">📰</div>
          <div className="text-lg font-medium mb-2">No stories found</div>
          <div>Try adjusting your filters or search terms.</div>
          {activeTopics.length > 0 || activeSources.length > 0 || importanceFilter.length > 0 || search.length > 0 && (
            <button
              onClick={() => {
                setActiveTopics([]);
                setActiveSources([]);
                setImportanceFilter([]);
                setSearch("");
                setDateRange("all");
              }}
              className="mt-4 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {hasData && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredAndSortedArticles.map((article) => {
            const importance = getArticleImportance(article);
            const importanceStyle = getImportanceStyle(importance);
            const isRecent = article.publishedAt && 
              (Date.now() - Date.parse(article.publishedAt)) < 24 * 60 * 60 * 1000; // 24 hours
            const isRead = readArticles.has(article.id);
            const isBookmarked = bookmarkedArticles.has(article.id);
            const isExpanded = expandedArticles.has(article.id);
            
            return (
              <motion.div
                key={article.id}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`group relative flex flex-col gap-4 overflow-hidden rounded-2xl border ${importanceStyle.border} bg-gradient-to-br ${importanceStyle.background} p-5 transition-all duration-300 hover:shadow-[0_20px_50px_rgba(96,165,250,0.3)] ${
                  isRead ? 'opacity-75' : ''
                }`}
              >
                {/* Article Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white/70 text-xs uppercase tracking-wide">
                      {article.source}
                    </span>
                    {importanceStyle.label && (
                      <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${importanceStyle.labelColor}`}>
                        {importanceStyle.indicator} {importanceStyle.label}
                      </span>
                    )}
                    {isRecent && !importanceStyle.label && (
                      <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider text-green-300 bg-green-500/20">
                        🆕 FRESH
                      </span>
                    )}
                    {isRead && (
                      <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider text-gray-400 bg-gray-500/20">
                        ✓ READ
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleBookmark(article.id);
                      }}
                      className={`p-1 rounded transition-colors ${
                        isBookmarked 
                          ? 'text-yellow-400 hover:text-yellow-300' 
                          : 'text-white/40 hover:text-yellow-400'
                      }`}
                      title={isBookmarked ? "Remove bookmark" : "Bookmark article"}
                    >
                      {isBookmarked ? "⭐" : "☆"}
                    </button>
                    <span className="text-xs text-white/50" title={formatDisplayTime(article.publishedAt)}>
                      {formatRelativeTime(article.publishedAt) || "—"}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className={`font-semibold leading-snug text-white transition group-hover:text-[#60a5fa] ${
                    importance === "breaking" ? "text-xl" : 
                    importance === "high" ? "text-lg" : "text-base"
                  }`}>
                    {importance === "breaking" && "🚨 "}
                    {article.title}
                  </h3>
                  
                  {article.image && (
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <img
                        src={article.image}
                        alt=""
                        loading="lazy"
                        className="h-44 w-full object-cover opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:scale-105"
                      />
                    </div>
                  )}
                  
                  <p className={`text-sm leading-relaxed text-white/70 ${
                    isExpanded ? '' : 'overflow-hidden'
                  }`} style={isExpanded ? {} : {
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {article.summary}
                  </p>
                  
                  {article.summary.length > 200 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleExpanded(article.id);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {isExpanded ? '↑ Show less' : '↓ Read more'}
                    </button>
                  )}
                </div>

                {article.topics && article.topics.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {article.topics.slice(0, 4).map((topic) => {
                      const topicConfig = TOPIC_CONFIG[topic as keyof typeof TOPIC_CONFIG];
                      return (
                        <span
                          key={topic}
                          className={`rounded-full border px-3 py-1 text-[0.7rem] font-medium uppercase tracking-wide transition-colors ${
                            topicConfig 
                              ? `${topicConfig.borderColor} bg-gradient-to-r ${topicConfig.color} text-white/80`
                              : "border-white/10 bg-white/10 text-white/70"
                          }`}
                        >
                          {topicConfig?.emoji} {topic}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Article Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-xs text-white/50">
                    📖 {Math.max(1, Math.ceil(article.summary.split(' ').length / 200))} min read
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleExpanded(article.id);
                      }}
                      className="text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                      {isExpanded ? 'Collapse' : 'Preview'}
                    </button>
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markAsRead(article.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Read full article →
                    </a>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InterestRatesView({ rows }: { rows: RateRow[] }) {
  type SortKey = "rate" | "bank" | "product" | "type" | "fixedYears" | "updatedAt";
  const [product, setProduct] = useState<ProductKey | "ALL">("ALL");
  const [rateTypeFilter, setRateTypeFilter] = useState<"ALL" | "Fixed" | "Floating">("ALL");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Fan out rows with notes like 'Rates Fixed for N years and variable thereafter'
  const fannedRows = useMemo(() => {
    const fanned: RateRow[] = [];
    const regex = /rates? fixed for (\d+) years? and variable/i;
    for (const row of rows || []) {
      const match = row.notes && regex.exec(row.notes);
      if (match) {
        const n = parseInt(match[1], 10);
        for (let yr = 1; yr <= n; yr++) {
          fanned.push({
            ...row,
            fixedYears: yr,
            notes: `Rates Fixed for ${yr} year${yr > 1 ? 's' : ''} (original: ${row.notes})`,
          });
        }
      } else {
        fanned.push(row);
      }
    }
    return fanned;
  }, [rows]);

  const filtered = useMemo(() => {
    return (fannedRows || [])
      .filter((r) => r && r.bank)
      .filter((r) => (product === "ALL" ? true : r.product === product))
      .filter((r) => (rateTypeFilter === "ALL" ? true : r.type === rateTypeFilter))
      .filter((r) => {
        if (!q) return true;
        const searchLower = q.toLowerCase();
        return (
          r.bank.toLowerCase().includes(searchLower) ||
          (r.notes && r.notes.toLowerCase().includes(searchLower))
        );
      });
  }, [fannedRows, product, rateTypeFilter, q]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: any = (a as any)[sortKey];
      let vb: any = (b as any)[sortKey];

      if (sortKey === "updatedAt") {
        const ta = a?.updatedAt ? new Date(a.updatedAt).getTime() : NaN;
        const tb = b?.updatedAt ? new Date(b.updatedAt).getTime() : NaN;
        va = Number.isFinite(ta) ? ta : -Infinity;
        vb = Number.isFinite(tb) ? tb : -Infinity;
      } else if (sortKey === "rate") {
        va = Number.isFinite(a?.rate) ? a.rate : Infinity;
        vb = Number.isFinite(b?.rate) ? b.rate : Infinity;
      } else if (sortKey === "fixedYears") {
        const fa = Number(a?.fixedYears);
        const fb = Number(b?.fixedYears);
        va = Number.isFinite(fa) ? fa : Infinity;
        vb = Number.isFinite(fb) ? fb : Infinity;
      } else {
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function setSort(k: SortKey) {
    setSortDir((d) => (k === sortKey ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(k);
  }

  function dlCsv() {
    const headers = ["Bank", "Product", "Rate", "Type", "FixedYears", "Notes", "UpdatedAt", "Source"];
    const lines = [headers.join(",")];
    for (const r of sorted) {
      const rateOut = Number.isFinite(r?.rate) ? r.rate : "";
      const fixedOut = Number.isFinite(Number(r?.fixedYears)) ? Number(r.fixedYears) : "";
      const upd = r?.updatedAt && Number.isFinite(new Date(r.updatedAt).getTime())
        ? r.updatedAt
        : "";
      const line = [
        r?.bank ?? "",
        r?.product ?? "",
        `${rateOut}`,
        r?.type ?? "",
        `${fixedOut}`,
        (r?.notes ?? "").replace(/,/g, ";"),
        upd,
        r?.source ?? "",
      ]
        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
        .join(",");
      lines.push(line);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ub-interest-rates.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6">
      {/* NEW: Interest summary matrix (independent product pills) */}
    <InterestSummaryMatrix rows={rows} />
      
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="rounded-lg p-3 bg-white/5 border border-white/10">
          <div className="text-lg font-bold text-blue-400">{filtered.length}</div>
          <div className="text-xs text-white/60">Showing Results</div>
        </div>
        <div className="rounded-lg p-3 bg-white/5 border border-white/10">
          <div className="text-lg font-bold text-green-400">
            {(() => {
              const rates = filtered.filter(r => isFinite(r.rate));
              return rates.length ? `${Math.min(...rates.map(r => r.rate)).toFixed(2)}%` : "—";
            })()}
          </div>
          <div className="text-xs text-white/60">Lowest Rate</div>
        </div>
        <div className="rounded-lg p-3 bg-white/5 border border-white/10">
          <div className="text-lg font-bold text-orange-400">
            {(() => {
              const rates = filtered.filter(r => isFinite(r.rate));
              return rates.length ? `${(rates.reduce((sum, r) => sum + r.rate, 0) / rates.length).toFixed(2)}%` : "—";
            })()}
          </div>
          <div className="text-xs text-white/60">Average Rate</div>
        </div>
        <div className="rounded-lg p-3 bg-white/5 border border-white/10">
          <div className="text-lg font-bold text-purple-400">
            {Array.from(new Set(filtered.map(r => r.bank))).length}
          </div>
          <div className="text-xs text-white/60">Banks</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Product pills */}
        <div className="flex flex-wrap gap-2">
          <Btn
            className={`px-3 py-1.5 rounded-full ${
              product === "ALL" ? "bg-[#3b82f6] text-white" : "bg-white/10"
            }`}
            onClick={() => setProduct("ALL")}
          >
            All
          </Btn>
          {PRODUCTS.map((p) => (
            <Btn
              key={p.key}
              className={`px-3 py-1.5 rounded-full ${
                product === p.key ? "bg-[#3b82f6] text-white" : "bg-white/10"
              }`}
              onClick={() => setProduct(p.key)}
            >
              {p.label}
            </Btn>
          ))}
        </div>

        {/* Enhanced Filters */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <select
            value={rateTypeFilter}
            onChange={(e) => setRateTypeFilter(e.target.value as "ALL" | "Fixed" | "Floating")}
            className="px-3 py-2 rounded-md bg-white/10 outline-none text-sm"
          >
            <option value="ALL">All Types</option>
            <option value="Fixed">Fixed Only</option>
            <option value="Floating">Floating Only</option>
          </select>
          
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bank or notes…"
            className="px-3 py-2 rounded-md bg-white/10 outline-none min-w-[200px]"
          />
          
          <button
            onClick={() => {
              setProduct("ALL");
              setRateTypeFilter("ALL");
              setQ("");
              setSortKey("rate");
              setSortDir("asc");
            }}
            className="px-3 py-2 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm"
          >
            Clear All
          </button>
          
          <Btn className="px-3 py-2 rounded-lg bg-white/10" onClick={dlCsv}>
            📥 Export
          </Btn>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 sticky top-0">
            <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
              <Th onClick={() => setSort("bank")} active={sortKey === "bank"} dir={sortDir}>Bank</Th>
              <Th onClick={() => setSort("product")} active={sortKey === "product"} dir={sortDir}>Product</Th>
              <Th onClick={() => setSort("rate")} active={sortKey === "rate"} dir={sortDir}>Rate</Th>
              <Th onClick={() => setSort("type")} active={sortKey === "type"} dir={sortDir}>Type</Th>
              <Th onClick={() => setSort("fixedYears")} active={sortKey === "fixedYears"} dir={sortDir}>Fixed</Th>
              <Th onClick={() => setSort("updatedAt")} active={sortKey === "updatedAt"} dir={sortDir}>Updated</Th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-white/5">
            {sorted.map((r, i) => {
              const rateDisplay = Number.isFinite(r?.rate) ? `${(r.rate as number).toFixed(2)}%` : "—";
              const fyNum = Number(r?.fixedYears);
              const fixedDisplay = Number.isFinite(fyNum) && fyNum > 0 ? `${fyNum}y` : "—";
              const d = r?.updatedAt ? new Date(r.updatedAt) : null;
              const updatedDisplay = d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "—";

              return (
                <tr key={`${r.bank}-${i}`} className="border-t border-white/10">
                  <td className="px-3 py-2 font-medium whitespace-nowrap min-w-[250px]">
                    <BankLogoName bank={r.bank} />
                  </td>
                  <td className="px-3 py-2">
                    {PRODUCTS.find((p) => p.key === r.product)?.label ?? r.product ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#60a5fa]">{rateDisplay}</span>
                      {(() => {
                        if (!isFinite(r.rate)) return null;
                        const productRates = filtered.filter(fr => fr.product === r.product && isFinite(fr.rate));
                        if (productRates.length < 2) return null;
                        const rates = productRates.map(fr => fr.rate).sort((a, b) => a - b);
                        const lowest = rates[0];
                        const percentile = rates.findIndex(rate => rate >= r.rate) / (rates.length - 1);
                        
                        if (r.rate === lowest) {
                          return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 font-bold">BEST</span>;
                        } else if (percentile <= 0.25) {
                          return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">TOP 25%</span>;
                        } else if (percentile >= 0.75) {
                          return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">HIGH</span>;
                        }
                        return null;
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r?.type ?? "—"}</td>
                  <td className="px-3 py-2">{fixedDisplay}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{updatedDisplay}</span>
                      {(() => {
                        if (!r.updatedAt) return null;
                        const updateDate = new Date(r.updatedAt);
                        const now = new Date();
                        const daysDiff = Math.floor((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24));
                        
                        if (daysDiff <= 1) {
                          return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">NEW</span>;
                        } else if (daysDiff <= 7) {
                          return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">RECENT</span>;
                        } else if (daysDiff > 30) {
                          return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">OLD</span>;
                        }
                        return null;
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-white/80">{r?.notes ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r?.source ? (
                      <a className="text-[#60a5fa] underline" href={r.source} target="_blank" rel="noreferrer">Open</a>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
            {!sorted.length && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-white/70">
                  No rows to show. Run scrapers first or change filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children, onClick, active, dir,
}: { children: React.ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc"; }) {
  return (
    <th onClick={onClick} className={`cursor-pointer select-none ${active ? "text-white" : "text-white/80"}`} title="Sort">
      <div className="flex items-center gap-1">
        <span>{children}</span>
        {active && <span className="text-xs">{dir === "asc" ? "▲" : "▼"}</span>}
      </div>
    </th>
  );
}
// --- Note parsing helpers for constraints/bundles ---
function toMoneyLkr(numStr: string, unit?: string | null): number {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (!isFinite(n)) return NaN;
  const u = (unit || "").toLowerCase();
  if (u.startsWith("bn") || u.startsWith("billion") || u === "b") return n * 1_000_000_000;
  if (u.startsWith("mn") || u.startsWith("mil") || u === "m") return n * 1_000_000;
  return n;
}
function parseLoanCaps(text?: string): { min?: number; max?: number } {
  if (!text) return {};
  const s = text.toLowerCase();

  // Explicit handling for common Sri Lankan loan band patterns
  // Up to Rs. 05 Mn
  let match = s.match(/up to\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|m)/i);
  if (match) {
    const max = toMoneyLkr(match[1], match[2]);
    return { min: undefined, max };
  }
  // Above Rs. 05 Mn up to Rs. 10 Mn
  match = s.match(/above\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|m)\s*up to\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|m)/i);
  if (match) {
    const min = toMoneyLkr(match[1], match[2]) + 1;
    const max = toMoneyLkr(match[3], match[4]);
    return { min, max };
  }
  // Above Rs. 10 Mn
  match = s.match(/above\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|m)/i);
  if (match) {
    const min = toMoneyLkr(match[1], match[2]) + 1;
    return { min, max: undefined };
  }

  // ...existing code...
  const cleanNum = (val?: string | null) =>
    val ? val.replace(/[^0-9.]/g, "") : undefined;
  const cleanUnit = (val?: string | null) =>
    val ? val.replace(/[^a-z]/gi, "") : undefined;

  const durationRegex =
    /(?:\b(year|years|yr|yrs|month|months|tenure)\b|[0-9][0-9,\.]*\s*(?:y|yr|yrs|year|years|month|months))/i;

  const isDurationMatch = (match: RegExpMatchArray | null | undefined) => {
    if (!match || typeof match.index !== "number") return false;
    const window = 24;
    const start = Math.max(0, match.index - window);
    const end = Math.min(s.length, match.index + match[0].length + window);
    const snippet = s.slice(start, end);
    return durationRegex.test(snippet);
  };

  const maxMatches = [
    s.match(/(?:up\s*to|upto|maximum|<=|not\s*exceeding|no\s*more\s*than)\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|bn|billion|m|b)?/i),
    s.match(/(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|bn|billion|m|b)?\s*(?:or\s*below|or\s*less)/i),
    s.match(/(?:loan\s*amount|amount)\s*(?:is|should\s*be)\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|bn|billion|m|b)?\s*(?:or\s*below|or\s*less)/i),
  ];
  const minMatches = [
    s.match(/(?:minimum|>=|at\s*least|not\s*less\s*than)\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|bn|billion|m|b)?/i),
    s.match(/(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|bn|billion|m|b)?\s*(?:or\s*above|or\s*more|and\s*above|and\s*over|greater\s*than)/i),
    s.match(/(?:loan\s*amount|amount)\s*(?:is|should\s*be)\s*(?:rs\.?|lkr)?\s*([0-9.,]+)\s*(mn|million|bn|billion|m|b)?\s*(?:or\s*above|or\s*more)/i),
  ];

  let maxMatch = maxMatches.find(Boolean) || undefined;
  let minMatch = minMatches.find(Boolean) || undefined;

  if (isDurationMatch(maxMatch)) maxMatch = undefined;
  if (isDurationMatch(minMatch)) minMatch = undefined;

  const maxNumStr = maxMatch ? cleanNum(maxMatch[1]) : undefined;
  const minNumStr = minMatch ? cleanNum(minMatch[1]) : undefined;

  const max = maxNumStr ? toMoneyLkr(maxNumStr, cleanUnit(maxMatch?.[2])) : undefined;
  const min = minNumStr ? toMoneyLkr(minNumStr, cleanUnit(minMatch?.[2])) : undefined;

  let resultMin = Number.isFinite(min as number) ? (min as number) : undefined;
  let resultMax = Number.isFinite(max as number) ? (max as number) : undefined;

  if (resultMin == null || resultMax == null) {
    const window = 60;
    const amountRegex = /(?:rs\.?|lkr)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(mn|million|bn|billion|m|b)?/gi;
    let match: RegExpExecArray | null;
    while ((match = amountRegex.exec(s)) !== null) {
      const value = toMoneyLkr(match[1], match[2] ?? null);
      if (!Number.isFinite(value)) continue;
      const before = s.slice(Math.max(0, match.index - window), match.index);
      const after = s.slice(match.index + match[0].length, match.index + match[0].length + window);
      if (durationRegex.test(before) || durationRegex.test(after)) {
        continue;
      }
      const isMaxContext =
        /(?:up\s*to|upto|maximum|<=|not\s*exceeding|no\s*more\s*than|cap|limit|or\s*below|less\s*than)/.test(after) ||
        /(?:maximum|<=|cap|limit|up\s*to|upto)/.test(before);
      const isMinContext =
        /(?:minimum|>=|at\s*least|not\s*less\s*than|floor|or\s*above|or\s*more|greater\s*than)/.test(after) ||
        /(?:minimum|>=|at\s*least|floor)/.test(before);

      if (isMaxContext) {
        if (resultMax == null || value < resultMax) resultMax = value;
      }
      if (isMinContext) {
        if (resultMin == null || value > resultMin) resultMin = value;
      }
    }
  }

  return { min: resultMin, max: resultMax };
}
function requiresFirstHome(notes?: string): boolean {
  if (!notes) return false;
  return /first\s+home\s+(owner|purchase|buyer)/i.test(notes);
}
function parseIntroFixedYears(notes?: string): number | undefined {
  if (!notes) return undefined;
  const m = notes.match(/fixed\s+for\s+([0-9]+)\s*(?:years|yrs|y)/i);
  return m ? parseInt(m[1], 10) : undefined;
}

type SalaryLevel = "none" | "remittance" | "assignment";
function salaryRequirementFromNotes(notes?: string, fallbackRequired?: boolean): SalaryLevel {
  if (!notes) return fallbackRequired ? "remittance" : "none";
  const s = notes.toLowerCase();
  if (/(with\s*or\s*without\s*salary\s*assignment|without\s*salary\s*assignment|without\s*salary\b|no\s*salary\s*assignment)/i.test(s)) {
    return fallbackRequired ? "remittance" : "none";
  }
  if (/(salary\s*assignment|assigned)/i.test(s)) return "assignment";
  if (/(salary\s*remitt?ance|remitted|credited|with\s*salary|salary\s*credit)/i.test(s)) return "remittance";
  return fallbackRequired ? "remittance" : "none";
}
function levelNum(l: SalaryLevel): number { return l === "none" ? 0 : l === "remittance" ? 1 : 2; }
// Treat IB/CC as required only when notes explicitly state a requirement (e.g., "only", "must", "mandatory").
// Many banks list "with/without Credit Card & Internet Banking" which should NOT be treated as a requirement.
function requiresInternetBanking(notes?: string): boolean {
  if (!notes) return false;
  const s = notes.toLowerCase();
  const mentions = /(internet\s*banking|online\s*banking|e-?banking|i-?banking)/.test(s);
  if (!mentions) return false;
  const optional = /(with\s*\/\s*without|with\s*(?:and|& )\s*without|without\s*(?:and|& )\s*with)/.test(s);
  const required = /(require|requires|mandatory|must|only)/.test(s);
  return required && !optional;
}
function requiresCreditCard(notes?: string): boolean {
  if (!notes) return false;
  const s = notes.toLowerCase();
  const mentions = /credit\s*card/.test(s);
  if (!mentions) return false;
  const optional = /(with\s*\/\s*without|with\s*(?:and|& )\s*without|without\s*(?:and|& )\s*with)/.test(s);
  const required = /(require|requires|mandatory|must|only)/.test(s);
  return required && !optional;
}

/** Money input helpers */
function formatMoney(n?: number): string {
  if (n == null || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function parseMoney(s: string): number | undefined {
  const clean = s.replace(/,/g, "").trim();
  if (clean === "") return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
}
type MoneyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | undefined; onChange: (val: number | undefined) => void; hardFormat?: boolean;
};
export function MoneyInput({ value, onChange, hardFormat = false, className = "", ...rest }: MoneyInputProps) {
  const [display, setDisplay] = React.useState<string>(() =>
    value == null ? "" : hardFormat ? formatMoney(value) : String(value)
  );
  React.useEffect(() => { setDisplay(value == null ? "" : hardFormat ? formatMoney(value) : String(value)); }, [value, hardFormat]);
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => { const s = e.target.value; setDisplay(s); onChange(parseMoney(s)); };
  const doFormat = (s: string) => { const n = parseMoney(s); setDisplay(n == null ? "" : formatMoney(n)); };
  return (
    <input
      inputMode="decimal"
      value={display}
      onChange={onInput}
      onBlur={(e) => doFormat(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { doFormat(display); (e.target as HTMLInputElement).blur(); } }}
      className={`w-full px-3 py-2 rounded bg-white/10 outline-none ${className}`}
      placeholder="0.00"
      {...rest}
    />
  );
}
/** Safe JSON clean for tariffs array export (not used in UI, but handy for debugging) */
function TariffsView({ rows }: { rows: TariffRow[] }) {
  // REPLACE SortKey to add feeTypeRaw and rename feeType->category in comments (code key stays "feeType")
  type SortKey = "bank" | "product" | "feeType" | "feeTypeRaw" | "basis" | "description" | "updatedAt";
  const [product, setProduct] = useState<ProductKey | "ALL">("ALL");
  const [feeType, setFeeType] = useState<TariffFeeType | "ALL">("ALL");
  const [basis, setBasis] = useState<TariffBasis | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  
  // Enhanced filtering state
  const [selectedBanks, setSelectedBanks] = useState<string[]>([]);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Smart Calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcProduct, setCalcProduct] = useState<ProductKey>("HL");
  const [calcAmount, setCalcAmount] = useState(5000000);
  const [calcBankCount, setCalcBankCount] = useState(5);

  // Available banks for multi-select
  const availableBanks = useMemo(() => {
    return unique(rows.map(r => r.bank)).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return (rows || [])
      .filter((r) => r && r.bank)
      .filter((r) => (product === "ALL" ? true : r.product === product))
      .filter((r) => (feeType === "ALL" ? true : r.feeType === feeType))
      .filter((r) => (basis === "ALL" ? true : r.basis === basis))
      .filter((r) => selectedBanks.length === 0 ? true : selectedBanks.includes(r.bank))
      .filter((r) => {
        if (!minAmount && !maxAmount) return true;
        if (r.basis !== "flat" || typeof r.value !== "number") return true;
        const min = minAmount ? parseFloat(minAmount) : 0;
        const max = maxAmount ? parseFloat(maxAmount) : Infinity;
        return r.value >= min && r.value <= max;
      })
      .filter((r) => q ? (r.bank + " " + (r.feeTypeRaw || "") + " " + (r.description || "") + " " + (r.notes || "")).toLowerCase().includes(q.toLowerCase()) : true);

    }, [rows, product, feeType, basis, selectedBanks, minAmount, maxAmount, q]);

  // Cost competitiveness analysis
  const costAnalysis = useMemo(() => {
    const analysis = new Map<string, { min: number; q25: number; high: number; all: number[] }>();
    
    // Group by fee category + product for fair comparison
    const groups = new Map<string, TariffRow[]>();
    for (const row of filtered) {
      if (row.basis === "flat" && typeof row.value === "number" && row.value > 0) {
        const key = `${row.feeType}-${row.product}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
    }
    
    // Calculate percentiles for each group
    for (const [key, rows] of groups) {
      const values = rows.map(r => r.value as number).sort((a, b) => a - b);
      if (values.length >= 3) {
        const min = values[0];
        const q25Index = Math.floor(values.length * 0.25);
        const q25 = values[q25Index];
        const highIndex = Math.floor(values.length * 0.75);
        const high = values[highIndex];
        analysis.set(key, { min, q25, high, all: values });
      }
    }
    
    return analysis;
  }, [filtered]);

  // Enhanced sorted with competitiveness badges
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: any = (a as any)[sortKey];
      let vb: any = (b as any)[sortKey];

      if (sortKey === "updatedAt") {
        const ta = va ? new Date(va).getTime() : -Infinity;
        const tb = vb ? new Date(vb).getTime() : -Infinity;
        va = Number.isFinite(ta) ? ta : -Infinity;
        vb = Number.isFinite(tb) ? tb : -Infinity;
      } else {
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Function to get cost competitiveness badge  
  const getCostBadge = useCallback((row: TariffRow) => {
    if (row.basis !== "flat" || typeof row.value !== "number" || row.value <= 0) {
      return null;
    }
    
    const key = `${row.feeType}-${row.product}`;
    const stats = costAnalysis.get(key);
    if (!stats) return null;
    
    const value = row.value;
    if (value === stats.min) {
      return { label: "LOWEST", className: "bg-green-500 text-white" };
    } else if (value <= stats.q25) {
      return { label: "COMPETITIVE", className: "bg-blue-500 text-white" };
    } else if (value >= stats.high) {
      return { label: "HIGH", className: "bg-red-500 text-white" };
    }
    return null;
  }, [costAnalysis]);

  function setSort(k: SortKey) {
    setSortDir((d) => (k === sortKey ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(k);
  }

    function fmtAmount(t: TariffRow): string {
    // Prefer the raw "amount" text if your endpoint provided it
    const raw = (t as any).amount;
    if (raw && typeof raw === "string") return raw;

    // Otherwise compose a human-readable string from basis/value/min/max/notes
    if (t.basis === "actuals") return "At actuals";
    if (t.basis === "percent") {
      const v = typeof t.value === "number" ? `${t.value}%` : "";
      const min = Number.isFinite(t.min as number) ? `   Min LKR ${new Intl.NumberFormat("en-US").format(t.min as number)}` : "";
      const max = Number.isFinite(t.max as number) ? `   Max LKR ${new Intl.NumberFormat("en-US").format(t.max as number)}` : "";
      return (v + min + max).replace(/^   /, "") || "—";
    }
    // flat
    const v = Number.isFinite(t.value as number) ? `LKR ${new Intl.NumberFormat("en-US").format(t.value as number)}` : "";
    const min = Number.isFinite(t.min as number) ? `   Min LKR ${new Intl.NumberFormat("en-US").format(t.min as number)}` : "";
    const max = Number.isFinite(t.max as number) ? `   Max LKR ${new Intl.NumberFormat("en-US").format(t.max as number)}` : "";
    return (v + min + max).replace(/^   /, "") || "—";
  }
  // REPLACE dlCsv to include Category (normalized) and Fee Type (raw)
function dlCsv() {
  const headers = [
    "Bank",
    "Product",
    "Category",   // normalized
    "Fee Type",   // raw from scraper
    "Basis",
    "Description",
    "Amount",
    "Updated",
    "Notes",
    "Source",
  ];
  const lines = [headers.join(",")];

  for (const r of sorted) {
    const line = [
      r.bank,
      r.product,
      String(r.feeType).replace(/_/g, " "),
      r.feeTypeRaw ?? "",
      r.basis,
      (r.description ?? "").replace(/,/g, ";"),
      (typeof (r as any).amount === "string" && (r as any).amount)
        ? (r as any).amount.replace(/,/g, ";")
        : ( // fallback to previously formatted amount
            (() => {
              if (r.basis === "actuals") return "At actuals";
              if (r.basis === "percent") {
                const v = typeof r.value === "number" ? `${r.value}%` : "";
                const min = Number.isFinite(r.min as number) ? `   Min LKR ${new Intl.NumberFormat("en-US").format(r.min as number)}` : "";
                const max = Number.isFinite(r.max as number) ? `   Max LKR ${new Intl.NumberFormat("en-US").format(r.max as number)}` : "";
                return (v + min + max).replace(/^   /, "");
              }
              const v = Number.isFinite(r.value as number) ? `LKR ${new Intl.NumberFormat("en-US").format(r.value as number)}` : "";
              const min = Number.isFinite(r.min as number) ? `   Min LKR ${new Intl.NumberFormat("en-US").format(r.min as number)}` : "";
              const max = Number.isFinite(r.max as number) ? `   Max LKR ${new Intl.NumberFormat("en-US").format(r.max as number)}` : "";
              return (v + min + max).replace(/^   /, "");
            })()
          ),
      r.updatedAt ?? "",
      (r.notes ?? "").replace(/,/g, ";"),
      r.source ?? "",
    ]
      .map((x) => `"${String(x).replace(/"/g, '""')}"`)
      .join(",");
    lines.push(line);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ub-tariffs.csv";
  a.click();
  URL.revokeObjectURL(url);
}

  // Quick stats for filtered results
  const quickStats = useMemo(() => {
    const uniqueBanks = unique(filtered.map(r => r.bank));
    const uniqueProducts = unique(filtered.map(r => r.product));
    const uniqueCategories = unique(filtered.map(r => r.feeType));
    
    // Calculate fee amount ranges for flat fees
    const flatFees = filtered
      .filter(r => r.basis === "flat" && typeof r.value === "number" && r.value > 0)
      .map(r => r.value as number)
      .sort((a, b) => a - b);
    
    // Calculate percent fee ranges
    const percentFees = filtered
      .filter(r => r.basis === "percent" && typeof r.value === "number" && r.value > 0)
      .map(r => r.value as number)
      .sort((a, b) => a - b);

    // Data freshness analysis
    const now = Date.now();
    const fresh = filtered.filter(r => {
      if (!r.updatedAt) return false;
      const age = now - new Date(r.updatedAt).getTime();
      return age < 7 * 24 * 60 * 60 * 1000; // 7 days
    }).length;

    return {
      totalRows: filtered.length,
      bankCount: uniqueBanks.length,
      productCount: uniqueProducts.length,
      categoryCount: uniqueCategories.length,
      flatFeeRange: flatFees.length > 0 ? { min: flatFees[0], max: flatFees[flatFees.length - 1] } : null,
      percentFeeRange: percentFees.length > 0 ? { min: percentFees[0], max: percentFees[percentFees.length - 1] } : null,
      freshDataCount: fresh,
      freshPercentage: filtered.length > 0 ? Math.round((fresh / filtered.length) * 100) : 0
    };
  }, [filtered]);

  return (
    <div className="mt-6">
      {/* NEW: Summary Matrix (product-specific, independent of filters) */}
      <TariffSummaryMatrix rows={rows} />
      
      {/* Quick Statistics Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{quickStats.totalRows.toLocaleString()}</div>
          <div className="text-sm text-white/70">Fee Records</div>
        </div>
        
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{quickStats.bankCount}</div>
          <div className="text-sm text-white/70">Banks Covered</div>
        </div>
        
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{quickStats.categoryCount}</div>
          <div className="text-sm text-white/70">Fee Categories</div>
        </div>
        
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="text-2xl font-bold text-green-400">{quickStats.freshPercentage}%</div>
          <div className="text-sm text-white/70">Fresh Data</div>
        </div>
      </div>

      {/* Fee Range Insights */}
      {(quickStats.flatFeeRange || quickStats.percentFeeRange) && (
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-4 mb-6 border border-white/10">
          <h3 className="text-lg font-semibold mb-3">Fee Range Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickStats.flatFeeRange && (
              <div>
                <div className="text-sm text-white/70 mb-1">Flat Fees Range</div>
                <div className="text-xl font-bold">
                  LKR {quickStats.flatFeeRange.min.toLocaleString()} - {quickStats.flatFeeRange.max.toLocaleString()}
                </div>
              </div>
            )}
            {quickStats.percentFeeRange && (
              <div>
                <div className="text-sm text-white/70 mb-1">Percentage Fees Range</div>
                <div className="text-xl font-bold">
                  {quickStats.percentFeeRange.min}% - {quickStats.percentFeeRange.max}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Fee Calculator Widget */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-xl p-6 mb-6 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">🧮 Smart Fee Calculator</h3>
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            {showCalculator ? 'Hide' : 'Show'}
          </button>
        </div>
        
        {showCalculator && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Product Type</label>
                <select
                  value={calcProduct}
                  onChange={(e) => setCalcProduct(e.target.value as ProductKey)}
                  className="w-full px-3 py-2 rounded-md bg-white text-black outline-none"
                >
                  <option value="HL">Home Loan</option>
                  <option value="LAP">Loan Against Property</option>
                  <option value="PL">Personal Loan</option>
                  <option value="EL">Education Loan</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Loan Amount (LKR)</label>
                <input
                  type="number"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(Number(e.target.value))}
                  placeholder="5,000,000"
                  min="0"
                  step="100000"
                  className="w-full px-3 py-2 rounded-md bg-white text-black outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Compare Banks</label>
                <select
                  value={calcBankCount}
                  onChange={(e) => setCalcBankCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-white text-black outline-none"
                >
                  <option value={3}>Top 3 Banks</option>
                  <option value={5}>Top 5 Banks</option>
                  <option value={10}>All Banks</option>
                </select>
              </div>
            </div>
            
            {calcAmount > 0 && (
              <div className="mt-6">
                <h4 className="text-md font-semibold mb-3">💰 Upfront Cost Comparison</h4>
                <div className="grid gap-3">
                  {(() => {
                    // Calculate upfront costs for each bank
                    const bankCosts = unique(filtered.map(r => r.bank))
                      .filter(bank => filtered.some(r => r.bank === bank && r.product === calcProduct))
                      .map(bank => {
                        const result = sumUpfrontTariffsForBank(rows, bank, calcProduct, calcAmount);
                        return {
                          bank,
                          total: result.total,
                          breakdown: result.picked,
                          hasActuals: result.actualsFlags.length > 0
                        };
                      })
                      .filter(result => result.total > 0 || result.hasActuals)
                      .sort((a, b) => a.total - b.total)
                      .slice(0, calcBankCount);

                    if (bankCosts.length === 0) {
                      return (
                        <div className="text-center py-6 text-white/70">
                          No fee data available for {PRODUCTS.find(p => p.key === calcProduct)?.label} 
                          with amount LKR {calcAmount.toLocaleString()}
                        </div>
                      );
                    }

                    const lowestCost = bankCosts[0]?.total || 0;

                    return bankCosts.map((result, index) => (
                      <div 
                        key={result.bank}
                        className={`p-4 rounded-lg border ${
                          index === 0 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <BankLogoName bank={result.bank} />
                            {index === 0 && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500 text-white">
                                LOWEST
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold">
                              LKR {result.total.toLocaleString()}
                            </div>
                            {index > 0 && lowestCost > 0 && (
                              <div className="text-sm text-white/70">
                                +{((result.total - lowestCost) / lowestCost * 100).toFixed(1)}% more
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-sm space-y-1 text-white/80">
                          {result.breakdown
                            .filter(item => item.computed || item.note)
                            .map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span className="capitalize">{String(item.cat).replace(/_/g, ' ')}</span>
                                <span>
                                  {item.computed 
                                    ? `LKR ${item.computed.toLocaleString()}`
                                    : item.note
                                  }
                                </span>
                              </div>
                            ))}
                          {result.hasActuals && (
                            <div className="text-xs text-yellow-400 mt-2">
                              ⚠️ Some fees are "at actuals" - final costs may vary
                            </div>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Product pills */}
        <div className="flex flex-wrap gap-2">
          <Btn
            className={`px-3 py-1.5 rounded-full ${product === "ALL" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`}
            onClick={() => setProduct("ALL")}
          >
            All
          </Btn>
          {PRODUCTS.map((p) => (
            <Btn
              key={p.key}
              className={`px-3 py-1.5 rounded-full ${product === p.key ? "bg-[#3b82f6] text-white" : "bg-white/10"}`}
              onClick={() => setProduct(p.key)}
            >
              {p.label}
            </Btn>
          ))}
        </div>

        {/* Fee type */}
        <select
          value={feeType}
          onChange={(e) => setFeeType(e.target.value as any)}
          className="px-3 py-2 rounded-md bg-white text-black outline-none select-light"
          title="Category"
        >
          <option value="ALL">All fee categories</option>
          <option value="processing">Processing</option>
          <option value="legal">Legal</option>
          <option value="valuation">Valuation</option>
          <option value="crib">CRIB</option>
          <option value="early_settlement">Early Settlement</option>
          <option value="stamp_duty">Stamp Duty</option>
          <option value="penalty">Penalty</option>
          <option value="other">Other</option>
        </select>

        {/* Basis */}
        <select
          value={basis}
          onChange={(e) => setBasis(e.target.value as any)}
          className="px-3 py-2 rounded-md bg-white text-black outline-none select-light"
          title="Basis"
        >
          <option value="ALL">All basis</option>
          <option value="percent">Percent</option>
          <option value="flat">Flat</option>
          <option value="actuals">Actuals</option>
        </select>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
        >
          {showAdvancedFilters ? 'Hide Filters' : 'More Filters'}
        </button>

        {/* Search + download */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search bank or notes…"
          className="ml-auto px-3 py-2 rounded-md bg-white/10 outline-none"
        />
        <Btn className="px-3 py-2 rounded-lg bg-white/10" onClick={dlCsv}>
          Download
        </Btn>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="bg-white/5 rounded-xl p-4 mb-4 border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Bank Multi-Select */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Banks ({selectedBanks.length}/{availableBanks.length})
              </label>
              <div className="max-h-32 overflow-y-auto bg-white/10 rounded-md p-2 space-y-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/10 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedBanks.length === 0}
                    onChange={() => setSelectedBanks([])}
                    className="rounded"
                  />
                  <span className="font-medium text-blue-400">All Banks</span>
                </label>
                {availableBanks.map(bank => (
                  <label key={bank} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/10 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedBanks.includes(bank)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBanks([...selectedBanks, bank]);
                        } else {
                          setSelectedBanks(selectedBanks.filter(b => b !== bank));
                        }
                      }}
                      className="rounded"
                    />
                    <span className="truncate">{bank}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Amount Range */}
            <div>
              <label className="block text-sm font-medium mb-2">Fee Amount Range (LKR)</label>
              <div className="space-y-2">
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="Min amount"
                  className="w-full px-3 py-2 rounded-md bg-white text-black outline-none text-sm"
                />
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="Max amount"
                  className="w-full px-3 py-2 rounded-md bg-white text-black outline-none text-sm"
                />
              </div>
            </div>

            {/* Quick Filters */}
            <div>
              <label className="block text-sm font-medium mb-2">Quick Actions</label>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSelectedBanks([]);
                    setMinAmount("");
                    setMaxAmount("");
                    setQ("");
                    setProduct("ALL");
                    setFeeType("ALL");
                    setBasis("ALL");
                  }}
                  className="w-full px-3 py-2 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm transition-colors"
                >
                  Clear All Filters
                </button>
                <button
                  onClick={() => {
                    const topBanks = availableBanks.slice(0, 5);
                    setSelectedBanks(topBanks);
                  }}
                  className="w-full px-3 py-2 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm transition-colors"
                >
                  Top 5 Banks Only
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 sticky top-0">
  <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
    <Th onClick={() => setSort("bank")} active={sortKey === "bank"} dir={sortDir}>Bank</Th>
    <Th onClick={() => setSort("product")} active={sortKey === "product"} dir={sortDir}>Product</Th>
    {/* Category (normalized bucket) */}
    <Th onClick={() => setSort("feeType")} active={sortKey === "feeType"} dir={sortDir}>Category</Th>
    {/* New: Fee Type (raw from scraper) */}
    <Th onClick={() => setSort("feeTypeRaw")} active={sortKey === "feeTypeRaw"} dir={sortDir}>Fee Type</Th>
    <Th onClick={() => setSort("basis")} active={sortKey === "basis"} dir={sortDir}>Basis</Th>
    <Th onClick={() => setSort("description")} active={sortKey === "description"} dir={sortDir}>Description</Th>
    <th className="px-3 py-2">Amount</th>
    <Th onClick={() => setSort("updatedAt")} active={sortKey === "updatedAt"} dir={sortDir}>Updated</Th>
    <th className="px-3 py-2">Notes</th>
    <th className="px-3 py-2">Source</th>
  </tr>
</thead>
          <tbody className="[&>tr:nth-child(even)]:bg-white/5">
            {sorted.map((r, i) => {
              const upd = r.updatedAt ? new Date(r.updatedAt) : null;
              const updDisplay = upd && !Number.isNaN(upd.getTime()) ? upd.toLocaleString() : "—";

              return (
                <tr key={`${r.bank}-${r.product}-${r.feeType}-${i}`} className="border-t border-white/10">
                  <td className="px-3 py-2 font-medium whitespace-nowrap min-w-[250px]">
                    <BankLogoName bank={r.bank} />
                  </td>
                  <td className="px-3 py-2">
                    {PRODUCTS.find((p) => p.key === r.product)?.label ?? r.product}
                  </td>
                  <td className="px-3 py-2">{String(r.feeType).replace(/_/g, " ")}</td>
                  <td className="px-3 py-2">{r.feeTypeRaw ?? "—"}</td> {/* NEW: raw fee type */}
                  <td className="px-3 py-2 capitalize">{r.basis}</td>
                  <td className="px-3 py-2">{r.description ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{fmtAmount(r)}</span>
                      {(() => {
                        const badge = getCostBadge(r);
                        return badge ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{updDisplay}</span>
                      {(() => {
                        if (!r.updatedAt) return null;
                        const now = Date.now();
                        const age = now - new Date(r.updatedAt).getTime();
                        const days = Math.floor(age / (24 * 60 * 60 * 1000));
                        
                        if (days <= 7) {
                          return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500 text-white">NEW</span>;
                        } else if (days <= 30) {
                          return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500 text-white">RECENT</span>;
                        } else if (days <= 90) {
                          return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500 text-white">OLD</span>;
                        } else {
                          return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">STALE</span>;
                        }
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-white/80">
                    <div className="flex items-center gap-2">
                      <span>{r.notes ?? "—"}</span>
                      {(() => {
                        // Data quality indicators
                        const hasRange = (r.min != null && r.max != null) || (r.description && r.description.includes("-"));
                        const hasSpecifics = r.description && r.description.length > 10;
                        const isActuals = r.basis === "actuals";
                        
                        if (isActuals) {
                          return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">⚠️ VARIABLE</span>;
                        } else if (hasRange && hasSpecifics) {
                          return <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/20 text-green-400">✓ DETAILED</span>;
                        } else if (hasSpecifics) {
                          return <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">◐ BASIC</span>;
                        }
                        return null;
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.source ? (
                      <a className="text-[#60a5fa] underline" href={r.source} target="_blank" rel="noreferrer">Open</a>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
            {!sorted.length && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-white/70">
                  No tariff rows to show. Run tariff scrapers first or change filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TariffSummaryMatrix({
  rows,
}: {
  rows: TariffRow[];
}) {
  const [prod, setProd] = useState<ProductKey>("HL");
  const [viewMode, setViewMode] = useState<"comparison" | "ranking" | "grid">("grid");
  const [sortBy, setSortBy] = useState<"bank" | "cost" | "coverage">("bank");

  const banks = useMemo(() => {
    const names = unique(rows.map((r) => r.bank)).sort();
    return names;
  }, [rows]);

  const dataByCatBank = useMemo(() => {
    const map: Record<
      TariffFeeType,
      Record<string, Array<{ description?: string; amount?: string }>>
    > = {} as any;
    for (const cat of CATEGORY_ORDER) map[cat] = {};
    for (const b of banks)
      for (const cat of CATEGORY_ORDER) map[cat][b] = [];

    for (const r of rows) {
      if (r.product !== prod) continue;
      const cat = r.feeType ?? "other";
      (map[cat][r.bank] ||= []).push({
        description: r.description,
        amount: r.amount,
      });
    }

    // sort and dedupe
    for (const cat of CATEGORY_ORDER) {
      for (const b of banks) {
        const items = map[cat][b] || [];
        const key = (x: { description?: string; amount?: string }) =>
          (x.description || "").toLowerCase().trim() +
          "||" +
          (x.amount || "").toLowerCase().trim();
        const dedup = Array.from(
          new Map(items.map((i) => [key(i), i])).values()
        ).sort(
          byAlpha(
            (i) =>
              (i.description || i.amount || "").toLowerCase()
          )
        );
        map[cat][b] = dedup;
      }
    }
    return map;
  }, [rows, banks, prod]);

  // Enhanced analytics for matrix
  const matrixAnalytics = useMemo(() => {
    const bankScores = new Map<string, { totalCost: number; coverage: number; competitiveness: number }>();
    
    for (const bank of banks) {
      let totalCost = 0;
      let coverageCount = 0;
      let competitiveCount = 0;
      
      for (const cat of CATEGORY_ORDER) {
        const items = dataByCatBank[cat][bank] || [];
        if (items.length > 0) {
          coverageCount++;
          
          // Try to calculate costs for flat fees
          for (const item of items) {
            if (item.amount) {
              const costMatch = item.amount.match(/LKR\s*([\d,]+)/);
              if (costMatch) {
                const cost = parseInt(costMatch[1].replace(/,/g, ''));
                if (!isNaN(cost)) {
                  totalCost += cost;
                  
                  // Simple competitiveness check - if cost is relatively low
                  if (cost < 50000) competitiveCount++;
                }
              }
            }
          }
        }
      }
      
      bankScores.set(bank, {
        totalCost,
        coverage: (coverageCount / CATEGORY_ORDER.length) * 100,
        competitiveness: (competitiveCount / coverageCount) * 100 || 0
      });
    }
    
    return bankScores;
  }, [dataByCatBank, banks]);

  const tariffTableRef = useRef<HTMLTableElement | null>(null);
  const tariffTopScrollRef = useRef<HTMLDivElement | null>(null);
  const tariffBottomScrollRef = useRef<HTMLDivElement | null>(null);
  const tariffGhostRef = useRef<HTMLDivElement | null>(null);
  const tariffSyncRef = useRef<"top" | "bottom" | null>(null);

  useEffect(() => {
    const table = tariffTableRef.current;
    const ghost = tariffGhostRef.current;
    if (table && ghost) {
      ghost.style.width = `${table.scrollWidth}px`;
    }
  }, [banks, dataByCatBank]);

  const syncTariffScrollTop = (e: React.UIEvent<HTMLDivElement>) => {
    if (tariffSyncRef.current === "bottom") return;
    tariffSyncRef.current = "top";
    if (tariffBottomScrollRef.current) {
      tariffBottomScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    tariffSyncRef.current = null;
  };

  const syncTariffScrollBottom = (e: React.UIEvent<HTMLDivElement>) => {
    if (tariffSyncRef.current === "top") return;
    tariffSyncRef.current = "bottom";
    if (tariffTopScrollRef.current) {
      tariffTopScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    tariffSyncRef.current = null;
  };

  function CellList({
    items,
  }: {
    items: Array<{ description?: string; amount?: string }>;
  }) {
    if (!items?.length) return <span className="text-white/40">—</span>;
    const maxShow = 4;
    const shown = items.slice(0, maxShow);
    const extra = items.length - shown.length;
    return (
      <div className="space-y-1">
        {shown.map((it, idx) => (
          <div key={idx} className="text-xs leading-snug">
            <span className="font-medium">{it.description || "—"}</span>
            {it.amount ? (
              <span className="text-white/70"> — {it.amount}</span>
            ) : null}
          </div>
        ))}
        {extra > 0 && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">
            +{extra} more
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-white/10 p-4 mb-5 overflow-auto"
      style={{ backgroundColor: BRAND.card }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-base font-semibold">
          Tariff Summary (by Category × Bank)
        </div>
        <div className="flex flex-wrap gap-2">
          {PRODUCTS.map((p) => (
            <Btn
              key={p.key}
              className={`px-3 py-1.5 rounded-full ${
                prod === p.key
                  ? "bg-[#3b82f6] text-white"
                  : "bg-white/10"
              }`}
              onClick={() => setProd(p.key)}
            >
              {p.label}
            </Btn>
          ))}
        </div>
      </div>

      {/* Enhanced View Controls */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`px-3 py-1.5 rounded-md text-sm ${
              viewMode === "grid" ? "bg-blue-500 text-white" : "bg-white/10"
            }`}
          >
            📊 Grid View
          </button>
          <button
            onClick={() => setViewMode("comparison")}
            className={`px-3 py-1.5 rounded-md text-sm ${
              viewMode === "comparison" ? "bg-blue-500 text-white" : "bg-white/10"
            }`}
          >
            ⚖️ Comparison
          </button>
          <button
            onClick={() => setViewMode("ranking")}
            className={`px-3 py-1.5 rounded-md text-sm ${
              viewMode === "ranking" ? "bg-blue-500 text-white" : "bg-white/10"
            }`}
          >
            🏆 Rankings
          </button>
        </div>
        
        {viewMode === "ranking" && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 rounded-md bg-white text-black text-sm"
          >
            <option value="bank">By Bank Name</option>
            <option value="cost">By Total Cost</option>
            <option value="coverage">By Data Coverage</option>
          </select>
        )}
      </div>

      {/* Rankings View */}
      {viewMode === "ranking" && (
        <div className="space-y-4">
          {(() => {
            const sortedBanks = [...banks].sort((a, b) => {
              const scoreA = matrixAnalytics.get(a);
              const scoreB = matrixAnalytics.get(b);
              
              if (sortBy === "cost") {
                return (scoreA?.totalCost || 0) - (scoreB?.totalCost || 0);
              } else if (sortBy === "coverage") {
                return (scoreB?.coverage || 0) - (scoreA?.coverage || 0);
              }
              return a.localeCompare(b);
            });

            return sortedBanks.map((bank, index) => {
              const analytics = matrixAnalytics.get(bank);
              return (
                <div key={bank} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-blue-400">#{index + 1}</span>
                      <BankLogoName bank={bank} />
                    </div>
                    <div className="flex gap-4 text-sm">
                      {analytics && (
                        <>
                          <div className="text-center">
                            <div className="font-bold">LKR {analytics.totalCost.toLocaleString()}</div>
                            <div className="text-white/60">Est. Cost</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold">{analytics.coverage.toFixed(0)}%</div>
                            <div className="text-white/60">Coverage</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {CATEGORY_ORDER.map(cat => {
                      const items = dataByCatBank[cat][bank] || [];
                      return (
                        <div key={cat} className="bg-white/5 rounded p-2">
                          <div className="font-medium capitalize mb-1">
                            {String(cat).replace(/_/g, ' ')}
                          </div>
                          {items.length > 0 ? (
                            <div className="space-y-1">
                              {items.slice(0, 2).map((item, idx) => (
                                <div key={idx} className="text-white/80">
                                  {item.amount || item.description || "—"}
                                </div>
                              ))}
                              {items.length > 2 && (
                                <div className="text-white/60">+{items.length - 2} more</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-white/40">No data</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Comparison View */}
      {viewMode === "comparison" && (
        <div className="space-y-4">
          {CATEGORY_ORDER.map(cat => (
            <div key={cat} className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h4 className="font-semibold capitalize mb-3 text-lg">
                {String(cat).replace(/_/g, ' ')} Comparison
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {banks
                  .filter(bank => (dataByCatBank[cat][bank] || []).length > 0)
                  .map(bank => (
                    <div key={bank} className="bg-white/5 rounded p-3 border border-white/10">
                      <div className="flex items-center gap-2 mb-2">
                        {BANK_LOGOS[bank] && (
                          <img
                            src={BANK_LOGOS[bank]}
                            alt={bank}
                            className="h-6 w-6 rounded bg-white object-contain"
                          />
                        )}
                        <span className="font-medium text-sm">{bank}</span>
                      </div>
                      <CellList items={dataByCatBank[cat][bank]} />
                    </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid View (Original Matrix) */}
      {viewMode === "grid" && (
        <div className="relative">
          <div className="overflow-x-auto" ref={tariffTopScrollRef} onScroll={syncTariffScrollTop}>
            <div ref={tariffGhostRef} className="h-3" />
          </div>
          <div className="overflow-x-auto" ref={tariffBottomScrollRef} onScroll={syncTariffScrollBottom}>
            <table className="min-w-[900px] text-sm" ref={tariffTableRef}>
            <thead className="bg-white/5 sticky top-0">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-center align-bottom">
                <th
                  className="w-40 text-left sticky left-0"
                  style={{ backgroundColor: "#2c313c", zIndex: 3 }}
                >
                  Fee Category
                </th>
                {banks.map((b) => (
                  <th
                    key={b}
                    className="px-3 py-2 text-center align-bottom"
                    style={{ backgroundColor: "#1d2430" }}
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      {BANK_LOGOS[b] ? (
                        <img
                          src={BANK_LOGOS[b]}
                          alt={b}
                          className="h-10 w-10 rounded-md bg-white shadow border"
                          style={{ objectFit: "contain" }}
                        />
                      ) : null}
                      <span className="text-xs font-medium text-white/80 text-center w-24 break-words">
                        {b}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-white/5 align-top">
              {CATEGORY_ORDER.map((cat, rowIdx) => {
                const STICKY_SHADE_ODD = "#161b27";
                const STICKY_SHADE_EVEN = "#212632";
                const stickyBg = rowIdx % 2 === 0 ? STICKY_SHADE_ODD : STICKY_SHADE_EVEN;

                return (
                  <tr key={cat} className="border-t border-white/10 align-top">
                    <td
                      className="px-3 py-2 font-medium capitalize text-left sticky left-0"
                      style={{ backgroundColor: stickyBg, zIndex: 2 }}
                    >
                      {String(cat).replace(/_/g, " ")}
                    </td>
                    {banks.map((b) => (
                      <td key={`${cat}-${b}`} className="px-3 py-2 align-top text-left whitespace-nowrap">
                        <CellList items={dataByCatBank[cat][b]} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <div className="mt-2 text-xs text-white/60">
        {viewMode === "grid" && "Tip: Click the product pills to switch the matrix; the detailed table below remains unaffected."}
        {viewMode === "comparison" && "📊 Compare fees across banks by category for easier decision making."}
        {viewMode === "ranking" && "🏆 Banks ranked by cost-effectiveness and data coverage for your selected product."}
      </div>
    </div>
  );
}
function InterestSummaryMatrix({ rows }: { rows: RateRow[] }) {
  const [prod, setProd] = useState<ProductKey>("HL");

  // bank list
  const banks = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.bank))).sort();
    return names;
  }, [rows]);

  // row labels for the matrix (display order)
  const YEAR_LABELS: Array<"Variable" | number | "Above 20"> = [
    "Variable",
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    "Above 20",
  ];

  // Build: bank -> yearKey -> best numeric rate
  const grid = useMemo(() => {
    type YearKey = "Variable" | number | "Above 20";
    const m: Record<string, Partial<Record<YearKey, number>>> = {};
    for (const b of banks) m[b] = {};

    for (const r of rows) {
      if (r.product !== prod) continue;
      if (!r || !r.bank) continue;
      const rateNum = typeof r.rate === "number" && isFinite(r.rate) ? r.rate : undefined;
      if (rateNum == null) continue;

      if (r.type === "Floating") {
        const cur = m[r.bank]["Variable"];
        m[r.bank]["Variable"] = cur == null ? rateNum : Math.min(cur, rateNum);
      } else if (r.type === "Fixed") {
        const fy = Number(r.fixedYears);
        if (!Number.isFinite(fy) || fy <= 0) continue;
        let key: YearKey;
        if (fy > 20) key = "Above 20";
        else key = (fy as YearKey);
        const cur = m[r.bank][key];
        m[r.bank][key] = cur == null ? rateNum : Math.min(cur, rateNum);
      }
    }
    return m;
  }, [rows, banks, prod]);

  const matrixTableRef = useRef<HTMLTableElement | null>(null);
  const matrixTopScrollRef = useRef<HTMLDivElement | null>(null);
  const matrixBottomScrollRef = useRef<HTMLDivElement | null>(null);
  const matrixGhostRef = useRef<HTMLDivElement | null>(null);
  const matrixSyncRef = useRef<"top" | "bottom" | null>(null);

  useEffect(() => {
    const table = matrixTableRef.current;
    const ghost = matrixGhostRef.current;
    if (table && ghost) {
      ghost.style.width = `${table.scrollWidth}px`;
    }
  }, [banks, grid]);

  const syncMatrixScrollTop = (e: React.UIEvent<HTMLDivElement>) => {
    if (matrixSyncRef.current === "bottom") return;
    matrixSyncRef.current = "top";
    if (matrixBottomScrollRef.current) {
      matrixBottomScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    matrixSyncRef.current = null;
  };

  const syncMatrixScrollBottom = (e: React.UIEvent<HTMLDivElement>) => {
    if (matrixSyncRef.current === "top") return;
    matrixSyncRef.current = "bottom";
    if (matrixTopScrollRef.current) {
      matrixTopScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    matrixSyncRef.current = null;
  };

  const fmt = (n?: number) =>
    n == null ? "—" : `${n.toFixed(2)}%`;

  return (
    <div
      className="rounded-2xl border border-white/10 p-4 mb-5 overflow-auto"
      style={{ backgroundColor: BRAND.card }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-base font-semibold">Rate Summary (by Fixed Period × Bank)</div>
        <div className="flex flex-wrap gap-2">
          {PRODUCTS.map((p) => (
            <Btn
              key={p.key}
              className={`px-3 py-1.5 rounded-full ${
                prod === p.key ? "bg-[#3b82f6] text-white" : "bg-white/10"
              }`}
              onClick={() => setProd(p.key)}
            >
              {p.label}
            </Btn>
          ))}
        </div>
      </div>

            <div className="relative">
        <div className="overflow-x-auto" ref={matrixTopScrollRef} onScroll={syncMatrixScrollTop}>
          <div ref={matrixGhostRef} className="h-3" />
        </div>
        <div className="overflow-x-auto" ref={matrixBottomScrollRef} onScroll={syncMatrixScrollBottom}>
          <table className="min-w-[900px] text-sm" ref={matrixTableRef}>
            <thead className="bg-white/5 sticky top-0">
              <tr>
                <th
                  className="w-40 text-left sticky left-0 align-middle"
                  style={{ backgroundColor: "#2c313c", zIndex: 3 }}
                >
                  <div className="px-3 py-2">Fixed Period (Years)</div>
                </th>
                {banks.map((b) => (
                  <th
                    key={b}
                    className="px-3 py-2 text-center align-middle"
                    style={{ backgroundColor: "#1d2430" }}
                  >
                    <div className="flex h-full min-h-[76px] flex-col items-center justify-center gap-2">
                      {BANK_LOGOS[b] ? (
                        <img
                          src={BANK_LOGOS[b]}
                          alt={b}
                          className="h-10 w-10 rounded-md bg-white shadow border object-contain"
                        />
                      ) : null}
                      <span className="w-24 break-words text-center text-xs font-medium text-white/80">
                        {b}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-white/5 align-middle">
              {YEAR_LABELS.map((lab, rowIdx) => {
                const STICKY_SHADE_ODD = "#161b27";
                const STICKY_SHADE_EVEN = "#212632";
                const stickyBg = rowIdx % 2 === 0 ? STICKY_SHADE_ODD : STICKY_SHADE_EVEN;

                return (
                  <tr key={String(lab)} className="border-t border-white/10">
                    <td
                      className="px-3 py-2 font-medium text-left sticky left-0 align-middle"
                      style={{ backgroundColor: stickyBg, zIndex: 2 }}
                    >
                      {lab === "Variable" ? "Variable" : lab === "Above 20" ? "Above 20" : lab}
                    </td>
                    {banks.map((b) => (
                      <td key={`${lab}-${b}`} className="px-3 py-2 text-center whitespace-nowrap align-middle">
                        <span className="block text-xs text-center">
                          {fmt(grid[b]?.[lab as any] as number | undefined)}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-2 text-xs text-white/60">
        Note: For each bank & period, the lowest available rate is shown (Floating → Variable row; Fixed with exact years; &gt;20 → Above 20).
      </div>
    </div>
  );
}



type RateScenario = {
  rate: number;
  key: string;
  minSalary: SalaryLevel;
  salaryBand?: "above700k" | "below700k" | "pltier1" | "pltier2" | "pltier3";
  requiresCreditCard?: "yes" | "no";
  requiresInternet?: "yes" | "no";
  requiresPremiumCompany?: "yes" | "no"; // For Seylan PL Tier1/2 (Professional/Premium) vs Tier3 (CAT A&B)
  label: string;
  benchmark?: "AWPR" | "AWPLR";
  benchmarkDelta?: number;
  benchmarkExpr?: string;
};

type ScenarioSelection = {
  rate?: number;
  scenario?: RateScenario;
  eligible: boolean;
};

function parseBenchmarkRate(
  value: any,
  refRates: { awpr?: number; awplr?: number }
): { rate: number; benchmark: "AWPR" | "AWPLR"; delta: number; expr: string } | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.toLowerCase().match(/\b(awpr|awplr)\s*([+\-])\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
  if (!match) return undefined;
  const benchmark = match[1].toUpperCase() as "AWPR" | "AWPLR";
  const sign = match[2] === "-" ? -1 : 1;
  const delta = parseFloat(match[3]);
  if (!isFinite(delta)) return undefined;
  let base = benchmark === "AWPR" ? refRates.awpr : refRates.awplr ?? refRates.awpr;
  if (typeof base !== "number") return undefined;
  const expr = `${benchmark} ${sign === 1 ? "+" : "-"} ${delta}%`;
  return { rate: base + sign * delta, benchmark, delta: sign * delta, expr };
}

function parseRateScenarioKey(
  key: string,
  value: any,
  refRates: { awpr?: number; awplr?: number }
): RateScenario | undefined {
  const benchmark = parseBenchmarkRate(value, refRates);
  const rate = benchmark ? benchmark.rate : readNumber(value);
  if (rate == null) return undefined;

  const lower = key.toLowerCase();
  let minSalary: SalaryLevel = "none";
  let salaryBand: RateScenario["salaryBand"] = undefined;

  // Seylan PL Tier salary bands (enforced at matching time, not encoded in field names)
  // All PL tiers require salary (just different amounts) + Professional/Premium status
  // Tier1: Professional/Premium + Salary ≥300k
  // Tier2: Professional/Premium + Salary 200k-299k  
  // Tier3: Non-Professional/Non-Premium + Salary ≥200k
  if (/pltier1/.test(lower)) {
    salaryBand = "pltier1";
    minSalary = "none";  // Don't enforce salary relationship type, just amount
  } else if (/pltier2/.test(lower)) {
    salaryBand = "pltier2";
    minSalary = "none";
  } else if (/pltier3/.test(lower)) {
    salaryBand = "pltier3";
    minSalary = "none";
  }

  // HL/LAP explicit salary relationship patterns
  if (/withsalary/.test(lower) && !salaryBand) minSalary = "remittance";
  if (/withoutsalary/.test(lower) && !salaryBand) minSalary = "none";

  // General HL/LAP salary bands (encoded in field names)
  if (/above700k/.test(lower)) {
    minSalary = "assignment";
    salaryBand = "above700k";
  } else if (/below700k/.test(lower)) {
    salaryBand = "below700k";
    if (minSalary === "none") minSalary = "remittance";
  }

  let requiresCreditCard: RateScenario["requiresCreditCard"];
  let requiresInternet: RateScenario["requiresInternet"];
  let requiresPremiumCompany: RateScenario["requiresPremiumCompany"];

  // Detect Premium Company requirement (Tier1/Tier2 = Professional/Premium, Tier3 = CAT A&B)
  if (/tier1/.test(lower) || /tier2/.test(lower)) {
    requiresPremiumCompany = "yes";
  } else if (/tier3/.test(lower)) {
    requiresPremiumCompany = "no";
  }

  if (/withcreditcardinternetbanking/.test(lower)) {
    requiresCreditCard = "yes";
    requiresInternet = "yes";
  } else if (/withoutcreditcardinternetbanking/.test(lower)) {
    requiresCreditCard = "no";
    requiresInternet = "no";
  } else {
    if (/withcreditcard/.test(lower)) requiresCreditCard = "yes";
    if (/withoutcreditcard/.test(lower)) requiresCreditCard = "no";

    if (/withinternetbanking/.test(lower)) requiresInternet = "yes";
    else if (/withoutinternetbanking/.test(lower)) requiresInternet = "no";
    else if (/internetbanking/.test(lower) && requiresInternet == null) {
      requiresInternet = requiresCreditCard === "no" ? undefined : "yes";
    }
  }

  const labelParts: string[] = [];
  
  // Seylan PL tier labels
  if (salaryBand === "pltier1") {
    labelParts.push("PL Tier 1 (≥300k)");
  } else if (salaryBand === "pltier2") {
    labelParts.push("PL Tier 2 (200k-299k)");
  } else if (salaryBand === "pltier3") {
    labelParts.push("PL Tier 3 (≥200k)");
  }
  
  // General salary labels
  if (minSalary === "remittance" && !salaryBand) {
    labelParts.push("Salary relationship");
  }
  if (minSalary === "assignment") {
    labelParts.push("Salary assignment");
    if (salaryBand === "above700k") labelParts.push("High-income tier");
  }
  
  if (requiresPremiumCompany === "yes") labelParts.push("Professional OR Premium");
  if (requiresPremiumCompany === "no") labelParts.push("CAT A & B");
  if (requiresCreditCard === "yes" && requiresInternet === "yes") labelParts.push("(with CC+IB)");
  else if (requiresCreditCard === "no" && requiresInternet === "no") labelParts.push("(without CC/IB)");

  // Simplify remaining cases
  if (requiresInternet === "yes" && (requiresCreditCard == null || requiresCreditCard === "yes")) {
    if (!labelParts.some(p => p.includes("CC+IB"))) labelParts.push("(with IB)");
  }

  const scenario: RateScenario = {
    rate,
    key,
    minSalary,
    salaryBand,
    requiresCreditCard,
    requiresInternet,
    requiresPremiumCompany,
    label: labelParts.join(" + "),
  };

  if (benchmark) {
    scenario.benchmark = benchmark.benchmark;
    scenario.benchmarkDelta = benchmark.delta;
    scenario.benchmarkExpr = benchmark.expr;
    scenario.label = [benchmark.expr, labelParts.length ? labelParts.join(" + ") : undefined]
      .filter(Boolean)
      .join(" + ");
  }

  return scenario;
}

function meetsScenarioRequirements(
  scenario: RateScenario,
  prefs: {
    salaryLevel: SalaryLevel;
    takeCreditCard: "yes" | "no";
    useInternetBanking: "yes" | "no";
    monthlyNetSalary: number;
    isPremiumCompany: "yes" | "no";
    isProfessional: "yes" | "no";
  }
): boolean {
  // Salary handling rules (Assignment ≥ Remittance)
  if (scenario.minSalary === "remittance" && prefs.salaryLevel === "none") return false;
  if (scenario.minSalary === "assignment" && prefs.salaryLevel !== "assignment") return false;

  // Premium Company OR Professional requirement (for Seylan PL Tier 1 & 2)
  // Tier 1/2: Requires Professional OR Premium Company (either one is sufficient)
  // Tier 3: Requires neither (CAT A & B companies only)
  if (scenario.requiresPremiumCompany === "yes") {
    if (prefs.isProfessional !== "yes" && prefs.isPremiumCompany !== "yes") return false;
  }
  if (scenario.requiresPremiumCompany === "no") {
    if (prefs.isProfessional === "yes" || prefs.isPremiumCompany === "yes") return false;
  }

  // CC / IB bundles
  if (scenario.requiresCreditCard === "yes" && prefs.takeCreditCard !== "yes") return false;
  if (scenario.requiresCreditCard === "no" && prefs.takeCreditCard !== "no") return false;

  if (scenario.requiresInternet === "yes" && prefs.useInternetBanking !== "yes") return false;
  if (scenario.requiresInternet === "no" && prefs.useInternetBanking !== "no") return false;

  // Salary bands by amount
  // HL/LAP bands
  if (scenario.salaryBand === "above700k" && prefs.monthlyNetSalary < 700_000) return false;
  if (scenario.salaryBand === "below700k" && prefs.monthlyNetSalary >= 700_000) return false;
  
  // Seylan PL Tier bands (require Professional OR Premium status + salary threshold)
  if (scenario.salaryBand === "pltier1") {
    // Tier 1: Professional/Premium + Salary ≥300k
    if (prefs.monthlyNetSalary < 300_000) return false;
  }
  if (scenario.salaryBand === "pltier2") {
    // Tier 2: Professional/Premium + Salary 200k-299k
    if (prefs.monthlyNetSalary < 200_000 || prefs.monthlyNetSalary >= 300_000) return false;
  }
  if (scenario.salaryBand === "pltier3") {
    // Tier 3: Non-Professional/Non-Premium + Salary ≥200k
    if (prefs.monthlyNetSalary < 200_000) return false;
  }

  return true;
}

function describeScenario(scenario?: RateScenario): string | undefined {
  if (!scenario) return undefined;

  const parts: string[] = [];
  if (scenario.benchmarkExpr) parts.push(scenario.benchmarkExpr);

  if (scenario.minSalary === "remittance") parts.push("Requires salary relationship");
  if (scenario.minSalary === "assignment") {
    parts.push("Requires salary assignment");
    if (scenario.salaryBand === "above700k") parts.push("High-income tier");
  }

  if (scenario.requiresPremiumCompany === "yes") parts.push("Professional OR Premium company");
  if (scenario.requiresPremiumCompany === "no") parts.push("CAT A & B companies");

  if (scenario.requiresCreditCard === "yes" && scenario.requiresInternet === "yes") {
    parts.push("Needs credit card & internet banking");
  } else {
    if (scenario.requiresCreditCard === "yes") parts.push("Needs credit card");
    if (scenario.requiresCreditCard === "no") parts.push("No credit card bundle");
    if (scenario.requiresInternet === "yes") parts.push("Needs internet banking");
    if (scenario.requiresInternet === "no") parts.push("No internet banking");
  }

  if (!parts.length && scenario.label && scenario.label !== "Standard") {
    return scenario.label;
  }

  const textOut = parts.join(" | " );
  return textOut || undefined;
}

function selectRateScenario(
  row: RateRow,
  prefs: { 
    salaryLevel: SalaryLevel; 
    takeCreditCard: "yes" | "no"; 
    useInternetBanking: "yes" | "no"; 
    monthlyNetSalary: number;
    isPremiumCompany: "yes" | "no";
    isProfessional: "yes" | "no";
  },
  refRates: { awpr?: number; awplr?: number }
): ScenarioSelection {
  const raw = row.raw || {};
  const scenarios: RateScenario[] = [];

  for (const key of Object.keys(raw)) {
    if (!/^rate/i.test(key)) continue;
    const scenario = parseRateScenarioKey(key, (raw as any)[key], refRates);
    if (scenario) scenarios.push(scenario);
  }

  if (!scenarios.length && Number.isFinite(row.rate)) {
    scenarios.push({
      rate: row.rate,
      key: "base",
      minSalary: "none",
      label: "Standard",
    });
  }

  if (!scenarios.length) {
    return { rate: Number.isFinite(row.rate) ? row.rate : undefined, scenario: undefined, eligible: true };
  }

  const eligible = scenarios.filter((s) => meetsScenarioRequirements(s, prefs));
  const sortFn = (a: RateScenario, b: RateScenario) => a.rate - b.rate;
  const picked = (eligible.length ? eligible : scenarios).sort(sortFn)[0];

  return {
    rate: picked?.rate ?? (Number.isFinite(row.rate) ? row.rate : undefined),
    scenario: picked,
    eligible: picked ? eligible.includes(picked) : true,
  };
}

function CompareAdvisor({ rows, tariffs, awpr, awplr }: { rows: RateRow[]; tariffs: TariffRow[]; awpr?: number; awplr?: number }) {
    // Reusable Toggle Component for Yes/No questions
    function Toggle({ 
      label, 
      value, 
      onChange, 
      helpText,
      icon
    }: { 
      label: string; 
      value: "yes" | "no"; 
      onChange: (val: "yes" | "no") => void;
      helpText?: string;
      icon?: string;
    }) {
      return (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm flex items-center gap-2">
              {icon && <span>{icon}</span>}
              <span>{label}</span>
            </span>
            <div className="flex gap-1 bg-white/5 rounded-full p-1">
              <button
                onClick={() => onChange("yes")}
                className={`px-4 py-1 rounded-full text-xs transition ${
                  value === "yes" 
                    ? "bg-[#3b82f6] text-white" 
                    : "text-white/70 hover:text-white"
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => onChange("no")}
                className={`px-4 py-1 rounded-full text-xs transition ${
                  value === "no" 
                    ? "bg-[#3b82f6] text-white" 
                    : "text-white/70 hover:text-white"
                }`}
              >
                No
              </button>
            </div>
          </div>
          {helpText && (
            <div className="text-xs text-white/60">{helpText}</div>
          )}
        </div>
      );
    }

    // Helper to parse salary/income bands from notes/description
    function parseSalaryBand(text?: string): { min?: number; max?: number } {
      if (!text) return {};
      const s = text.toLowerCase();
      // ">= 700k", "≥ 300,000/-", ">= 300000", etc.
      let match = s.match(/(?:>=|≥)\s*([0-9][0-9,]*)\s*(k|m|mn|million)?/i);
      if (match) {
        let val = parseFloat(match[1].replace(/,/g, ""));
        if (match[2]) {
          if (match[2].startsWith("k")) val *= 1_000;
          if (match[2].startsWith("m")) val *= 1_000_000;
        }
        return { min: val };
      }
      // "< 700k"
      match = s.match(/<\s*([0-9][0-9,]*)\s*(k|m|mn|million)?/i);
      if (match) {
        let val = parseFloat(match[1].replace(/,/g, ""));
        if (match[2]) {
          if (match[2].startsWith("k")) val *= 1_000;
          if (match[2].startsWith("m")) val *= 1_000_000;
        }
        return { max: val - 1 };
      }
      // "above 300,000", "over 300,000"
      match = s.match(/(above|over)\s*([0-9][0-9,]*)\s*(k|m|mn|million)?/i);
      if (match) {
        let val = parseFloat(match[2].replace(/,/g, ""));
        if (match[3]) {
          if (match[3].startsWith("k")) val *= 1_000;
          if (match[3].startsWith("m")) val *= 1_000_000;
        }
        return { min: val + 1 };
      }
      // "below 300,000"
      match = s.match(/below\s*([0-9][0-9,]*)\s*(k|m|mn|million)?/i);
      if (match) {
        let val = parseFloat(match[1].replace(/,/g, ""));
        if (match[2]) {
          if (match[2].startsWith("k")) val *= 1_000;
          if (match[2].startsWith("m")) val *= 1_000_000;
        }
        return { max: val - 1 };
      }
      return {};
    }
  const [product, setProduct] = useState<ProductKey>("HL");
  const [bankFilter, setBankFilter] = useState<string>("");
  const [amount, setAmount] = useState<number | undefined>(10_000_000);
  const [propertyValue, setPropertyValue] = useState<number | undefined>(undefined);
  const [typePref, setTypePref] = useState<"any" | "fixed" | "floating">("any");
  const [desiredFixedYears, setDesiredFixedYears] = useState<number | "">("");
  const [tenureYears, setTenureYears] = useState<number>(20);

  const [isFirstHome, setIsFirstHome] = useState<"yes" | "no">("no");
  const [salaryLevel, setSalaryLevel] = useState<SalaryLevel>("none");
  const [useInternetBanking, setUseInternetBanking] = useState<"yes" | "no">("no");
  const [takeCreditCard, setTakeCreditCard] = useState<"yes" | "no">("no");
  // === COMPARE: NEW STATE ===
  const [monthlyNetSalary, setMonthlyNetSalary] = useState<number | undefined>(undefined);

  const tariffPrefsRef = React.useRef<CompareTariffPrefs | null>(null);
  function loadTariffPrefs(): CompareTariffPrefs {
    if (!tariffPrefsRef.current) {
      tariffPrefsRef.current = loadJSON<CompareTariffPrefs>(LS_COMPARE_PREFS, {
        isCondo: "no",
        isConstruction: "no",
        eduSecurity: "secured",
        eduLocale: "local",
        profileProfessional: "no",
        profileBanker: "no",
        profileTeacher: "no",
        customerCategory: "None",
        expressProcessing: false,
      });
    }
    return tariffPrefsRef.current;
  }

  const [customerCategory, setCustomerCategory] = useState<"VIP" | "None">(
    () => loadTariffPrefs().customerCategory ?? "None"
  );
  const [expressProcessing, setExpressProcessing] = useState<boolean>(
    () => loadTariffPrefs().expressProcessing ?? false
  );
  const [nsbExpressDays, setNsbExpressDays] = useState<4 | 10>(10); // NSB express service days
  const [isProfessional, setIsProfessional] = useState<"yes" | "no">(
    () => loadTariffPrefs().profileProfessional ?? "no"
  );
  const [isBanker, setIsBanker] = useState<"yes" | "no">(
    () => loadTariffPrefs().profileBanker ?? "no"
  );
  const [isTeacher, setIsTeacher] = useState<"yes" | "no">(
    () => loadTariffPrefs().profileTeacher ?? "no"
  );
  const [isPremiumCompany, setIsPremiumCompany] = useState<"yes" | "no">("no");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showPresets, setShowPresets] = useState<boolean>(false);
  // === /COMPARE: NEW STATE ===
  const [isCondo, setIsCondo] = useState<"yes" | "no">(() => loadTariffPrefs().isCondo);
  const [isConstruction, setIsConstruction] = useState<"yes" | "no">(() => loadTariffPrefs().isConstruction);
  const [employedAbroad, setEmployedAbroad] = useState<"yes" | "no">("no");
  const [plSecurity, setPlSecurity] = useState<"secured" | "unsecured">("unsecured");
  const [eduSecurity, setEduSecurity] = useState<"secured" | "unsecured">(() => loadTariffPrefs().eduSecurity ?? "secured");
  const [eduLocale, setEduLocale] = useState<"local" | "foreign">(() => loadTariffPrefs().eduLocale ?? "local");

  const [includeTariffs, setIncludeTariffs] = useState<boolean>(true); // toggle
  type CompareResult = {
    row: RateRow;
    rate?: number;
    eff?: number;
    emi?: number;
    upfront?: number;
    note?: string;
    picked?: Array<{ cat: TariffFeeType; row?: TariffRow; computed?: number; note?: string; meta?: TariffComputationMeta }>;
    scenario?: RateScenario;
    scenarioEligible?: boolean;
    scenarioDescription?: string;
    tariffScenario?: ReturnType<typeof deriveTariffScenario>;
  };
    const [results, setResults] = useState<CompareResult[]>([]);

  useEffect(() => {
    const next: CompareTariffPrefs = {
      isCondo,
      isConstruction,
      eduSecurity,
      eduLocale,
    };
    saveJSON(LS_COMPARE_PREFS, {
      ...next,
      customerCategory,
      expressProcessing,
      profileProfessional: isProfessional,
      profileBanker: isBanker,
      profileTeacher: isTeacher,
    });
  }, [
    isCondo,
    isConstruction,
    eduSecurity,
    eduLocale,
    customerCategory,
    expressProcessing,
    isProfessional,
    isBanker,
    isTeacher,
  ]);

    const bankOptions = useMemo(() => {
      const seen = new Set<string>();
      return rows
        .filter((r) => r.product === product)
        .map((r) => (r.bank || "").trim())
        .filter(Boolean)
        .filter((bank) => {
          const key = bank.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.localeCompare(b));
    }, [rows, product]);

  useEffect(() => {
    if (!bankFilter) return;
    const normalized = bankFilter.trim().toLowerCase();
    const stillAvailable = bankOptions.some((bank) => bank.trim().toLowerCase() === normalized);
    if (!stillAvailable) {
      setBankFilter("");
    }
  }, [bankFilter, bankOptions]);

  const resolveInterestRate = (item: CompareResult) => {
    if (typeof item.rate === "number" && Number.isFinite(item.rate)) return item.rate;
    if (Number.isFinite(item.row.rate)) return item.row.rate;
    return undefined;
  };

  const resolveEffectiveRate = (item: CompareResult) => {
    if (typeof item.eff === "number" && Number.isFinite(item.eff)) return item.eff;
    return resolveInterestRate(item);
  };

  function parseNum(v: any): number | undefined { const n = typeof v === "string" ? parseFloat(v) : v; return isFinite(n) ? n : undefined; }

  function ltvOk(row: RateRow): boolean {
    if ((product === "HL" || product === "LAP") && row.ltv && propertyValue) {
      const amt = Number(amount) || 0, val = Number(propertyValue) || 0;
      if (val <= 0) return true;
      const ltv = (amt / val) * 100;
      return ltv <= row.ltv;
    }
    return true;
  }
  function typeOk(row: RateRow): boolean {
    if (typePref === "any") return true;
    if (typePref === "fixed") {
      const want = parseNum(desiredFixedYears);
      if (row.type === "Fixed") {
        if (want && row.fixedYears != null) return row.fixedYears >= want;
        return true;
      }
      const intro = parseIntroFixedYears(row.notes);
      if (want && intro && intro >= want) return true;
      return false;
    }
    if (typePref === "floating") return row.type === "Floating";
    return true;
  }
  function capsOk(row: RateRow): boolean {
    const capSources = new Set<string>();
    if (row.notes) capSources.add(row.notes);
    for (const txt of gatherRateRowText(row)) {
      if (txt) capSources.add(txt);
    }
    const { min, max } = parseLoanCaps(Array.from(capSources).join(" | "));
    if (min != null && (amount ?? 0) < min) return false;
    if (max != null && (amount ?? 0) > max) return false;
    return true;
  }
  function firstHomeOk(row: RateRow): boolean {
    const needsFirst = requiresFirstHome(row.notes);
    return !needsFirst || isFirstHome === "yes";
  }
  function salaryOk(row: RateRow): boolean {
    let inferred = salaryRequirementFromNotes(row.notes, undefined);
    if (row.salaryRequired === true) {
      if (inferred !== "assignment") inferred = "remittance";
    } else if (row.salaryRequired === false) {
      if (inferred !== "assignment") inferred = "none";
    }
    return levelNum(salaryLevel) >= levelNum(inferred);
  }
  function internetBankingOk(row: RateRow): boolean {
    const needs = requiresInternetBanking(row.notes);
    return !needs || useInternetBanking === "yes";
  }
  function creditCardOk(row: RateRow): boolean {
    const needs = requiresCreditCard(row.notes);
    return !needs || takeCreditCard === "yes";
  }
  function requiresProfessionalSegment(row: RateRow): boolean {
    return (
      rateRowMatchesSegment(row, PROFESSIONAL_REGEX) ||
      tariffsMatchSegment(tariffs, row.bank, row.product, PROFESSIONAL_REGEX)
    );
  }
  function requiresBankerSegment(row: RateRow): boolean {
    return (
      rateRowMatchesSegment(row, BANKER_REGEX) ||
      tariffsMatchSegment(tariffs, row.bank, row.product, BANKER_REGEX)
    );
  }
  function requiresTeacherSegment(row: RateRow): boolean {
    return (
      rateRowMatchesSegment(row, TEACHER_REGEX) ||
      tariffsMatchSegment(tariffs, row.bank, row.product, TEACHER_REGEX)
    );
  }
  function professionalOk(row: RateRow): boolean {
    const needsProfessional = requiresProfessionalSegment(row);
    return !needsProfessional || isProfessional === "yes";
  }
  function bankerOk(row: RateRow): boolean {
    const needsBanker = requiresBankerSegment(row);
    return !needsBanker || isBanker === "yes";
  }
  function teacherOk(row: RateRow): boolean {
    const needsTeacher = requiresTeacherSegment(row);
    return !needsTeacher || isTeacher === "yes";
  }
  function eduSecurityOk(row: RateRow): boolean {
    if (product !== "EDU") return true;
    const tag = inferEduSecurity(row, tariffs);
    if (tag === "both" || tag === "unknown") return true;
    if (eduSecurity === "secured" && tag === "unsecured") return false;
    if (eduSecurity === "unsecured" && tag === "secured") return false;
    return true;
  }
  function eduLocaleOk(row: RateRow): boolean {
    if (product !== "EDU") return true;
    const tag = inferEduLocale(row);
    if (tag === "both" || tag === "unknown") return true;
    if (eduLocale === "local" && tag === "foreign") return false;
    if (eduLocale === "foreign" && tag === "local") return false;
    return true;
  }
type CompareTariffPrefs = {
  isCondo: "yes" | "no";
  isConstruction: "yes" | "no";
  eduSecurity?: "secured" | "unsecured";
  eduLocale?: "local" | "foreign";
  profileProfessional?: "yes" | "no";
  profileBanker?: "yes" | "no";
  profileTeacher?: "yes" | "no";
  customerCategory?: "VIP" | "None";
  expressProcessing?: boolean;
};

// --- Tariff scenario defaults (no extra questions) ---
function deriveTariffScenario(product: ProductKey, isCondo: boolean, isConstruction: boolean) {
  const isPL = product === "PL";
  const isHLorLAP = product === "HL" || product === "LAP";

  // Fixed rules per your request:
  // - Title Report: mandatory for HL/LAP, not applicable for PL
  // - Property/Title questions not applicable to PL
  // - Valuation & Inspections: 1 mandatory for HL/LAP, not applicable for PL
  // - CRIB: mandatory for any loan (count = 1)
  // - Exclude insurance
  // - Remove Release / Part Release entirely

  const includeTitleReport = isHLorLAP ? true : false;
  const includeTransferDeed = isPL ? false : false; // not asked anymore; always false

  const numValuations = isHLorLAP ? 1 : 0;
  // If you still want construction to increase inspections later, keep logic here;
  // for now we enforce minimum 1 for HL/LAP as requested.
  const numInspections = isHLorLAP ? 1 : 0;

  const cribCount = 1; // mandatory for all products

  return {
    // keep keys your cost engine already expects:
    includeTitleReport,
    includeTransferDeed,
    isCondo: isPL ? false : isCondo,         // not applicable for PL
    isConstruction: isPL ? false : isConstruction, // not applicable for PL
    numValuations,
    numInspections,
    cribCount,
    // removals: releaseDeeds, partReleases, insurance are intentionally omitted
  };
}
    // === COMPARE: NEW HELPERS ===
const SECURED_KEYWORDS = /\b(secured?|collateral|mortgage|hypothec|pledge|security|guarantee|guarantor|lien|property|asset[-\s]*backed)\b/i;
const UNSECURED_KEYWORDS = /\b(unsecured|non[-\s]*collateral|without\s+(?:security|collateral|guarantor))\b/i;
const PROPERTY_KEYWORDS = /\b(mortgage|title|property|collateral|security|deed|valuation|notary|legal)\b/i;
const FOREIGN_EDU_KEYWORDS = /\b(foreign|overseas|international|abroad|global|offshore|study\s+abroad)\b/i;
const LOCAL_EDU_KEYWORDS = /\b(local|domestic|within\s+sri\s+lanka|in\s+sri\s+lanka|sri\s*lanka)\b/i;

function gatherRateRowText(row: RateRow): string[] {
  const texts: string[] = [];
  if (typeof row.notes === "string") texts.push(row.notes);
  const raw = row.raw;
  if (raw && typeof raw === "object") {
    for (const value of Object.values(raw)) {
      if (typeof value === "string") texts.push(value);
    }
  }
  return texts;
}

const PROFESSIONAL_REGEX = /\b(professional|professionals|engineer|engineering|doctor|medical|physician|consultant|accountant|architect|pilot|lecturer|professor|mba|cima|cim|acca|chartered|lawyer|attorney|specialist)\b/i;
const BANKER_REGEX = /\b(banker|bankers|bank\s+staff|bank\s+employee|bank\s+employees|bank\s+officer|bank\s+officers|staff\s+bank|staff\s+loan)\b/i;
const TEACHER_REGEX = /\b(teacher|teachers|teaching\s+staff|school\s+teacher|school\s+teachers|principal|education\s+officer|educator|education\s+staff)\b/i;

function rateRowMatchesSegment(row: RateRow, regex: RegExp): boolean {
  return gatherRateRowText(row).some((txt) => regex.test(txt));
}

function tariffsMatchSegment(
  tariffs: TariffRow[],
  bank: string,
  product: ProductKey,
  regex: RegExp
): boolean {
  if (!tariffs?.length) return false;
  const bankKey = bank.trim().toLowerCase();
  return tariffs.some((t) => {
    if ((t.bank || "").trim().toLowerCase() !== bankKey) return false;
    if (t.product !== product) return false;
    const fields = [
      t.feeTypeRaw,
      t.description,
      t.notes,
      t.amount,
    ];
    return fields.some((field) => typeof field === "string" && regex.test(field));
  });
}

function tariffsIndicateSecuredForEdu(tariffs: TariffRow[], bank: string): boolean {
  return tariffs.some((t) => {
    if (t.product !== "EDU") return false;
    if ((t.bank || "").toLowerCase() !== bank.toLowerCase()) return false;
    const fields = [t.description, t.notes, t.amount, t.feeTypeRaw];
    return fields.some((field) => typeof field === "string" && PROPERTY_KEYWORDS.test(field));
  });
}

type EduSecurityTag = "secured" | "unsecured" | "both" | "unknown";
type EduLocaleTag = "local" | "foreign" | "both" | "unknown";

function inferEduSecurity(row: RateRow, tariffs: TariffRow[]): EduSecurityTag {
  const texts = gatherRateRowText(row);
  let hasSecured = texts.some((txt) => SECURED_KEYWORDS.test(txt));
  const hasUnsecured = texts.some((txt) => UNSECURED_KEYWORDS.test(txt));

  if (!hasSecured && tariffsIndicateSecuredForEdu(tariffs, row.bank)) {
    hasSecured = true;
  }

  if (hasSecured && hasUnsecured) return "both";
  if (hasSecured) return "secured";
  if (hasUnsecured) return "unsecured";
  return "unknown";
}

function inferEduLocale(row: RateRow): EduLocaleTag {
  const texts = gatherRateRowText(row);
  const hasForeign = texts.some((txt) => FOREIGN_EDU_KEYWORDS.test(txt));
  const hasLocal = texts.some((txt) => LOCAL_EDU_KEYWORDS.test(txt));

  if (hasForeign && hasLocal) return "both";
  if (hasForeign) return "foreign";
  if (hasLocal) return "local";
  return "unknown";
}

  const VIP_REGEX = /\b(private\s+banking|platinum|pinnacle|priority|elite|privileged|premier)\b/i;
  const EXPRESS_REGEX = /\b(express|fast\s*track|green\s*channel)\b/i;

  function requiresVIP(notes?: string): boolean {
    return VIP_REGEX.test(notes || "");
  }
  function rowRequiresExpress(notes?: string): boolean {
    return EXPRESS_REGEX.test(notes || "");
  }

  function vipOk(row: RateRow): boolean {
    // If the row is VIP-only, user must be VIP; else allow for anyone
    return !requiresVIP(row.notes) || customerCategory === "VIP";
  }
  function expressOk(row: RateRow): boolean {
    // If the row is express-only (rate track), user must opt-in to Express
    return !rowRequiresExpress(row.notes) || !!expressProcessing;
  }
  // === /COMPARE: NEW HELPERS ===

  // Map ProductKey to tariff calculator Product type
  function mapProductToTariffProduct(productKey: ProductKey): TariffProduct | null {
    switch (productKey) {
      case "PL":
        return "PersonalLoan";
      case "HL":
        return "HousingLoan";
      case "LAP":
        return "LAP";
      case "EDU":
        return null; // Education loans not yet in tariff calculator
      default:
        return null;
    }
  }

  // Determine tariff product variant based on user selections
  function determineTariffProduct(): TariffProduct | null {
    const base = mapProductToTariffProduct(product);
    if (!base) return null;

    // Apply variants based on express processing and employed abroad toggles
    if (base === "PersonalLoan" && expressProcessing) {
      return "PersonalLoan_Green";
    }
    
    if (base === "HousingLoan") {
      if (employedAbroad === "yes") return "HousingLoan_EmployedAbroad";
      if (expressProcessing) return "HousingLoan_Green";
      return "HousingLoan";
    }

    if (base === "LAP") {
      if (employedAbroad === "yes") return "LAP_EmployedAbroad";
      if (expressProcessing) return "LAP_Green";
      return "LAP";
    }

    return base;
  }

  function onGenerate() {
    const normalizedBankFilter = bankFilter.trim().toLowerCase();
    
    // Use real rows data instead of mock data
    
    // Deep cross-check: every field must match the user's input
    let candidates = rows.filter((r) => {
      // Product must match
      if (r.product !== product) return false;
      // Rate must be a valid number
      if (!isFinite(r.rate)) return false;
      // Strict LTV check
      if ((product === "HL" || product === "LAP") && r.ltv && propertyValue) {
        const amt = Number(amount) || 0, val = Number(propertyValue) || 0;
        if (val > 0) {
          const ltv = (amt / val) * 100;
          if (ltv > r.ltv) return false;
        }
      }
      // Type (fixed/floating) check
      if (typePref !== "any") {
        if (typePref === "fixed" && r.type !== "Fixed") return false;
        if (typePref === "floating" && r.type !== "Floating") return false;
        if (typePref === "fixed" && desiredFixedYears && r.fixedYears != null && r.fixedYears < desiredFixedYears) return false;
      }
      // Tenure check
      // If 'Rate type' is 'Any', ignore Tenure (years) input
      if (typePref !== "any") {
        const fixedRegex = /rates? fixed for (\d+) years? and variable/i;
        let fixedMatch = r.notes && fixedRegex.exec(r.notes);
        if (!fixedMatch && (r as any).description) fixedMatch = fixedRegex.exec((r as any).description);
        if (fixedMatch) {
          const n = parseInt(fixedMatch[1], 10);
          if (tenureYears < 1 || tenureYears > n) return false;
        } else {
          if (tenureYears && r.fixedYears && tenureYears !== r.fixedYears) return false;
        }
      }
      // Salary relationship
      let inferred = salaryRequirementFromNotes(r.notes, undefined);
      if (r.salaryRequired === true) {
        if (inferred !== "assignment") inferred = "remittance";
      } else if (r.salaryRequired === false) {
        if (inferred !== "assignment") inferred = "none";
      }
      if (levelNum(salaryLevel) < levelNum(inferred)) return false;

      // Salary/income band filter from notes/description
      // EXCEPTION: Skip for Seylan PL - salary requirements are in field names (tier-based), not row-level
      const isSeylanPL = r.bank?.toLowerCase().includes("seylan") && product === "PL";
      if (!isSeylanPL && monthlyNetSalary && monthlyNetSalary > 0) {
        const band = parseSalaryBand(r.notes) || parseSalaryBand((r as any).description);
        if (band.min && monthlyNetSalary < band.min) return false;
        if (band.max && monthlyNetSalary > band.max) return false;
      }
      // NOTE: Do NOT filter by requiresInternetBanking/requiresCreditCard here
      // Let selectRateScenario handle choosing the right rate variant based on CC/IB preferences
      // First home
      if (product === "HL" && requiresFirstHome(r.notes) && isFirstHome !== "yes") return false;
      
      // Professional, Banker, Teacher segments
      // EXCEPTION: For Seylan PL and Cargills PL, these are handled by tier-based scenario selection, not row-level filtering
      const isCargillsPL = r.bank?.toLowerCase().includes("cargills") && product === "PL";
      

      
      if (!isSeylanPL && !isCargillsPL && rateRowMatchesSegment(r, PROFESSIONAL_REGEX) && isProfessional !== "yes") return false;
      if (!isSeylanPL && !isCargillsPL && rateRowMatchesSegment(r, BANKER_REGEX) && isBanker !== "yes") return false;
      if (!isSeylanPL && !isCargillsPL && rateRowMatchesSegment(r, TEACHER_REGEX) && isTeacher !== "yes") return false;
      
      // Cargills PL specific eligibility checks
      if (isCargillsPL) {
        const notes = r.notes || "";
        // Check if this is a banker-specific rate and user is not a banker
        if (notes.includes("Bankers Product") && isBanker !== "yes") return false;
        // Check if this is a professional-specific rate and user is not a professional
        if (notes.includes("Professionals (Engineers, Doctors, Accountants, Architects, Pilots)") && isProfessional !== "yes") return false;
        // Check if this is a premium company rate and user doesn't work for premium company
        if (notes.includes("Employees of Large/Diversified Corporates (incl. Cargills Group staff, excluding bank staff)") && isPremiumCompany !== "yes") return false;
      }
      
      // VIP
      if (requiresVIP(r.notes) && customerCategory !== "VIP") return false;
      // Express
      if (rowRequiresExpress(r.notes) && !expressProcessing) return false;
      // Education security/location
      if (product === "EDU") {
        const secTag = inferEduSecurity(r, tariffs);
        if (eduSecurity !== "unknown" && secTag !== "unknown" && (secTag as string) !== eduSecurity && secTag !== "both") return false;
        const locTag = inferEduLocale(r);
        if (eduLocale !== "unknown" && locTag !== "unknown" && (locTag as string) !== eduLocale && locTag !== "both") return false;
      }
      // Loan caps
      const { min, max } = parseLoanCaps(r.notes || "");
      const amt = Number(amount);
      if (min != null && amt < min) return false;
      if (max != null && amt > max) return false;
      // Bank filter
      if (normalizedBankFilter && (r.bank || "").trim().toLowerCase() !== normalizedBankFilter) return false;
      // All checks passed
      return true;
    });



    // Enrich and rank results
    const amt = Number(amount);
    const haveAmt = Number.isFinite(amt) && amt > 0;
    const prefs = { 
      salaryLevel, 
      takeCreditCard, 
      useInternetBanking, 
      monthlyNetSalary: Number(monthlyNetSalary || 0),
      isPremiumCompany,
      isProfessional,
    };
    const refRates = { awpr, awplr };
    const tariffScenario = deriveTariffScenario(product, isCondo === "yes", isConstruction === "yes");

    const enriched = candidates.map((r) => {
      // Check if this is Seylan Bank for special rate selection
      const isSeylanBank = r.bank?.toLowerCase().includes("seylan");
      
      let scenarioSel = selectRateScenario(r, prefs, refRates);
      let baseRate = typeof scenarioSel.rate === "number" && Number.isFinite(scenarioSel.rate)
        ? scenarioSel.rate
        : Number.isFinite(r.rate)
        ? r.rate
        : undefined;
      
      // For Seylan, use new deterministic rate selector API
      if (isSeylanBank && haveAmt) {
        try {
          // Determine Personal Loan tier based on user inputs
          let personalLoanTier: "Tier1" | "Tier2" | "Tier3" = "Tier3"; // Default
          if (product === "PL") {
            const salary = Number(monthlyNetSalary || 0);
            const isProfOrPremium = isProfessional === "yes" || isPremiumCompany === "yes";
            
            if (isProfOrPremium && salary >= 300_000) {
              personalLoanTier = "Tier1";
            } else if (isProfOrPremium && salary >= 200_000 && salary < 300_000) {
              personalLoanTier = "Tier2";
            } else {
              personalLoanTier = "Tier3"; // CAT A&B with salary >= 200k
            }
          }
          
          // Determine salary band for HL/LAP
          let salaryBand: ">=700k" | "150k-699k" | "Other" = "Other";
          if (product === "HL" || product === "LAP") {
            const salary = Number(monthlyNetSalary || 0);
            if (salaryLevel === "assignment" || salaryLevel === "remittance") {
              if (salary >= 700_000) {
                salaryBand = ">=700k";
              } else if (salary >= 150_000) {
                salaryBand = "150k-699k";
              }
            }
          }
          
          // Use desiredFixedYears if available (user's "Fixed years" input), otherwise fall back to tenureYears
          const effectiveTenure = (typeof desiredFixedYears === 'number' && desiredFixedYears > 0) 
            ? desiredFixedYears 
            : (tenureYears || 10);
          
          const rateInputs: RateSelectionInputs = {
            bank: "Seylan",
            product: product === "PL" ? "PersonalLoan" : (product === "HL" ? "HousingLoan" : "LAP"),
            loanAmount: amt,
            tenureYears: effectiveTenure,
            salaryRelationship: salaryLevel === "assignment" ? "Assignment" : (salaryLevel === "remittance" ? "Remittance" : "None"),
            salaryBand,
            usesCreditAndInternet: (takeCreditCard === "yes" && useInternetBanking === "yes"),
            personalLoanTier,
          };
          
          const seylanRate = selectBestRate(rateInputs);
          baseRate = seylanRate.bestRatePct;
          
          // Update scenario with Seylan-specific details
          scenarioSel = {
            rate: baseRate,
            scenario: {
              rate: baseRate,
              key: "seylan_best_match",
              minSalary: "none",
              label: seylanRate.rows[0]?.basis || "Best Match",
            },
            eligible: true,
          };
        } catch (err) {
          console.warn(`Seylan rate selection failed for ${r.bank}:`, err);
          // Fall back to existing rate selection
        }
      }
      
      // Check if this is Commercial Bank for special rate selection
      const isComBankMatch = r.bank?.toLowerCase().includes("commercial");
      
      if (isComBankMatch && haveAmt) {
        try {
          // Determine tier based on user inputs
          // Platinum: salary >= 200k OR professional
          // Premium: designated account holder (we don't have a direct toggle, so use Premium company as proxy)
          // Standard: default
          let tier: "Standard" | "Premium" | "Platinum" = "Standard";
          
          const salary = Number(monthlyNetSalary || 0);
          const isProfessionalUser = isProfessional === "yes";
          const isPremiumCompanyUser = isPremiumCompany === "yes";
          
          // Platinum tier: salary >= 200k OR professional
          if (isProfessionalUser || salary >= 200_000) {
            tier = "Platinum";
          } 
          // Premium tier: premium company/designated account
          else if (isPremiumCompanyUser) {
            tier = "Premium";
          }
          // Otherwise: Standard
          
          // Use desiredFixedYears if available (user's "Fixed years" input), otherwise fall back to tenureYears
          const effectiveTenure = (typeof desiredFixedYears === 'number' && desiredFixedYears > 0) 
            ? desiredFixedYears 
            : (tenureYears || 10);
          
          // Map UI product to Commercial Bank selector product, including Education Loans
          const combankProduct =
            product === "PL"
              ? "PersonalLoan"
              : product === "HL"
              ? "HousingLoan"
              : product === "EDU"
              ? "EducationLoan"
              : "LAP";

          // Map loan security to ComBank Education guarantor type
          const combankGuarantor: RateSelectionInputs["guarantorType"] | undefined =
            combankProduct === "EducationLoan"
              ? (eduSecurity === "unsecured" ? "Personal" : "PropertyMortgage")
              : undefined;

          const rateInputs: RateSelectionInputs = {
            bank: "CommercialBank",
            product: combankProduct,
            loanAmount: amt,
            tenureYears: effectiveTenure,
            tier,
            awpr,
            guarantorType: combankGuarantor,
          };
          
          const combankRate = selectBestRate(rateInputs);
          baseRate = combankRate.bestRatePct;
          
          // Update scenario with Commercial Bank-specific details
          const securityLabel = combankProduct === "EducationLoan"
            ? (eduSecurity === "unsecured" ? "Unsecured" : "Secured")
            : undefined;
          scenarioSel = {
            rate: baseRate,
            scenario: {
              rate: baseRate,
              key: "combank_best_match",
              minSalary: "none",
              label: `${tier} - ${combankRate.rows[0]?.label || "Best Match"}${securityLabel ? ` • ${securityLabel}` : ""}`,
            },
            eligible: true,
          };
        } catch (err) {
          console.warn(`Commercial Bank rate selection failed for ${r.bank}:`, err);
          // Fall back to existing rate selection
        }
      }

      // Check if this is NDB for special rate selection
      const isNdbMatch = r.bank?.toLowerCase().includes("ndb");
      if (isNdbMatch && haveAmt) {
        try {
          // Use desiredFixedYears if available (user's "Fixed years" input), otherwise fall back to tenureYears
          const effectiveTenure = (typeof desiredFixedYears === 'number' && desiredFixedYears > 0)
            ? desiredFixedYears
            : (tenureYears || 10);

          // Map UI product to NDB selector product (Education supported)
          const ndbProduct: RateSelectionInputs["product"] =
            product === "PL"
              ? "PersonalLoan"
              : product === "HL"
              ? "HousingLoan"
              : product === "EDU"
              ? "EducationLoan"
              : "LAP";

          const rateInputs: RateSelectionInputs = {
            bank: "NDB",
            product: ndbProduct,
            loanAmount: amt,
            tenureYears: effectiveTenure,
            isProfessional: isProfessional === "yes",
            salaryRelationship: salaryLevel === "assignment" ? "Assignment" : (salaryLevel === "remittance" ? "Remittance" : "None"),
          };

          const ndbRate = selectBestRate(rateInputs);
          baseRate = ndbRate.bestRatePct;

          // Update scenario with NDB-specific details
          const ndbBestRow = ndbRate.rows.find(rr => rr.ratePct === ndbRate.bestRatePct) || ndbRate.rows[0];
          scenarioSel = {
            rate: baseRate,
            scenario: {
              rate: baseRate,
              key: "ndb_best_match",
              minSalary: "none",
              label: ndbBestRow?.label || "Best Match",
            },
            eligible: true,
          };
        } catch (err) {
          console.warn(`NDB rate selection failed for ${r.bank}:`, err);
          // Fall back to existing rate selection
        }
      }

      // Check if this is DFCC for special rate selection
      // VIP customers should get Professionals & Pinnacle rate (10.75-14%) instead of Normal (11-16%)
      const isDfccMatch = r.bank?.toLowerCase().includes("dfcc");
      if (isDfccMatch && haveAmt) {
        console.log('🔍 DFCC match - checking customerCategory from state:', customerCategory, 'isProfessional:', isProfessional);
        try {
          // DFCC calculator uses live JSON data for rates/tariffs
          // Map UI product to DFCC product names
          const dfccProduct: dfccCalculator.DFCCInputs["product"] =
            product === "PL"
              ? "Personal Loans"
              : product === "HL"
              ? "Home Loans"
              : product === "EDU"
              ? "Education Loans"
              : "Loan Against Property";

          const dfccInputs: dfccCalculator.DFCCInputs = {
            bank: 'DFCC',
            product: dfccProduct,
            amount: amt,
            tenureYears: tenureYears || 10,
            monthlyNetSalary: Number(monthlyNetSalary || 0),
            propertyValue: (product === "HL" || product === "LAP") ? propertyValue || amt * 1.2 : undefined,
            includeTariffs,
            rateType: typePref === "fixed" ? "Fixed" : (typePref === "floating" ? "Variable" : "Any"),
            salaryRelationship: salaryLevel === "assignment" ? "Assignment" : (salaryLevel === "remittance" ? "Remittance" : "None"),
            customerCategory,
            isProfessional: isProfessional === "yes",
            isBanker: isBanker === "yes",
            isTeacher: isTeacher === "yes",
            worksAtPremiumCompany: isPremiumCompany === "yes",
            enableExpress: expressProcessing,
            takeCreditCard: takeCreditCard === "yes",
            useInternetBanking: useInternetBanking === "yes",
            firstHome: isFirstHome === "yes",
          };

          // Call DFCC calculator to get best rate
          // Pass the full rows/tariffs arrays - calculator will filter by bank internally
          const dfccResult = dfccCalculator.dfccCalculator.calculate(dfccInputs, rows as any[], tariffs as any[]);
          
          console.log('🏦 DFCC Rate Selection:', {
            customerCategory: dfccInputs.customerCategory,
            isProfessional: dfccInputs.isProfessional,
            rateType: dfccInputs.rateType,
            ratesReturned: dfccResult.rates,
            notes: dfccResult.notes
          });
          
          // Extract the best (lowest) rate from the rates array
          if (dfccResult.rates.length > 0) {
            // Parse minAPR from first rate (they're sorted by preference)
            const bestRateStr = dfccResult.rates[0].minAPR;
            const bestRatePct = parseFloat(bestRateStr.replace('%', ''));
            
            if (!isNaN(bestRatePct)) {
              baseRate = bestRatePct;
              
              // Build label from selected rate(s)
              const rateLabels = dfccResult.rates.map(r => r.label).join(' / ');
              const notesStr = dfccResult.notes?.length ? ` • ${dfccResult.notes.join(' • ')}` : '';
              
              scenarioSel = {
                rate: baseRate,
                scenario: {
                  rate: baseRate,
                  key: "dfcc_best_match",
                  minSalary: "none",
                  label: `${rateLabels}${notesStr}`,
                },
                eligible: true,
              };
            }
          }
        } catch (err) {
          console.warn(`DFCC rate selection failed for ${r.bank}:`, err);
          // Fall back to existing rate selection
        }
      }

      // Check if this is Cargills Bank for special rate selection
      const isCargillsMatch = r.bank?.toLowerCase().includes("cargills");
      if (isCargillsMatch && haveAmt) {
        try {
          // Determine salary band for Education/Personal Loan based on customer category
          let salaryBand = "";
          const salary = Number(monthlyNetSalary || 0);
          console.log("Cargills processing:", { bank: r.bank, product, salary, isProfessional, isBanker, salaryLevel, notes: r.notes });
          
          if (product === "EDU" || product === "PL") {
            const notes = r.notes || "";
            
            // Professional rates have different salary bands: Above500k, 300kTo499999, 150kTo299999
            if (notes.includes("Professionals (Engineers, Doctors, Accountants, Architects, Pilots)")) {
              console.log("Processing as Professional rates");
              
              // Only show professional rates if user selected professional
              if (isProfessional !== "yes") {
                console.log("User not professional, skipping professional rate");
                return null;
              }
              if (salary >= 500_000) {
                salaryBand = "Above500k";
              } else if (salary >= 300_000 && salary <= 499_999) {
                salaryBand = "300kTo499999";
              } else if (salary >= 150_000 && salary <= 299_999) {
                salaryBand = "150kTo299999";
              } else {
                // For professionals, no rates below 150k - skip this row
                console.log("Professional salary too low, skipping:", salary);
                return null;
              }
              console.log("Professional salary band selected:", salaryBand);
            }
            // Bankers Product rates have specific salary bands
            else if (notes.includes("Bankers Product")) {
              console.log("Processing as Bankers Product rates");
              
              // Only show banker rates if user selected banker
              if (isBanker !== "yes") {
                console.log("User not banker, skipping banker rate");
                return null;
              }
              
              // Bankers use rateWithoutSalary prefix for all salary bands
              console.log(`Banker salary: ${salary}, salaryLevel: ${salaryLevel}`);
              
              if (salary >= 300_000) {
                salaryBand = "rateWithoutSalaryAbove300k";
                console.log(`Banker salary ${salary} >= 300k, using rateWithoutSalaryAbove300k band`);
              } else if (salary >= 150_000 && salary <= 299_999) {
                salaryBand = "rateWithoutSalary150kTo299999";
                console.log(`Banker salary ${salary} in 150k-299k range, using rateWithoutSalary150kTo299999 band`);
              } else {
                salaryBand = "rateWithoutSalaryUpTo149999";
                console.log(`Banker salary ${salary} < 150k, using rateWithoutSalaryUpTo149999 band`);
              }
              console.log("Banker salary band selected:", salaryBand);
            }
            // Premium Company and General rates: Above300k, 150kTo299999, UpTo149999
            else {
              console.log("Processing as Premium Company/General rates");
              
              // Only show premium company rates if user selected premium company
              if (notes.includes("Premium Company") && isPremiumCompany !== "yes") {
                console.log("User not premium company, skipping premium company rate");
                return null;
              }
              
              if (salary >= 300_000) {
                salaryBand = "Above300k";
              } else if (salary >= 150_000 && salary <= 299_999) {
                salaryBand = "150kTo299999";
              } else {
                salaryBand = "UpTo149999";
              }
            }
          }

          // Determine rate field to use
          let rateField = "";
          let rateDisplay = "";
          
          if (product === "HL" || product === "LAP") {
            // Home Loan / LAP: simple with-salary vs without-salary
            if (salaryLevel === "assignment" || salaryLevel === "remittance") {
              rateField = "rateWithSalaryRemitted";
              rateDisplay = typePref === "fixed" ? "Fixed" : "Floating";
              rateDisplay += " — with salary";
            } else {
              rateField = "rateWithoutSalary";
              rateDisplay = typePref === "fixed" ? "Fixed" : "Floating";
              rateDisplay += " — without salary";
            }
          } else if (product === "EDU" || product === "PL") {
            // Education/Personal: salary band + relationship
            let relationshipSuffix = "";
            if (salaryLevel === "assignment") {
              relationshipSuffix = "Assignment";
              rateDisplay = "with salary assignment";
            } else if (salaryLevel === "remittance") {
              relationshipSuffix = "Remitted";
              rateDisplay = "with salary remittance";
            } else {
              relationshipSuffix = "";
              rateDisplay = "without salary";
            }
            
            // For Cargills bankers, salaryBand contains the full field name
            const notes = r.notes || "";
            if (notes && notes.includes("Bankers Product")) {
              rateField = salaryBand; // salaryBand is already the full field name like "rateWithoutSalaryAbove300k"
            } else {
              // For other categories, construct the field name
              if (relationshipSuffix) {
                rateField = `rateWithSalary${relationshipSuffix}${salaryBand}`;
              } else {
                rateField = `rateWithoutSalary${salaryBand}`;
              }
            }
            
            // Debug logging for Cargills rate field construction
            console.log(`🔍 Cargills Debug - Salary: ${salary}, Band: ${salaryBand}, Relationship: ${salaryLevel}, Field: ${rateField}`);

            // For Personal Loan, prioritize by customer category
            if (product === "PL") {
              const notes = r.notes || "";
              let trackPriority = 0;
              let trackName = "General";
              
              if (notes.includes("Bankers Product") && isBanker === "yes") {
                trackPriority = 3;
                trackName = "Banker";
              } else if (notes.includes("Professionals (Engineers, Doctors, Accountants, Architects, Pilots)") && isProfessional === "yes") {
                trackPriority = 2;
                trackName = "Professional";
              } else if (notes.includes("Employees of Large/Diversified Corporates (incl. Cargills Group staff, excluding bank staff)") && isPremiumCompany === "yes") {
                trackPriority = 1;
                trackName = "Premium Company";
              }
              
              rateDisplay = `${trackName} — ${rateDisplay}`;
            }
          }

          // Extract rate from the field - check both main object and raw object
          let rateValue = (r as any)[rateField];
          if (rateValue === undefined && (r as any).raw) {
            rateValue = (r as any).raw[rateField];
          }
          console.log(`🔍 Cargills Debug - Rate field '${rateField}' has value:`, rateValue);
          console.log(`🔍 Cargills Debug - Expected: Salary ${salary} should get rateWithoutSalaryAbove300k = ${(r as any).raw?.rateWithoutSalaryAbove300k}`);
          
          // Debug: Show all available fields on this row
          const allFields = Object.keys(r);
          console.log(`🔍 Cargills Debug - ALL fields on row:`, allFields);
          console.log(`🔍 Cargills Debug - Raw object:`, (r as any).raw);
          
          // Check if the salary-banded rate fields are in the raw object
          if ((r as any).raw) {
            const rawRateFields = Object.keys((r as any).raw).filter(key => key.toLowerCase().includes('rate'));
            console.log(`🔍 Cargills Debug - Rate fields in raw:`, rawRateFields);
          }
          
          if (rateValue !== undefined) {
            let parsedRate: number | undefined;
            const rateStr = String(rateValue);
            
            // Handle AWPLR-based rates (e.g., "AWPLR +3.50%")
            if (rateStr.includes("AWPLR")) {
              const awplrMatch = rateStr.match(/AWPLR\s*([+-])\s*([0-9.]+)%/i);
              if (awplrMatch && awpr) {
                const sign = awplrMatch[1] === '+' ? 1 : -1;
                const spread = parseFloat(awplrMatch[2]);
                parsedRate = awpr + (sign * spread);
              }
            } else {
              // Handle direct percentage rates
              parsedRate = typeof rateValue === "number" ? rateValue : parseFloat(rateStr.replace('%', ''));
            }
            
            if (parsedRate !== undefined && !isNaN(parsedRate)) {
              baseRate = parsedRate;
              
              // Build more specific rate display with salary band info
              let salaryBandDisplay = "";
              if (salaryBand === "Above300k") {
                salaryBandDisplay = "≥ 300k";
              } else if (salaryBand === "150kTo299999") {
                salaryBandDisplay = "150k-299k";
              } else if (salaryBand === "UpTo149999") {
                salaryBandDisplay = "≤ 149k";
              }
              
              // Construct detailed rate display
              if (product === "EDU" || product === "PL") {
                rateDisplay = `${rateDisplay} (${salaryBandDisplay})`;
              }
              
              // Add tenure info if fixed
              if (typePref === "fixed" && r.fixedYears) {
                rateDisplay = `Fixed ${r.fixedYears}y — ${baseRate.toFixed(2)}% • ${rateDisplay.replace(/^Fixed — /, '')}`;
              } else {
                rateDisplay = `${baseRate.toFixed(2)}% • ${rateDisplay}`;
              }
              
              scenarioSel = {
                rate: baseRate,
                scenario: {
                  rate: baseRate,
                  key: "cargills_best_match",
                  minSalary: "none",
                  label: rateDisplay,
                },
                eligible: true,
              };
            }
          }
        } catch (err) {
          console.warn(`Cargills rate selection failed for ${r.bank}:`, err);
          // Fall back to existing rate selection
        }
      }

      // Check if this is Nations Trust Bank for special rate selection
      const isNTBMatch = r.bank?.toLowerCase().includes("nations trust bank") || r.bank?.toLowerCase().includes("ntb");
      if (isNTBMatch && haveAmt) {
        try {
          console.log("NTB processing:", { bank: r.bank, product, monthlyNetSalary, salaryLevel, typePref, tenureYears, rowType: r.type, rowTenureLabel: r.tenureLabel });
          
          // NTB requires salary >= 350k for better rates
          const salary = Number(monthlyNetSalary || 0);
          const qualifiesForSalaryRate = salary >= 350_000 && salaryLevel !== "none";
          
          // Check if this row matches the user's requirements
          let isMatchingRow = false;
          let rateDisplay = "";
          
          if (product === "PL") {
            // Personal Loan rate selection - match based on type and tenure
            if (r.type === "Floating" && (typePref === "floating" || typePref === "any")) {
              if (r.tenureLabel === "Anytime variable") {
                isMatchingRow = true;
                rateDisplay = "Floating anytime variable";
              }
            } else if (r.type === "Fixed" && (typePref === "fixed" || typePref === "any")) {
              // Match fixed rate buckets based on tenure
              if (tenureYears === 1 && r.tenureLabel === "01 year fixed") {
                isMatchingRow = true;
                rateDisplay = "Fixed 1 year";
              } else if (tenureYears >= 2 && tenureYears <= 5 && r.tenureLabel === "Up to 5 years") {
                isMatchingRow = true;
                rateDisplay = "Fixed up to 5 years";
              } else if (tenureYears > 5 && r.tenureLabel === "Above 5 years") {
                isMatchingRow = true;
                rateDisplay = "Fixed above 5 years";
              }
            }
          } else if (product === "HL") {
            // Home Loan rate selection - only fixed rates available
            if (r.type === "Fixed" && (typePref === "fixed" || typePref === "any")) {
              if (tenureYears <= 1 && r.tenureLabel === "01 year fixed") {
                isMatchingRow = true;
                rateDisplay = "Fixed 1 year";
              } else if (tenureYears > 1 && r.tenureLabel === "05 year fixed") {
                isMatchingRow = true;
                rateDisplay = "Fixed 5 years";
              }
            }
            // No floating home loans in NTB data, skip if user wants floating only
            else if (typePref === "floating") {
              console.log("NTB: No floating home loan rates available");
              return null; // No match for floating home loans
            }
          }
          
          if (isMatchingRow) {
            // Select the appropriate rate field
            const selectedRateField = qualifiesForSalaryRate ? "rateWithSalary" : "rateWithoutSalary";
            const rateValue = (r as any)[selectedRateField];
            
            if (rateValue) {
              // Parse the rate (e.g., "12%" -> 12)
              const parsedRate = parseFloat(String(rateValue).replace('%', ''));
              
              if (!isNaN(parsedRate)) {
                baseRate = parsedRate;
                
                // Build display with salary qualification info
                const salaryQualification = qualifiesForSalaryRate ? "with salary ≥350k" : "standard rate";
                rateDisplay = `${baseRate.toFixed(2)}% • ${rateDisplay} (${salaryQualification})`;
                
                console.log("NTB rate selected:", { selectedRateField, rateValue, baseRate, rateDisplay });
                
                scenarioSel = {
                  rate: baseRate,
                  scenario: {
                    rate: baseRate,
                    key: "ntb_best_match",
                    minSalary: qualifiesForSalaryRate ? "350000" : "none",
                    label: rateDisplay,
                  },
                  eligible: true,
                };
              }
            }
          }
        } catch (err) {
          console.warn(`NTB rate selection failed for ${r.bank}:`, err);
          // Fall back to existing rate selection
        }
      }
      
      let total = 0;
      let eff: number | undefined = baseRate;
      let picked: Array<{ cat: TariffFeeType; row?: TariffRow; computed?: number; note?: string; meta?: TariffComputationMeta }> = [];
      let note = "";
      if (!(includeTariffs && haveAmt)) {
        return {
          row: r,
          rate: baseRate,
          eff: baseRate,
          upfront: 0,
          picked: [],
          note: "",
          scenario: scenarioSel.scenario,
          scenarioEligible: scenarioSel.eligible,
          scenarioDescription: describeScenario(scenarioSel.scenario),
          tariffScenario,
        };
      }
      // Use existing tariff system for most banks
      const {
        total: tariffTotal,
        actualsFlags,
        picked: tariffPicks,
      } = sumUpfrontTariffsForBank(tariffs || [], r.bank, product, amt);
      
      // For Union Bank, HNB, Seylan, Sampath, Commercial Bank, NDB, DFCC, NSB, BOC, and People's Bank, use deterministic tariff calculator
      let enhancedTariffResult: ReturnType<typeof calculateTariff> | null = null;
      const isUnionBank = r.bank.toLowerCase().includes("union");
      const isHNB = r.bank.toLowerCase() === "hnb" || r.bank.toLowerCase() === "hatton national bank";
      const isSeylan = r.bank.toLowerCase().includes("seylan");
      const isSampath = r.bank.toLowerCase().includes("sampath");
      const isComBank = r.bank.toLowerCase().includes("commercial");
      const isNDB = r.bank.toLowerCase() === "ndb" || r.bank.toLowerCase() === "ndb bank";
      const isDFCC = r.bank.toLowerCase().includes("dfcc");
      const isNSB = r.bank.toLowerCase() === "nsb" || r.bank.toLowerCase().includes("national savings bank");
      const isBOC = r.bank.toLowerCase() === "boc" || r.bank.toLowerCase().includes("bank of ceylon");
      const isCargills = r.bank.toLowerCase().includes("cargills");
      const isNTB = r.bank.toLowerCase().includes("nations trust bank") || r.bank.toLowerCase().includes("ntb");
      const isPeoples = r.bank.toLowerCase().includes("people");
      
      if ((isUnionBank || isHNB || isSeylan || isSampath || isComBank || isNDB || isDFCC || isNSB || isBOC || isCargills || isNTB || isPeoples) && includeTariffs && haveAmt) {
        // DFCC uses its own calculator with different return structure
        if (isDFCC) {
          try {
            // Map UI product to DFCC product names (reuse from rate selection above)
            const dfccProduct: dfccCalculator.DFCCInputs["product"] =
              product === "PL"
                ? "Personal Loans"
                : product === "HL"
                ? "Home Loans"
                : product === "EDU"
                ? "Education Loans"
                : "Loan Against Property";

            const dfccInputs: dfccCalculator.DFCCInputs = {
              bank: 'DFCC',
              product: dfccProduct,
              amount: amt,
              tenureYears: tenureYears || 10,
              monthlyNetSalary: Number(monthlyNetSalary || 0),
              propertyValue: (product === "HL" || product === "LAP") ? propertyValue || amt * 1.2 : undefined,
              includeTariffs: true, // Always include tariffs in this branch
              rateType: typePref === "fixed" ? "Fixed" : (typePref === "floating" ? "Variable" : "Any"),
              salaryRelationship: salaryLevel === "assignment" ? "Assignment" : (salaryLevel === "remittance" ? "Remittance" : "None"),
              customerCategory,
              isProfessional: isProfessional === "yes",
              isBanker: isBanker === "yes",
              isTeacher: isTeacher === "yes",
              worksAtPremiumCompany: isPremiumCompany === "yes",
              enableExpress: expressProcessing,
              takeCreditCard: takeCreditCard === "yes",
              useInternetBanking: useInternetBanking === "yes",
              firstHome: isFirstHome === "yes",
              isCondo
            };

            // Call DFCC calculator with full data
            const dfccResult = dfccCalculator.dfccCalculator.calculate(dfccInputs, rows as any[], tariffs as any[]);

            // Convert DFCC PriceResult to CompareResult picked format
            picked = [];
            
            // Processing fee
            if (dfccResult.processing.amountLKR > 0) {
              // Build a TariffRow for display if we have the matched raw row
              const pfRowRaw: any = (dfccResult.processing as any).row;
              const pfRow: TariffRow | undefined = pfRowRaw ? {
                bank: String(pfRowRaw.bank || r.bank),
                product: product,
                feeType: "processing",
                feeTypeRaw: String(pfRowRaw.feeType || "Processing Fee"),
                basis: "flat",
                value: dfccResult.processing.amountLKR,
                description: String(pfRowRaw.description || "Processing Fee"),
                amount: pfRowRaw.amount ? String(pfRowRaw.amount) : undefined,
                updatedAt: String(pfRowRaw.updatedAt || new Date().toISOString()),
                source: String(pfRowRaw.source || ""),
              } : undefined;
              picked.push({
                cat: "processing",
                computed: dfccResult.processing.amountLKR,
                note: dfccResult.processing.label,
                row: pfRow,
                meta: {
                  basis: "flat",
                  value: dfccResult.processing.amountLKR,
                  detail: dfccResult.processing.ruleRef,
                } as any,
              });
            }

            // Legal fees
            if (dfccResult.legal) {
              for (const legalItem of dfccResult.legal) {
                const amount = legalItem.amountLKR || 0;
                const raw: any = (legalItem as any).row;
                const legalRow: TariffRow | undefined = raw ? {
                  bank: String(raw.bank || r.bank),
                  product: product,
                  feeType: "legal",
                  feeTypeRaw: String(raw.feeType || "Legal Fees"),
                  basis: "flat",
                  value: amount,
                  description: String(raw.description || legalItem.label),
                  amount: raw.amount ? String(raw.amount) : undefined,
                  updatedAt: String(raw.updatedAt || new Date().toISOString()),
                  source: String(raw.source || ""),
                } : undefined;
                picked.push({
                  cat: "legal",
                  computed: amount,
                  note: legalItem.label,
                  row: legalRow,
                  meta: {
                    basis: /%/.test(String(legalItem.formula || "")) ? "percent" : "flat",
                    value: amount,
                    detail: legalItem.ruleRef + (legalItem.capLKR ? ` (cap: Rs.${legalItem.capLKR.toLocaleString()})` : ''),
                  } as any,
                });
              }
            }

            // Other fees
            if (dfccResult.otherFees) {
              for (const otherItem of dfccResult.otherFees) {
                const amount = otherItem.amountLKR || 0;
                if (!(amount > 0)) continue; // skip zero/non-numeric other charges
                const raw: any = (otherItem as any).row;
                const otherRow: TariffRow | undefined = raw ? {
                  bank: String(raw.bank || r.bank),
                  product: product,
                  feeType: "other",
                  feeTypeRaw: String(raw.feeType || "Other Charges"),
                  basis: "flat",
                  value: amount,
                  description: String(raw.description || otherItem.label),
                  amount: raw.amount ? String(raw.amount) : undefined,
                  updatedAt: String(raw.updatedAt || new Date().toISOString()),
                  source: String(raw.source || ""),
                } : undefined;
                picked.push({
                  cat: "other",
                  computed: amount,
                  note: otherItem.label,
                  row: otherRow,
                  meta: {
                    basis: "flat",
                    value: amount,
                    detail: otherItem.ruleRef,
                  } as any,
                });
              }
            }

            // Calculate total from all picked items
            total = picked.reduce((sum, p) => sum + (p.computed || 0), 0);

          } catch (err) {
            console.error("DFCC tariff calculation failed:", err);
            // Fall back to existing system
            total = tariffTotal;
            picked = tariffPicks;
          }
        } else if (isNSB) {
          // NSB uses its own calculator with different return structure
          try {
            // Map UI product to NSB product names
            const nsbProduct: nsbCalculator.NSBInputs["product"] =
              product === "PL"
                ? "Personal Loans"
                : product === "HL"
                ? "Home Loans"
                : product === "EDU"
                ? "Education Loans"
                : "Loan Against Property";

            const nsbInputs: nsbCalculator.NSBInputs = {
              bank: 'NSB',
              product: nsbProduct,
              amount: amt,
              includeTariffs: true, // Always include tariffs in this branch
              enableExpress: expressProcessing,
              expressDays: expressProcessing ? nsbExpressDays : undefined, // Use selected express days
              extraCribParties: 0, // Default to 0, could be made configurable
              isGovtHousing: false, // Default to false, could be made configurable
            };

            // Create NSB tariff payload from the existing tariffs data
            const nsbPayload: nsbCalculator.NSBTariffPayload = {
              bank: "NSB",
              rows: (tariffs || [])
                .filter(t => t.bank === "NSB")
                .map(t => ({
                  bank: "NSB" as const,
                  product: t.product === "HL" ? "Home Loan" as const : 
                           t.product === "PL" ? "Personal Loan" as const :
                           "Education Loan" as const,
                  feeType: t.feeTypeRaw || t.feeType,
                  description: t.description,
                  note: t.notes,
                  amount: t.amount || String(t.value || ""),
                  source: t.source || "",
                  updatedAt: t.updatedAt || new Date().toISOString(),
                }))
            };

            // Call NSB calculator
            const nsbResult = nsbCalculator.calculateNSBTariffs(nsbInputs, nsbPayload);

            // Convert NSB PriceResultPart to CompareResult picked format
            picked = [];
            
            // Processing fee
            if (nsbResult.processing && nsbResult.processing.amountLKR && nsbResult.processing.amountLKR > 0) {
              picked.push({
                cat: "processing",
                computed: nsbResult.processing.amountLKR,
                note: nsbResult.processing.label,
                meta: {
                  basis: "flat",
                  value: nsbResult.processing.amountLKR,
                  detail: nsbResult.processing.ruleRef,
                } as any,
              });
            }

            // Other fees
            if (nsbResult.otherFees) {
              for (const otherItem of nsbResult.otherFees) {
                const amount = otherItem.amountLKR || 0;
                if (!(amount > 0)) continue; // skip zero/non-numeric charges
                
                // Map to appropriate category
                let category: TariffFeeType = "other";
                const lowerLabel = otherItem.label.toLowerCase();
                if (lowerLabel.includes("legal") || lowerLabel.includes("deed") || lowerLabel.includes("title")) {
                  category = "legal";
                } else if (lowerLabel.includes("valuation")) {
                  category = "valuation";
                } else if (lowerLabel.includes("crib")) {
                  category = "other"; // CRIB as "other"
                }
                
                picked.push({
                  cat: category,
                  computed: amount,
                  note: otherItem.label,
                  meta: {
                    basis: "flat",
                    value: amount,
                    detail: otherItem.ruleRef,
                  } as any,
                });
              }
            }

            // Calculate total from all picked items
            total = picked.reduce((sum, p) => sum + (p.computed || 0), 0);

          } catch (err) {
            console.error("NSB tariff calculation failed:", err);
            // Fall back to existing system
            total = tariffTotal;
            picked = tariffPicks;
          }
        } else if (isBOC) {
          // BOC calculator
          try {
            const bocProduct: bocCalculator.BocCalculatorInputs["product"] =
              product === "PL"
                ? "Personal Loans"
                : product === "HL"
                ? "Home Loans"
                : product === "EDU"
                ? "Education Loans"
                : "Loan Against Property";

            const bocInputs: bocCalculator.BocCalculatorInputs = {
              product: bocProduct,
              loanAmount: amt,
              tenureYears: tenureYears,
            };

            // Get rate data for BOC
            const bocRateData = rows
              .filter(row => row.bank === "Bank of Ceylon")
              .map(row => ({
                bank: row.bank,
                product: row.product || "Unknown",
                type: "Fixed",
                tenureLabel: `${tenureYears} Years`,
                rateWithSalary: row.rate || "0%",
                rateWithoutSalary: row.rate || "0%",
                source: row.source || "",
                updatedAt: new Date().toISOString(),
                notes: row.notes || "",
                tenureYears: tenureYears
              })) as bocCalculator.BocRateRow[];

            // Get tariff data for BOC
            const bocTariffData = (tariffs || [])
              .filter(t => t.bank === "Bank of Ceylon" || t.bank === "BOC")
              .map(t => ({
                bank: "Bank of Ceylon",
                product: t.product === "HL" ? "Home Loan" : 
                         t.product === "PL" ? "Personal Loan" :
                         t.product === "LAP" ? "LAP" :
                         "Education Loan",
                feeCategory: t.feeType === "processing" ? "Processing Fee" : "Early Settlement",
                description: t.description || "",
                amount: t.amount || String(t.value || ""),
                updatedAt: new Date().toISOString(),
                source: t.source || ""
              })) as bocCalculator.BocTariffRow[];

            // Get BOC rate
            const bocRate = bocCalculator.getBocRate(bocInputs, bocRateData);
            
            // Get BOC tariffs
            const bocTariffResult = bocCalculator.getBocTariffs(bocInputs, bocTariffData);
            
            // Convert to CompareResult format
            picked = [];
            
            // Processing fee
            if (bocTariffResult?.processingFee && bocTariffResult.processingFee.amount > 0) {
              picked.push({
                cat: "processing",
                computed: bocTariffResult.processingFee.amount,
                note: bocTariffResult.processingFee.label,
                meta: {
                  basis: "flat",
                  value: bocTariffResult.processingFee.amount,
                  detail: bocTariffResult.processingFee.formula,
                } as any,
              });
            }

            // Other fees
            if (bocTariffResult?.otherFees) {
              for (const otherItem of bocTariffResult.otherFees) {
                const amount = typeof otherItem.amount === "number" ? otherItem.amount : 0;
                if (!(amount > 0)) continue;
                
                picked.push({
                  cat: "other",
                  computed: amount,
                  note: otherItem.label,
                  meta: {
                    basis: "flat",
                    value: amount,
                    detail: otherItem.note,
                  } as any,
                });
              }
            }

            // Calculate total from all picked items
            total = picked.reduce((sum, p) => sum + (p.computed || 0), 0);

            // Override rate if BOC calculator found a better one
            if (bocRate && bocRate.rate > 0) {
              const bocRateDecimal = bocRate.rate / 100; // Convert percentage to decimal
              const rateStr = String(r.rate || '0').replace('%', '');
              const currentRate = parseFloat(rateStr) / 100;
              if (Math.abs(currentRate - bocRateDecimal) > 0.001) { // Different rates
                // For now, just use standard tariff result structure - rate enhancement can be handled separately
                enhancedTariffResult = null; // TODO: Implement proper rate override structure
                // Note: BOC rate found: bocRate.rate% vs current rate
              }
            }

          } catch (err) {
            console.error("BOC tariff calculation failed:", err);
            // Fall back to existing system
            total = tariffTotal;
            picked = tariffPicks;
          }
        } else if (isCargills) {
          try {
            // Cargills Bank tariff calculation
            console.log("🏦 Calculating Cargills Bank tariffs");
            
            let processingFee = 0;
            let legalFee = 0;
            let processingNote = "";
            let legalNote = "";
            
            // Processing Fee calculation
            if (product === "PL" || product === "EDU") {
              // Personal Loan & Education Loan - tiered structure
              if (amt <= 500_000) {
                processingFee = 5_000;
                processingNote = "Processing Fee (≤500k)";
              } else if (amt <= 7_500_000) {
                processingFee = 8_500;
                processingNote = "Processing Fee (500k-7.5M)";
              } else {
                processingFee = 12_500;
                processingNote = "Processing Fee (>7.5M)";
              }
              
              // Apply waivers for PL/EDU
              if (salaryLevel === "assignment" || salaryLevel === "remittance") {
                processingFee = processingFee * 0.5; // 50% waiver for salary account holders
                processingNote += " (50% waived - salary account)";
              } else if (product === "EDU") {
                processingFee = processingFee * 0.75; // 25% waiver for Abhimani education loans
                processingNote += " (25% waived - Abhimani education)";
              }
              
            } else if (product === "HL") {
              // Home Loan - 0.50% with min/max
              processingFee = Math.max(5_000, Math.min(100_000, amt * 0.005));
              processingNote = "Processing Fee (0.50%)";
              
            } else if (product === "LAP") {
              // Loan Against Property - 0.5% with min 10,000
              processingFee = Math.max(10_000, amt * 0.005);
              processingNote = "Processing Fee (0.5% min 10k)";
            }
            
            // Legal Fee calculation for HL/LAP
            if (product === "HL" || product === "LAP") {
              if (amt <= 1_000_000) {
                legalFee = amt * 0.015; // 1.50%
                legalNote = "Legal Fee (1.50%)";
              } else if (amt <= 5_000_000) {
                legalFee = amt * 0.01; // 1.00%
                legalNote = "Legal Fee (1.00%)";
              } else if (amt <= 25_000_000) {
                legalFee = amt * 0.0075; // 0.75%
                legalNote = "Legal Fee (0.75%)";
              } else if (amt <= 50_000_000) {
                legalFee = 187_000 + (amt - 25_000_000) * 0.005; // 187k + 0.50%
                legalNote = "Legal Fee (187k + 0.50%)";
              } else {
                legalFee = 312_500 + (amt - 50_000_000) * 0.003; // 312.5k + 0.30%
                legalNote = "Legal Fee (312.5k + 0.30%)";
              }
            }
            
            // Build picked array
            picked = [];
            total = 0;
            
            if (processingFee > 0) {
              picked.push({
                cat: "processing",
                computed: processingFee,
                note: processingNote,
                meta: {
                  basis: "flat",
                  value: processingFee,
                  detail: "Cargills processing fee",
                } as any,
              });
              total += processingFee;
            }
            
            if (legalFee > 0) {
              picked.push({
                cat: "legal",
                computed: legalFee,
                note: legalNote,
                meta: {
                  basis: "percent",
                  value: legalFee,
                  detail: "Cargills legal fee",
                } as any,
              });
              total += legalFee;
            }
            
            console.log("🏦 Cargills tariff calculated:", { processingFee, legalFee, total });
            
          } catch (err) {
            console.error("Cargills Bank tariff calculation failed:", err);
            // Fall back to existing system
            total = tariffTotal;
            picked = tariffPicks;
          }
        } else if (isNTB) {
          try {
            // Nations Trust Bank tariff calculation
            console.log("🏦 Calculating NTB tariffs");
            
            let applicationFee = 0;
            let processingFee = 0;
            let legalFee = 0;
            let applicationNote = "";
            let processingNote = "";
            let legalNote = "";
            
            if (product === "HL") {
              // Home Loan tariffs
              applicationFee = 5_000;
              applicationNote = "Application fee";
              
              // Processing fee based on loan amount and condo status
              if (isCondo === "yes") {
                // Condominium purchase (under construction rates apply for condos)
                if (amt < 5_000_000) {
                  processingFee = 70_000;
                  processingNote = "Processing Fee - Condominium purchase (<5M)";
                } else if (amt < 10_000_000) {
                  processingFee = 75_000;
                  processingNote = "Processing Fee - Condominium purchase (5-10M)";
                } else if (amt < 20_000_000) {
                  processingFee = 80_000;
                  processingNote = "Processing Fee - Condominium purchase (10-20M)";
                } else if (amt < 30_000_000) {
                  processingFee = 85_000;
                  processingNote = "Processing Fee - Condominium purchase (20-30M)";
                } else {
                  processingFee = 90_000;
                  processingNote = "Processing Fee - Condominium purchase (≥30M)";
                }
              } else {
                // Normal housing loans
                if (amt < 3_000_000) {
                  processingFee = 32_500;
                  processingNote = "Processing Fee - Housing (<3M)";
                } else if (amt < 6_000_000) {
                  processingFee = 42_500;
                  processingNote = "Processing Fee - Housing (3-6M)";
                } else if (amt < 10_000_000) {
                  processingFee = 65_000;
                  processingNote = "Processing Fee - Housing (6-10M)";
                } else if (amt < 20_000_000) {
                  processingFee = 90_000;
                  processingNote = "Processing Fee - Housing (10-20M)";
                } else {
                  processingFee = 110_000;
                  processingNote = "Processing Fee - Housing (≥20M)";
                }
              }
              
              // Legal fee is covered by bank fee
              legalNote = "Legal fees covered by bank fee; VAT may apply";
              
            } else if (product === "PL") {
              // Personal Loan tariffs
              processingFee = Math.max(amt * 0.005, 10_000); // 0.5% min 10k
              processingNote = "Processing Fee (0.5% min 10k)";
              
              // Green Channel express processing
              if (expressProcessing) {
                processingFee += 20_000;
                processingNote += " + Express (20k)";
              }
              
              // Apply waivers (best single waiver only)
              if (customerCategory === "VIP") {
                processingFee = processingFee * 0.75; // 25% waiver for Private Banking
                processingNote += " (25% VIP waiver)";
              } else if (salaryLevel === "assignment") {
                processingFee = processingFee * 0.9; // 10% waiver for Inner Circle
                processingNote += " (10% Inner Circle waiver)";
              }
            }
            
            // Build picked array
            picked = [];
            total = 0;
            
            if (applicationFee > 0) {
              picked.push({
                cat: "processing",
                computed: applicationFee,
                note: applicationNote,
                meta: {
                  basis: "flat",
                  value: applicationFee,
                  detail: "NTB application fee",
                } as any,
              });
              total += applicationFee;
            }
            
            if (processingFee > 0) {
              picked.push({
                cat: "processing",
                computed: processingFee,
                note: processingNote,
                meta: {
                  basis: processingFee === Math.max(amt * 0.005, 10_000) ? "percent" : "flat",
                  value: processingFee,
                  detail: "NTB processing fee",
                } as any,
              });
              total += processingFee;
            }
            
            if (legalNote) {
              // Add legal note without cost (covered by bank)
              picked.push({
                cat: "legal",
                computed: 0,
                note: legalNote,
                meta: {
                  basis: "flat",
                  value: 0,
                  detail: "NTB legal arrangement",
                } as any,
              });
            }
            
            console.log("🏦 NTB tariff calculated:", { applicationFee, processingFee, total });
            
          } catch (err) {
            console.error("NTB tariff calculation failed:", err);
            // Fall back to existing system
            total = tariffTotal;
            picked = tariffPicks;
          }
        } else {
          // Use existing tariff calculator for Union, HNB, Seylan, Sampath, ComBank, NDB, People's Bank
        const tariffProduct = determineTariffProduct();
        if (tariffProduct || isHNB) {
          try {
            // For Housing/LAP, estimate property value if not provided (typically 120% of loan for 80% LTV)
            const estimatedPropertyValue = (product === "HL" || product === "LAP") 
              ? (propertyValue || amt * 1.2) 
              : undefined;
            
            // For NDB Personal Loan, determine plChannel based on security + express
            let ndbPlChannel: "Standard" | "FastTrack" | "MortgagedBack" | undefined = undefined;
            if (isNDB && product === "PL") {
              if (plSecurity === "secured") {
                ndbPlChannel = "MortgagedBack";
              } else if (expressProcessing) {
                ndbPlChannel = "FastTrack";
              } else {
                ndbPlChannel = "Standard";
              }
            }
            
            enhancedTariffResult = calculateTariff({
              bank: isSeylan ? "Seylan" : (isHNB ? "HNB" : (isSampath ? "Sampath" : (isComBank ? "CommercialBank" : (isNDB ? "NDB" : (isPeoples ? "PeoplesBank" : "UnionBank"))))),
              loanAmount: amt,
              product: tariffProduct as TariffProduct, // Type assertion safe here since we checked tariffProduct || isHNB
              propertyValue: estimatedPropertyValue,
              // If user enabled Express, use FastTrack where available (e.g., Seylan PL)
              personalSpeed: expressProcessing ? "FastTrack" : "Normal",
              usePanelLawyer: false, // Using standard legal fees (not panel lawyer)
              tripartite: isCondo === "yes" ? "Standard" : "None", // LKR 25,000 if condominium/tripartite
              includeTitleClearance: true, // Include LKR 10,000 title clearance
              deductApplicationFeeAtDisbursement: true,
              // Seylan-specific: pass isCondominium for title report fee variant
              isCondominium: isCondo === "yes",
              // Sampath-specific: mortgage handling fee toggle (not exposed in UI yet, defaults to false)
              includeMortgageHandling: false,
              // NDB-specific: pass plChannel for Personal Loan security-based fee selection
              plChannel: ndbPlChannel,
            });
            
            // Override total with enhanced calculator result
            total = enhancedTariffResult.grandTotalCashOutflow;
            
            // Convert enhanced calculator fee rows to picked format for display
            picked = enhancedTariffResult.rows.map(feeRow => {
              // Map fee types to proper categories
              let category: TariffFeeType = "processing";
              const lowerLabel = feeRow.label.toLowerCase();
              if (lowerLabel.includes("legal") || lowerLabel.includes("tripartite") || lowerLabel.includes("title")) {
                category = "legal";
              } else if (lowerLabel.includes("valuation")) {
                category = "valuation";
              } else if (lowerLabel.includes("application")) {
                category = "other"; // Application fee as "other"
              }
              
              return {
                cat: category,
                computed: feeRow.amount,
                note: feeRow.label, // Always use label as the display name
                meta: {
                  basis: feeRow.basis?.includes("%") ? "percent" : "flat",
                  value: feeRow.amount,
                  detail: feeRow.note, // Store the detailed note separately
                } as any,
              };
            });
          } catch (err) {
            console.error("Union Bank tariff calculation failed:", err);
            // Fall back to existing system
            total = tariffTotal;
            picked = tariffPicks;
          }
        } else if (isCargills) {
          // Cargills Bank tariff calculation
          try {
            picked = [];
            total = 0;
            let nonUpfrontNotes: string[] = [];

            // Processing fee calculation
            let processingFee = 0;
            if (product === "HL") {
              // Home Loan: 0.5% (Min 5,000; Max 100,000)
              processingFee = Math.max(5000, Math.min(100000, Math.ceil(amt * 0.005)));
            } else if (product === "LAP") {
              // LAP: 0.5% (Min 10,000, no max)
              processingFee = Math.max(10000, Math.ceil(amt * 0.005));
            } else if (product === "PL" || product === "EDU") {
              // Personal/Education: by loan amount tiers
              if (amt <= 500000) {
                processingFee = 5000;
              } else if (amt <= 7500000) {
                processingFee = 8500;
              } else {
                processingFee = 12500;
              }

              // Apply 50% salary waiver if with-salary and notes mention "50% salary waiver"
              const rowNotes = r.notes || "";
              if ((salaryLevel === "assignment" || salaryLevel === "remittance") && 
                  rowNotes.toLowerCase().includes("50% salary waiver")) {
                const waiverAmount = processingFee * 0.5;
                picked.push({
                  cat: "processing",
                  computed: processingFee,
                  note: "Processing Fee",
                  meta: { basis: "flat", value: processingFee, detail: "Base processing fee" } as any,
                });
                picked.push({
                  cat: "processing",
                  computed: -waiverAmount,
                  note: "50% Salary Waiver",
                  meta: { basis: "flat", value: -waiverAmount, detail: "Salary relationship waiver" } as any,
                });
                processingFee = processingFee - waiverAmount;
                total += processingFee;
              } else {
                picked.push({
                  cat: "processing",
                  computed: processingFee,
                  note: "Processing Fee",
                  meta: { basis: "flat", value: processingFee, detail: "Processing fee" } as any,
                });
                total += processingFee;
              }
            } else {
              // Just add processing fee for other loan types
              picked.push({
                cat: "processing",
                computed: processingFee,
                note: "Processing Fee",
                meta: { basis: "flat", value: processingFee, detail: "Processing fee" } as any,
              });
              total += processingFee;
            }

            // Legal fee calculation (for HL and LAP)
            if (product === "HL" || product === "LAP") {
              let legalFee = 0;
              if (amt <= 1000000) {
                legalFee = Math.ceil(amt * 0.015); // 1.5%
              } else if (amt <= 5000000) {
                legalFee = Math.ceil(amt * 0.01); // 1.0%
              } else if (amt <= 25000000) {
                legalFee = Math.ceil(amt * 0.0075); // 0.75%
              } else if (amt <= 50000000) {
                legalFee = 187500 + Math.ceil((amt - 25000000) * 0.005); // 187,500 + 0.5% over 25M
              } else {
                legalFee = 312500 + Math.ceil((amt - 50000000) * 0.003); // 312,500 + 0.3% over 50M
              }

              picked.push({
                cat: "legal",
                computed: legalFee,
                note: "Legal Fees",
                meta: { basis: "percent", value: legalFee, detail: "Legal fee per slab structure" } as any,
              });
              total += legalFee;
            }

            // Add non-upfront notes
            nonUpfrontNotes.push("Early Settlement: 5% (≤1y), 4% (>1y)");
            nonUpfrontNotes.push("Penal Interest: 2%");
            
            if (product === "EDU") {
              nonUpfrontNotes.push("Abhimani 25% waiver may apply if eligible");
            }

            // For processing fee only (not Personal/Education with waiver logic)
            if (product !== "PL" && product !== "EDU") {
              picked.push({
                cat: "processing",
                computed: processingFee,
                note: "Processing Fee",
                meta: { basis: "flat", value: processingFee, detail: "Processing fee" } as any,
              });
              total += processingFee;
            }

          } catch (err) {
            console.error("Cargills Bank tariff calculation failed:", err);
            // Fall back to existing system
            total = tariffTotal;
            picked = tariffPicks;
          }
        } else {
          total = tariffTotal;
          picked = tariffPicks;
        }
        } // Close the DFCC else block
      } else {
        total = tariffTotal;
        picked = tariffPicks;
      }
      
      if (typeof baseRate === "number" && amt > 0) {
        eff = baseRate + (total / amt) * 100;
      } else if (Number.isFinite(r.rate) && amt > 0) {
        eff = (r.rate as number) + (total / amt) * 100;
      }
      note = actualsFlags.length ? `${actualsFlags.map((c) => c.replace(/_/g, " ")).join(", ")} at actuals` : "";
      
      // Calculate EMI (Monthly Payment)
      let emi = 0;
      if (amt > 0 && tenureYears > 0) {
        const monthlyRate = (baseRate || r.rate || 12) / 100 / 12; // Convert annual % to monthly decimal
        const numPayments = tenureYears * 12;
        
        if (monthlyRate > 0) {
          // Standard EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
          emi = (amt * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
        } else {
          // If rate is 0, simple division
          emi = amt / numPayments;
        }
      }
      
      return {
        row: r,
        rate: baseRate,
        eff,
        emi,
        upfront: total,
        picked,
        note,
        scenario: scenarioSel.scenario,
        scenarioEligible: scenarioSel.eligible,
        scenarioDescription: describeScenario(scenarioSel.scenario),
        tariffScenario,
      };
    });

    // Filter out null values (e.g., ineligible Cargills Professional rates)
    const validEnriched = enriched.filter((item): item is NonNullable<typeof item> => item !== null);

    // Sort by lowest effective rate, then bank, then product
    const rateOf = (item: (typeof validEnriched)[number]) => {
      if (typeof item.rate === "number" && Number.isFinite(item.rate)) return item.rate;
      if (Number.isFinite(item.row.rate)) return item.row.rate;
      return Number.POSITIVE_INFINITY;
    };
    const sorted = validEnriched.slice().sort((a, b) => {
      const rateA = rateOf(a);
      const rateB = rateOf(b);
      if (rateA !== rateB) return rateA - rateB;
      const bankA = (a.row.bank || "").trim().toLowerCase();
      const bankB = (b.row.bank || "").trim().toLowerCase();
      if (bankA !== bankB) return bankA.localeCompare(bankB);
      const productA = a.row.product || "";
      const productB = b.row.product || "";
      return productA.localeCompare(productB);
    });

    // Pick top 3 unique banks
    const picks: typeof enriched = [];
    const seen = new Set<string>();
    for (const item of sorted) {
      const bankKey = (item.row.bank || "").trim().toLowerCase() || "__unknown__";
      if (seen.has(bankKey)) continue;
      seen.add(bankKey);
      picks.push(item);
      if (picks.length === 3) break;
    }



    setResults(picks);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const needsLtv = product === "HL" || product === "LAP";
  const showFixedYears = typePref === "fixed";
  const hasBankFilter = bankFilter.trim().length > 0;

  type TariffPick = { cat: TariffFeeType; row?: TariffRow; computed?: number; note?: string; meta?: TariffComputationMeta };
  function describeTariffPick(pick: TariffPick): { main: string; detail: string } {
    if (!pick.row) {
      // For Union Bank enhanced calculator (no row, just computed amount)
      const main = pick.computed != null ? `LKR ${lkr(pick.computed)}` : "N/A";
      return { main, detail: "" };
    }
    const { row } = pick;
    const basis = pick.meta?.basis ?? row.basis;
    const value = pick.meta?.value ?? row.value;
    const min = pick.meta?.min ?? row.min;
    const max = pick.meta?.max ?? row.max;
    const detailParts: string[] = [];
    if (basis === "percent" && typeof value === "number") {
      const pct = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
      detailParts.push(`${pct}%`);
    } else if (basis === "flat" && typeof value === "number") {
      detailParts.push(`LKR ${lkr(value)}`);
    } else if (basis === "actuals") {
      detailParts.push("At actuals");
    }
    if (typeof min === "number") detailParts.push(`min LKR ${lkr(min)}`);
    if (typeof max === "number") detailParts.push(`max LKR ${lkr(max)}`);
    const derivations: string[] = [];
    if (pick.meta?.valueDerived) {
      const src = pick.meta.valueSource;
      const label =
        src === "amount" ? "amount text" :
        src === "description" ? "description" :
        src === "notes" ? "notes" :
        "value";
      derivations.push(`value parsed from ${label}`);
    }
    if (pick.meta?.minDerived) derivations.push("min parsed from notes");
    if (pick.meta?.maxDerived) derivations.push("max parsed from notes");
    if (pick.meta?.loanMin != null || pick.meta?.loanMax != null) {
      const rangeParts: string[] = [];
      if (pick.meta?.loanMin != null) {
        rangeParts.push(`${pick.meta.loanMinExclusive ? ">" : "="} LKR ${lkr(pick.meta.loanMin)}`);
      }
      if (pick.meta?.loanMax != null) {
        rangeParts.push(`${pick.meta.loanMaxExclusive ? "<" : "="} LKR ${lkr(pick.meta.loanMax)}`);
      }
      const sourceLabel =
        pick.meta?.loanSource === "feeType"
          ? "fee type"
          : pick.meta?.loanSource === "amount"
          ? "amount text"
          : pick.meta?.loanSource === "notes"
          ? "notes"
          : "description";
      derivations.push(`loan band ${rangeParts.join(" & ")} (from ${sourceLabel})`);
    }
    if (derivations.length) detailParts.push(derivations.join(", "));
    const main =
      pick.computed != null ? `LKR ${lkr(pick.computed)}` : pick.note || "N/A";
    return { main, detail: detailParts.join(" | ") };
  }

  function CompareResultCard({ result, idx }: { result: CompareResult; idx: number }) {
    const [expanded, setExpanded] = React.useState(false);
    const interestRate = resolveInterestRate(result);
    const effectiveRate = resolveEffectiveRate(result);

    // Calculate potential savings vs. highest rate
    const savingsVsHighest = idx > 0 && interestRate && resolveInterestRate(results[0]) ? 
      ((interestRate - resolveInterestRate(results[0])!) * (amount || 0) * tenureYears / 100) : 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} 
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.1 }}
        className="rounded-2xl overflow-hidden shadow-xl border border-white/10"
        style={{ 
          background: idx === 0 
            ? `linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%)`
            : `linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeSoft} 100%)` 
        }}
      >
        <div className="p-6 text-white">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`text-xs uppercase tracking-wider px-3 py-1 rounded-full ${
                idx === 0 ? 'bg-green-500/20 text-green-300' : 'bg-white/10'
              }`}>
                #{idx + 1} {idx === 0 ? '• Recommended' : ''}
              </div>
              {idx > 0 && savingsVsHighest > 0 && (
                <div className="text-xs px-3 py-1 rounded-full bg-orange-500/20 text-orange-300">
                  +LKR {lkr(savingsVsHighest)} vs. #1
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-3xl font-extrabold">
                {interestRate != null ? `${interestRate.toFixed(2)}%` : "N/A"}
              </div>
              {effectiveRate != null && includeTariffs && interestRate !== effectiveRate && (
                <div className="text-sm text-white/70">
                  Eff: {effectiveRate.toFixed(2)}%
                </div>
              )}
            </div>
          </div>

          {/* Bank Info */}
          <div className="flex items-center gap-3 mb-2">
            {result.row.bank && <BankLogoName bank={result.row.bank} />}
            {(result.row.bank.toLowerCase().includes("union") || 
              result.row.bank.toLowerCase() === "hnb" || 
              result.row.bank.toLowerCase() === "hatton national bank" ||
              result.row.bank.toLowerCase().includes("seylan") ||
              result.row.bank.toLowerCase().includes("sampath") ||
              result.row.bank.toLowerCase().includes("commercial") ||
              result.row.bank.toLowerCase().includes("cargills") ||
              result.row.bank.toLowerCase().includes("nations trust") ||
              result.row.bank.toLowerCase().includes("ntb") ||
              result.row.bank.toLowerCase().includes("people")) && includeTariffs && (
              <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                ✓ Enhanced Calculator
              </span>
            )}
            {/* Express / Fast Track indicator when user enabled express */}
            {includeTariffs && expressProcessing && (
              <span
                className="text-xs px-2 py-1 rounded bg-pink-500/20 text-pink-200 border border-pink-400/30"
                title={
                  result.row.bank.toLowerCase().includes("seylan") && result.row.product === "PL"
                    ? "Fast track approval within 02 working days"
                    : "Express/Green channel pricing applied"
                }
              >
                {result.row.bank.toLowerCase().includes("seylan") && result.row.product === "PL"
                  ? "Fast Track"
                  : "Express"}
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-sm text-white/70 mb-3">
            <span>{PRODUCTS.find((p) => p.key === result.row.product)?.label}</span>
            <span>•</span>
            <span>{result.row.type}{result.row.type === "Fixed" && result.row.fixedYears ? ` (${result.row.fixedYears}y)` : ""}</span>
            {result.scenarioDescription && (
              <>
                <span>•</span>
                <span className="text-xs">{result.scenarioDescription}</span>
              </>
            )}
          </div>

          {result.row.notes && (
            <div className="text-sm text-white/80 bg-white/5 rounded-lg p-2 mb-3">
              💡 {result.row.notes}
            </div>
          )}

          {/* Key Metrics Grid */}
          {includeTariffs && Number.isFinite(Number(amount)) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 rounded-lg bg-white/5 mb-3">
              <div>
                <div className="text-xs text-white/60 uppercase">Monthly Payment</div>
                <div className="text-lg font-semibold">
                  LKR {lkr((() => {
                    const P = amount || 0;
                    const r = (interestRate || 0) / 100 / 12;
                    const n = tenureYears * 12;
                    if (r === 0) return P / n;
                    return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                  })())}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/60 uppercase">Total Interest</div>
                <div className="text-lg font-semibold">
                  LKR {lkr((() => {
                    const P = amount || 0;
                    const r = (interestRate || 0) / 100 / 12;
                    const n = tenureYears * 12;
                    if (r === 0) return 0;
                    const monthly = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                    return (monthly * n) - P;
                  })())}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/60 uppercase">Upfront Costs</div>
                <div className="text-lg font-semibold">
                  LKR {lkr(result.upfront || 0)}
                  {result.note && <span className="text-xs text-white/60 ml-1">*</span>}
                </div>
              </div>
            </div>
          )}

          {/* Expandable Fee Breakdown */}
          {includeTariffs && result.picked && result.picked.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-sm"
              >
                <span className="font-medium">Fee Breakdown</span>
                <span className="text-xs">{expanded ? '▲ Hide' : '▼ Show'}</span>
              </button>
              
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mt-2 space-y-2"
                >
                  {result.picked.map((p, pickIdx) => {
                    const label = p.cat.replace(/_/g, " ");
                    const { main, detail } = describeTariffPick(p);
                    // Prefer a specific label when we have the matched row: "<note|feeTypeRaw> — <description>"
                    const displayLabel = p.row
                      ? `${(p.note || p.row.feeTypeRaw || label)}${p.row.description ? ` — ${p.row.description}` : ""}`
                      : (p.note ? p.note : label);
                    // Also show the detail from meta if available (Union Bank notes)
                    const extraDetail = (p.meta as any)?.detail;
                    const fullDetail = extraDetail ? (detail ? `${detail} • ${extraDetail}` : extraDetail) : detail;
                    
                    return (
                      <div key={`${label}-${pickIdx}`} className="flex items-start justify-between p-2 rounded bg-white/5 text-xs">
                        <div className="flex-1">
                          <div className="font-medium text-white/90">{displayLabel}</div>
                          {fullDetail && <div className="text-white/60 mt-1 text-[11px]">{fullDetail}</div>}
                        </div>
                        <div className="font-semibold text-white/90 text-right ml-3">{main}</div>
                      </div>
                    );
                  })}
                  {result.note && (
                    <div className="text-xs text-white/60 italic">* {result.note}</div>
                  )}
                </motion.div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {result.row.source && (
              <a 
                href={result.row.source} 
                target="_blank" 
                rel="noreferrer"
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-sm font-medium"
              >
                📄 View Official Rates
              </a>
            )}
            <button
              onClick={() => {
                const detail = `
Bank: ${result.row.bank}
Product: ${PRODUCTS.find(p => p.key === result.row.product)?.label}
Interest Rate: ${interestRate?.toFixed(2)}%
Effective Rate: ${effectiveRate?.toFixed(2)}%
Upfront Costs: LKR ${lkr(result.upfront || 0)}
Monthly Payment: LKR ${lkr((() => {
  const P = amount || 0;
  const rt = (interestRate || 0) / 100 / 12;
  const n = tenureYears * 12;
  if (rt === 0) return P / n;
  return (P * rt * Math.pow(1 + rt, n)) / (Math.pow(1 + rt, n) - 1);
})())}
                `.trim();
                navigator.clipboard.writeText(detail);
              }}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-sm font-medium"
            >
              📋 Copy Details
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Hero Section */}
      <div className="rounded-2xl p-6 border border-white/10" style={{ 
        background: `linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeSoft} 100%)` 
      }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl">🏦</div>
          <div>
            <h2 className="text-2xl font-bold text-white">Loan Comparison Advisor</h2>
            <p className="text-white/80 text-sm">Find the best loan option tailored to your needs</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-white/70">✓ Compare 13+ Banks</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-white/70">✓ Real-time Interest Rates</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-white/70">✓ Upfront Cost Estimation</div>
          </div>
        </div>
      </div>

      {/* Smart Scenario Presets */}
      <div className="rounded-xl p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              ⚡ Quick Start Scenarios
            </h3>
            <p className="text-sm text-white/70">Choose a preset to auto-fill common scenarios</p>
          </div>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
          >
            {showPresets ? 'Hide' : 'Show'} Presets
          </button>
        </div>
        
        {showPresets && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* First Home Buyer */}
            <button
              onClick={() => {
                setProduct("HL");
                setAmount(8000000);
                setTenureYears(25);
                setPropertyValue(10000000);
                setIsFirstHome("yes");
                setSalaryLevel("none");
                setTakeCreditCard("no");
                setUseInternetBanking("yes");
                setIncludeTariffs(true);
                setIsCondo("no");
                setIsConstruction("no");
                setIsProfessional("no");
                setCustomerCategory("None");
              }}
              className="p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
            >
              <div className="text-2xl mb-2">🏡</div>
              <div className="font-semibold mb-1">First Home Buyer</div>
              <div className="text-xs text-white/70">
                8M home loan • 25 years • First home benefits
              </div>
            </button>

            {/* Professional */}
            <button
              onClick={() => {
                setProduct("PL");
                setAmount(2000000);
                setTenureYears(5);
                setMonthlyNetSalary(200000);
                setIsProfessional("yes");
                setSalaryLevel("assignment");
                setTakeCreditCard("yes");
                setUseInternetBanking("yes");
                setIncludeTariffs(true);
                setPlSecurity("secured");
                setCustomerCategory("None");
              }}
              className="p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
            >
              <div className="text-2xl mb-2">👨‍💼</div>
              <div className="font-semibold mb-1">Professional</div>
              <div className="text-xs text-white/70">
                2M personal loan • Professional rates • Credit card
              </div>
            </button>

            {/* Student/Education */}
            <button
              onClick={() => {
                setProduct("EDU");
                setAmount(3000000);
                setTenureYears(10);
                setMonthlyNetSalary(50000);
                setEduSecurity("secured");
                setEduLocale("local");
                setSalaryLevel("none");
                setTakeCreditCard("no");
                setUseInternetBanking("yes");
                setIncludeTariffs(true);
                setIsProfessional("no");
                setCustomerCategory("None");
              }}
              className="p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
            >
              <div className="text-2xl mb-2">🎓</div>
              <div className="font-semibold mb-1">Student</div>
              <div className="text-xs text-white/70">
                3M education loan • Local study • Secured
              </div>
            </button>

            {/* Investment Property */}
            <button
              onClick={() => {
                setProduct("LAP");
                setAmount(15000000);
                setTenureYears(20);
                setPropertyValue(20000000);
                setMonthlyNetSalary(400000);
                setSalaryLevel("assignment");
                setTakeCreditCard("yes");
                setUseInternetBanking("yes");
                setIncludeTariffs(true);
                setIsCondo("yes");
                setIsConstruction("no");
                setIsProfessional("yes");
                setCustomerCategory("VIP");
              }}
              className="p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
            >
              <div className="text-2xl mb-2">🏢</div>
              <div className="font-semibold mb-1">Investment Property</div>
              <div className="text-xs text-white/70">
                15M LAP • VIP customer • Professional benefits
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Saved Comparisons */}
      {(() => {
        const savedComparisons = JSON.parse(localStorage.getItem('loanComparisons') || '[]');
        return savedComparisons.length > 0 && (
          <div className="rounded-xl p-4 border border-white/10" style={{ backgroundColor: BRAND.card }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>⭐</span>
                <span>Saved Comparisons</span>
              </div>
              <Btn 
                className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                onClick={() => {
                  localStorage.removeItem('loanComparisons');
                  // Force re-render by updating a state
                  setResults([...results]);
                }}
              >
                Clear All
              </Btn>
            </div>
            <div className="grid gap-2 max-h-40 overflow-y-auto">
              {savedComparisons.slice(0, 5).map((bookmark: any, idx: number) => (
                <div 
                  key={bookmark.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => {
                    // Restore configuration
                    setProduct(bookmark.config.product);
                    setAmount(bookmark.config.amount);
                    setTenureYears(bookmark.config.tenureYears);
                    setPropertyValue(bookmark.config.propertyValue);
                    setMonthlyNetSalary(bookmark.config.monthlyNetSalary);
                    setSalaryLevel(bookmark.config.salaryLevel);
                    setIsFirstHome(bookmark.config.isFirstHome);
                    setTypePref(bookmark.config.typePref);
                    setDesiredFixedYears(bookmark.config.desiredFixedYears);
                  }}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {PRODUCTS.find(p => p.key === bookmark.config.product)?.label} - LKR {lkr(bookmark.config.amount)}
                    </div>
                    <div className="text-xs text-white/60">
                      {bookmark.config.tenureYears}y • {new Date(bookmark.date).toLocaleDateString()} • 
                      Best: {bookmark.results[0]?.bank} @ {bookmark.results[0]?.rate?.toFixed(2)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">📊 Load</span>
                    <Btn 
                      className="text-xs text-red-400 hover:text-red-300 p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = savedComparisons.filter((item: any) => item.id !== bookmark.id);
                        localStorage.setItem('loanComparisons', JSON.stringify(updated));
                        setResults([...results]); // Force re-render
                      }}
                    >
                      ✕
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
            {savedComparisons.length > 5 && (
              <div className="text-xs text-white/50 text-center mt-2">
                Showing 5 of {savedComparisons.length} saved comparisons
              </div>
            )}
          </div>
        );
      })()}

      {/* Input sections with improved organization */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl p-4 border border-white/10" style={{ backgroundColor: BRAND.card }}>
          <div className="text-sm mb-2 font-semibold flex items-center gap-2">
            <span>📊</span>
            <span>Product Selection</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRODUCTS.map((p) => (
              <Btn key={p.key}
                className={`px-3 py-1.5 rounded-full ${product === p.key ? "bg-[#3b82f6] text-white" : "bg-white/10"}`}
                onClick={() => setProduct(p.key)}
              >{p.label}</Btn>
            ))}
          </div>
          {bankOptions.length > 0 && (
            <div className="mt-4">
              <div className="text-sm mb-1 flex items-center gap-2">
                <span>Bank (optional)</span>
                {bankFilter && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                    Filtered
                  </span>
                )}
              </div>
              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  colorScheme: 'dark'
                }}
              >
                <option value="" style={{ backgroundColor: '#1f2937', color: 'white' }}>All banks</option>
                {bankOptions.map((bank) => (
                  <option key={bank} value={bank} style={{ backgroundColor: '#1f2937', color: 'white' }}>{bank}</option>
                ))}
              </select>
              {bankFilter && (
                <div className="text-xs text-white/60 mt-1">
                  💡 Showing results from {bankFilter} only
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl p-4 border border-white/10" style={{ backgroundColor: BRAND.card }}>
          <div className="text-sm mb-3 font-semibold flex items-center gap-2">
            <span>💰</span>
            <span>Loan Details</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1 flex items-center justify-between">
                <span>Loan amount (LKR)</span>
                {amount && amount > 0 && (
                  <span className="text-xs text-green-400">✓</span>
                )}
              </div>
              <MoneyInput value={amount} onChange={setAmount} placeholder="0.00" />
              {(() => {
                if (!amount || amount <= 0) {
                  return <div className="text-xs text-red-400 mt-1">❌ Loan amount is required</div>;
                } else if (amount < 500_000) {
                  return <div className="text-xs text-red-400 mt-1">❌ Amount too low - min. typically 500K</div>;
                } else if (amount < 1_000_000) {
                  return <div className="text-xs text-yellow-400 mt-1">⚠️ Low amount - min. typically 1M</div>;
                } else if (amount > 100_000_000) {
                  return <div className="text-xs text-yellow-400 mt-1">⚠️ Very high amount - may limit options</div>;
                } else if (product === "PL" && amount > 10_000_000) {
                  return <div className="text-xs text-yellow-400 mt-1">⚠️ High for PL - max typically 10M</div>;
                } else if (product === "EDU" && amount > 15_000_000) {
                  return <div className="text-xs text-yellow-400 mt-1">⚠️ High for education - max typically 15M</div>;
                }
                return <div className="text-xs text-green-400 mt-1">✓ Good amount range</div>;
              })()}
            </div>
            <div>
              <div className="text-sm mb-1 flex items-center justify-between">
                <span>Tenure (years)</span>
                {tenureYears > 0 && tenureYears <= 30 && (
                  <span className="text-xs text-green-400">✓</span>
                )}
              </div>
              <input inputMode="numeric" value={tenureYears}
                onChange={(e) => setTenureYears(parseInt(e.target.value || "0", 10))}
                className="w-full px-3 py-2 rounded bg-white/10 outline-none" />
              {(() => {
                if (tenureYears <= 0) {
                  return <div className="text-xs text-red-400 mt-1">❌ Tenure is required</div>;
                } else if (tenureYears < 1) {
                  return <div className="text-xs text-red-400 mt-1">❌ Min. tenure is 1 year</div>;
                } else if (product === "PL" && tenureYears > 8) {
                  return <div className="text-xs text-yellow-400 mt-1">⚠️ Max. PL tenure typically 8y</div>;
                } else if (product === "EDU" && tenureYears > 15) {
                  return <div className="text-xs text-yellow-400 mt-1">⚠️ Max. education tenure typically 15y</div>;
                } else if (tenureYears > 30) {
                  return <div className="text-xs text-yellow-400 mt-1">⚠️ Max. tenure typically 30y</div>;
                } else if (tenureYears >= 25) {
                  return <div className="text-xs text-blue-400 mt-1">💡 Long tenure = lower EMI, higher interest</div>;
                }
                return <div className="text-xs text-green-400 mt-1">✓ Good tenure range</div>;
              })()}
            </div>
            <div>
              <div className="text-sm mb-1 flex items-center justify-between">
                <span>Monthly net salary (LKR)</span>
                {monthlyNetSalary && monthlyNetSalary > 0 && (
                  <span className="text-xs text-green-400">✓</span>
                )}
              </div>
              <MoneyInput value={monthlyNetSalary} onChange={setMonthlyNetSalary} placeholder="0.00" />
              {(() => {
                if (!monthlyNetSalary || monthlyNetSalary <= 0) {
                  return <div className="text-xs text-yellow-400 mt-1">💡 Salary required for affordability analysis</div>;
                } else if (amount && tenureYears && monthlyNetSalary > 0) {
                  const monthlyPayment = (amount * (0.12/12) * Math.pow(1 + 0.12/12, tenureYears * 12)) / (Math.pow(1 + 0.12/12, tenureYears * 12) - 1);
                  const dsr = (monthlyPayment / monthlyNetSalary) * 100;
                  
                  if (dsr <= 30) {
                    return <div className="text-xs text-green-400 mt-1">✓ Excellent DSR: {dsr.toFixed(2)}% - Strong approval chances</div>;
                  } else if (dsr <= 40) {
                    return <div className="text-xs text-blue-400 mt-1">💡 Good DSR: {dsr.toFixed(2)}% - Good approval chances</div>;
                  } else if (dsr <= 60) {
                    return <div className="text-xs text-yellow-400 mt-1">⚠️ Moderate DSR: {dsr.toFixed(2)}% - Consider lower amount</div>;
                  } else {
                    return <div className="text-xs text-red-400 mt-1">❌ High DSR: {dsr.toFixed(2)}% - Likely rejection</div>;
                  }
                }
                
                const productTips = {
                  HL: "Housing loans typically require 4-6x annual salary",
                  PL: "Personal loans usually require 3-4x annual salary", 
                  LAP: "Loan against property requires stable salary history",
                  EL: "Education loans may have flexible salary requirements"
                };
                
                return <div className="text-xs text-white/60 mt-1">💡 {productTips[product as keyof typeof productTips] || "Gross monthly salary for DBR calculations"}</div>;
              })()}
            </div>
            {(product === "HL" || product === "LAP") && (
              <div>
                <div className="text-sm mb-1 flex items-center justify-between">
                  <span>Property value (LKR)</span>
                  {propertyValue && propertyValue > 0 && amount && propertyValue >= amount && (
                    <span className="text-xs text-green-400">✓</span>
                  )}
                </div>
                <MoneyInput value={propertyValue} onChange={setPropertyValue} placeholder="0.00" />
                {(() => {
                  if (!propertyValue || propertyValue <= 0) {
                    return <div className="text-xs text-yellow-400 mt-1">💡 Property value helps calculate accurate fees</div>;
                  } else if (amount && propertyValue < amount) {
                    const ltv = ((amount / propertyValue) * 100).toFixed(1);
                    return <div className="text-xs text-red-400 mt-1">❌ Property value must be ≥ loan amount (LTV: {ltv}%)</div>;
                  } else if (amount && propertyValue > 0) {
                    const ltv = ((amount / propertyValue) * 100).toFixed(1);
                    if (parseFloat(ltv) <= 70) {
                      return <div className="text-xs text-green-400 mt-1">✓ Good LTV: {ltv}% - Best rates available</div>;
                    } else if (parseFloat(ltv) <= 80) {
                      return <div className="text-xs text-blue-400 mt-1">💡 Moderate LTV: {ltv}% - Good rates</div>;
                    } else if (parseFloat(ltv) <= 90) {
                      return <div className="text-xs text-yellow-400 mt-1">⚠️ High LTV: {ltv}% - Limited options</div>;
                    } else {
                      return <div className="text-xs text-red-400 mt-1">❌ Very high LTV: {ltv}% - Few options</div>;
                    }
                  }
                  return <div className="text-xs text-white/60 mt-1">Used for LTV calculation & fee estimation</div>;
                })()}
              </div>
            )}
            {product === "PL" && (
              <div className="col-span-2">
                <div className="text-sm mb-1">Loan security</div>
                <div className="flex gap-2">
                  <Btn
                    className={`px-3 py-1.5 rounded-full ${
                      plSecurity === "secured" ? "bg-[#3b82f6] text-white" : "bg-white/10"
                    }`}
                    onClick={() => setPlSecurity("secured")}
                  >
                    Secured
                  </Btn>
                  <Btn
                    className={`px-3 py-1.5 rounded-full ${
                      plSecurity === "unsecured" ? "bg-[#3b82f6] text-white" : "bg-white/10"
                    }`}
                    onClick={() => setPlSecurity("unsecured")}
                  >
                    Unsecured
                  </Btn>
                </div>
                <div className="text-xs text-white/70 mt-1">
                  We infer this using scraper notes (e.g., collateral, property mortgage, or unsecured wording).
                </div>
              </div>
            )}
            {product === "EDU" && (
              <>
                <div className="col-span-2">
                  <div className="text-sm mb-1">Loan security</div>
                  <div className="flex gap-2">
                    <Btn
                      className={`px-3 py-1.5 rounded-full ${
                        eduSecurity === "secured" ? "bg-[#3b82f6] text-white" : "bg-white/10"
                      }`}
                      onClick={() => setEduSecurity("secured")}
                    >
                      Secured
                    </Btn>
                    <Btn
                      className={`px-3 py-1.5 rounded-full ${
                        eduSecurity === "unsecured" ? "bg-[#3b82f6] text-white" : "bg-white/10"
                      }`}
                      onClick={() => setEduSecurity("unsecured")}
                    >
                      Unsecured
                    </Btn>
                  </div>
                  <div className="text-xs text-white/70 mt-1">
                    We infer this using scraper notes (e.g., collateral, property mortgage, or unsecured wording).
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-sm mb-1">Education location</div>
                  <div className="flex gap-2">
                    <Btn
                      className={`px-3 py-1.5 rounded-full ${
                        eduLocale === "local" ? "bg-[#3b82f6] text-white" : "bg-white/10"
                      }`}
                      onClick={() => setEduLocale("local")}
                    >
                      Local Education
                    </Btn>
                    <Btn
                      className={`px-3 py-1.5 rounded-full ${
                        eduLocale === "foreign" ? "bg-[#3b82f6] text-white" : "bg-white/10"
                      }`}
                      onClick={() => setEduLocale("foreign")}
                    >
                      Foreign Education
                    </Btn>
                  </div>
                  <div className="text-xs text-white/70 mt-1">
                    We look for foreign/overseas cues versus local/domestic cues in the scraped data.
                  </div>
                </div>
              </>
            )}
            {/* NEW: Include tariffs toggle */}
            <div className="col-span-2 mt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeTariffs} onChange={(e) => setIncludeTariffs(e.target.checked)} />
                <span className="text-sm">Include tariffs (upfront est.)</span>
              </label>
            </div>

            {/* Property value (removed by request) */}
          </div>
        </div>

        <div className="rounded-xl p-4 border border-white/10" style={{ backgroundColor: BRAND.card }}>
          <div className="text-sm mb-3 font-semibold flex items-center gap-2">
            <span>⚙️</span>
            <span>Preferences & Requirements</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1">Rate type</div>
              <select value={typePref} onChange={(e) => setTypePref(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{
                  colorScheme: 'dark'
                }}>
                <option value="any" style={{ backgroundColor: '#1f2937', color: 'white' }}>Any</option>
                <option value="fixed" style={{ backgroundColor: '#1f2937', color: 'white' }}>Fixed</option>
                <option value="floating" style={{ backgroundColor: '#1f2937', color: 'white' }}>Floating</option>
              </select>
            </div>
            {showFixedYears && (
              <div>
                <div className="text-sm mb-1">Desired fixed period (years)</div>
                <input inputMode="numeric" value={desiredFixedYears}
                  onChange={(e) => setDesiredFixedYears(e.target.value ? parseInt(e.target.value, 10) : "")}
                  className="w-full px-3 py-2 rounded bg-white/10 outline-none" />
              </div>
            )}

            {/* Tariff Scenario Options for HL/LAP */}
            {(product === "HL" || product === "LAP") && (
              <>
                <div className="col-span-2 mb-2">
                  <div className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1">
                    <span>📋</span>
                    <span>Property & Loan Scenario</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <Toggle
                    label="Condominium / Tripartite?"
                    value={isCondo}
                    onChange={setIsCondo}
                    helpText="Property is a condominium or involves tripartite agreement"
                    icon="🏢"
                  />
                </div>
                <div className="col-span-2">
                  <Toggle
                    label="Construction / Staged disbursement?"
                    value={isConstruction}
                    onChange={setIsConstruction}
                    helpText="Loan will be disbursed in stages during construction"
                    icon="🏗️"
                  />
                </div>
                <div className="col-span-2">
                  <Toggle
                    label="Employed abroad?"
                    value={employedAbroad}
                    onChange={setEmployedAbroad}
                    helpText="Sri Lankan employed abroad (affects processing fee calculation)"
                    icon="✈️"
                  />
                </div>
                <div className="col-span-2 mb-2">
                  <div className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                    <span>⚙️</span>
                    <span>Banking Preferences</span>
                  </div>
                </div>
              </>
            )}

            {/* Credit Card & Internet Banking - Applicable for ALL products */}
            <div className="col-span-2">
              <Toggle
                label="Take a Credit Card with the loan?"
                value={takeCreditCard}
                onChange={setTakeCreditCard}
                helpText="Optional add-on with your loan"
                icon="💳"
              />
            </div>
            <div className="col-span-2">
              <Toggle
                label="Use Internet/Online Banking"
                value={useInternetBanking}
                onChange={setUseInternetBanking}
                helpText="Required for online access and e-statements"
                icon="💻"
              />
            </div>

            {product === "HL" && (
              <>
                <div className="col-span-2">
                  <Toggle
                    label="First Home Purchase"
                    value={isFirstHome}
                    onChange={setIsFirstHome}
                    helpText="May qualify for special rates"
                    icon="🏡"
                  />
                </div>
              </>
            )}

            <div className="col-span-2">
              <div className="text-sm mb-1">Salary relationship with the bank</div>
              <div className="flex gap-2">
                <Btn className={`px-3 py-1.5 rounded-full ${salaryLevel === "none" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setSalaryLevel("none")}>None</Btn>
                <Btn className={`px-3 py-1.5 rounded-full ${salaryLevel === "remittance" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setSalaryLevel("remittance")}>Remittance</Btn>
                <Btn className={`px-3 py-1.5 rounded-full ${salaryLevel === "assignment" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setSalaryLevel("assignment")}>Assignment</Btn>
              </div>
              <div className="text-xs text-white/70 mt-1">
                Selecting Assignment will still qualify for Remittance-only offers.
              </div>
            </div>

            {/* Internet Banking toggle moved above under Credit Card */}

            {/* Advanced Options Collapsible Section */}
            <div className="col-span-2">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-2 rounded-lg bg-white/10 text-white/80 font-semibold mb-2"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <span className="flex items-center gap-2">⚡ Advanced Options</span>
                <span>{showAdvanced ? "▲" : "▼"}</span>
              </button>
              {showAdvanced && (
                <div className="space-y-4">
                  {/* Customer Category (VIP/None) */}
                  <div>
                    <div className="text-sm mb-1">Customer Category</div>
                    <div className="flex gap-2">
                      <Btn className={`px-3 py-1.5 rounded-full ${customerCategory === "None" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setCustomerCategory("None")}>None</Btn>
                      <Btn className={`px-3 py-1.5 rounded-full ${customerCategory === "VIP" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setCustomerCategory("VIP")}>VIP</Btn>
                    </div>
                    <div className="text-xs text-white/70 mt-1">
                      VIP covers Private, Platinum, Pinnacle, Priority, Elite, Privileged, Premier.
                    </div>
                  </div>
                  {/* Working for a Premium Company */}
                  <div>
                    <div className="text-sm mb-1">Working for a Premium Company?</div>
                    <div className="flex gap-2">
                      <Btn className={`px-3 py-1.5 rounded-full ${isPremiumCompany === "yes" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsPremiumCompany("yes")}>Yes</Btn>
                      <Btn className={`px-3 py-1.5 rounded-full ${isPremiumCompany === "no" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsPremiumCompany("no")}>No</Btn>
                    </div>
                    <div className="text-xs text-white/70 mt-1">
                      Select "Yes" if employed by a premium/listed company. Used with "Professional" status for Seylan Tier 1/2 rates.
                    </div>
                  </div>
                  {/* Express Processing */}
                  <div>
                    <div className="text-sm mb-1">Express Processing</div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={expressProcessing} onChange={(e) => setExpressProcessing(e.target.checked)} />
                      <span>Enable express (if available)</span>
                    </label>
                    <div className="text-xs text-white/70 mt-1">
                      If a bank encodes express as a rate track, this will reveal it. If it’s a fee only, it’ll be included in Processing (when supported).
                    </div>
                  </div>
                  {/* NSB Express Days - Only show when NSB is selected and express processing is enabled */}
                  {expressProcessing && bankFilter.toLowerCase().includes("nsb") && (
                    <div>
                      <div className="text-sm mb-1">NSB Express Service Days</div>
                      <div className="flex gap-2">
                        <Btn 
                          className={`px-3 py-1.5 rounded-full ${nsbExpressDays === 4 ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} 
                          onClick={() => setNsbExpressDays(4)}
                        >
                          4 days (LKR 50,000)
                        </Btn>
                        <Btn 
                          className={`px-3 py-1.5 rounded-full ${nsbExpressDays === 10 ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} 
                          onClick={() => setNsbExpressDays(10)}
                        >
                          10 days (LKR 20,000)
                        </Btn>
                      </div>
                      <div className="text-xs text-white/70 mt-1">
                        Choose NSB express processing timeframe. 4 days costs more but provides faster service.
                      </div>
                    </div>
                  )}
                  {/* Professional */}
                  <div>
                    <div className="text-sm mb-1">Are you a Professional?</div>
                    <div className="flex gap-2">
                      <Btn className={`px-3 py-1.5 rounded-full ${isProfessional === "yes" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsProfessional("yes")}>Yes</Btn>
                      <Btn className={`px-3 py-1.5 rounded-full ${isProfessional === "no" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsProfessional("no")}>No</Btn>
                    </div>
                    <div className="text-xs text-white/70 mt-1">
                      Includes Engineers, Doctors, Accountants, Architects, Pilots, Lecturers, Professors, MBA/CIMA/CIM/ACCA/Chartered and similar segments.
                    </div>
                  </div>
                  {/* Banker */}
                  <div>
                    <div className="text-sm mb-1">Are you a Banker?</div>
                    <div className="flex gap-2">
                      <Btn className={`px-3 py-1.5 rounded-full ${isBanker === "yes" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsBanker("yes")}>Yes</Btn>
                      <Btn className={`px-3 py-1.5 rounded-full ${isBanker === "no" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsBanker("no")}>No</Btn>
                    </div>
                    <div className="text-xs text-white/70 mt-1">
                      Select “Yes” for bank staff or banker-only packages.
                    </div>
                  </div>
                  {/* Teacher */}
                  <div>
                    <div className="text-sm mb-1">Are you a Teacher?</div>
                    <div className="flex gap-2">
                      <Btn className={`px-3 py-1.5 rounded-full ${isTeacher === "yes" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsTeacher("yes")}>Yes</Btn>
                      <Btn className={`px-3 py-1.5 rounded-full ${isTeacher === "no" ? "bg-[#3b82f6] text-white" : "bg-white/10"}`} onClick={() => setIsTeacher("no")}>No</Btn>
                    </div>
                    <div className="text-xs text-white/70 mt-1">
                      Applies to teacher, teaching staff, principals, and similar education-focused schemes.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Generate Button with Validation */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-xl border border-white/10" style={{ backgroundColor: BRAND.card }}>
        <div className="flex-1">
          <div className="text-sm font-medium mb-1">Ready to compare?</div>
          <div className="text-xs text-white/70">
            {(() => {
              const issues: string[] = [];
              if (!amount || amount <= 0) issues.push("Enter loan amount");
              if (!tenureYears || tenureYears <= 0) issues.push("Enter tenure");
              
              if (issues.length === 0) {
                return "✓ All required fields completed";
              }
              return `⚠️ ${issues.join(", ")}`;
            })()}
          </div>
        </div>
        
        <div className="flex gap-2">
          {results.length > 0 && (
            <Btn 
              className="px-4 py-2 rounded-lg bg-white/10 text-sm"
              onClick={() => setResults([])}
            >
              Clear Results
            </Btn>
          )}
          <Btn 
            className={`px-6 py-2 rounded-lg font-medium ${
              (!amount || amount <= 0 || !tenureYears || tenureYears <= 0)
                ? 'bg-white/10 cursor-not-allowed opacity-50'
                : 'bg-[#3b82f6] text-white shadow-lg'
            }`}
            onClick={onGenerate}
            disabled={!amount || amount <= 0 || !tenureYears || tenureYears <= 0}
          >
            🔍 Generate Comparison
          </Btn>
        </div>
      </div>

      {/* Comparison Guide Section */}
      {!results.length && (
        <div className="mt-6 rounded-xl p-6 border border-white/10" style={{ backgroundColor: BRAND.card }}>
          <div className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>📋</span>
            <span>How We Compare Loans</span>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-semibold mb-3 text-blue-400">📊 What We Analyze</h4>
              <div className="space-y-2 text-sm text-white/80">
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Interest Rates:</strong> Real-time rates from all major banks</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Total Cost:</strong> EMI + processing fees + other charges</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Effective Rate:</strong> True cost including all fees</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Eligibility:</strong> Salary, age & other requirements</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold mb-3 text-blue-400">🎯 Smart Filtering</h4>
              <div className="space-y-2 text-sm text-white/80">
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Auto-matching:</strong> Only shows loans you qualify for</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Salary bands:</strong> Filters by income requirements</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Loan limits:</strong> Respects min/max loan amounts</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span>
                  <span><strong>Special offers:</strong> Professional, banker discounts</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/70">
                💡 <strong>Pro Tip:</strong> Use the presets above for quick setup, or customize all details for precise matching
              </div>
              <div className="text-xs text-white/50">
                Data updated: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-6 space-y-4">
        {!results.length ? (
          <div className="rounded-xl p-8 text-center border border-white/10" style={{ backgroundColor: BRAND.card }}>
            <div className="text-5xl mb-3">🔍</div>
            <div className="text-lg font-semibold mb-2">Ready to Compare</div>
            <div className="text-white/70">
              Fill in your details above and click <span className="font-semibold text-white">Generate</span> to find the best loan options tailored to your needs.
            </div>
          </div>
        ) : (
          <>
            {/* Comparison Summary Header */}
            <div className="rounded-xl p-5 border border-white/10" style={{ backgroundColor: BRAND.card }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-lg font-semibold">Comparison Summary</div>
                  <div className="text-sm text-white/70">Based on your criteria</div>
                </div>
                
                {/* Save & Share Features */}
                <div className="flex items-center gap-2">
                  {/* Bookmark Comparison */}
                  <Btn 
                    className="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-300 text-sm border border-yellow-400/30 hover:bg-yellow-500/30 transition-colors"
                    onClick={() => {
                      const bookmark = {
                        id: Date.now(),
                        date: new Date().toISOString(),
                        config: {
                          product,
                          amount,
                          tenureYears,
                          propertyValue,
                          monthlyNetSalary,
                          salaryLevel,
                          isFirstHome,
                          typePref,
                          desiredFixedYears
                        },
                        results: results.slice(0, 3).map(r => ({
                          bank: r.row.bank,
                          rate: resolveInterestRate(r),
                          emi: r.emi,
                          upfront: r.upfront
                        }))
                      };
                      
                      const saved = JSON.parse(localStorage.getItem('loanComparisons') || '[]');
                      saved.unshift(bookmark);
                      localStorage.setItem('loanComparisons', JSON.stringify(saved.slice(0, 10))); // Keep only 10 most recent
                      
                      // Visual feedback
                      const btn = document.activeElement as HTMLButtonElement;
                      const originalText = btn.textContent;
                      btn.textContent = '✅ Saved!';
                      setTimeout(() => { btn.textContent = originalText; }, 2000);
                    }}
                  >
                    ⭐ Bookmark
                  </Btn>

                  {/* Share Link */}
                  <Btn 
                    className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-300 text-sm border border-blue-400/30 hover:bg-blue-500/30 transition-colors"
                    onClick={() => {
                      const shareParams = new URLSearchParams({
                        product,
                        amount: String(amount || 0),
                        tenure: String(tenureYears),
                        ...(propertyValue && { propertyValue: String(propertyValue) }),
                        ...(monthlyNetSalary && { salary: String(monthlyNetSalary) }),
                        ...(salaryLevel !== 'none' && { salaryLevel }),
                        ...(isFirstHome === 'yes' && { firstHome: 'true' }),
                        ...(typePref !== 'any' && { rateType: typePref })
                      });
                      
                      const shareUrl = `${window.location.origin}${window.location.pathname}?${shareParams.toString()}`;
                      navigator.clipboard.writeText(shareUrl);
                      
                      // Visual feedback
                      const btn = document.activeElement as HTMLButtonElement;
                      const originalText = btn.textContent;
                      btn.textContent = '📋 Copied!';
                      setTimeout(() => { btn.textContent = originalText; }, 2000);
                    }}
                  >
                    🔗 Share Link
                  </Btn>

                  {/* Export to PDF/CSV */}
                  <Btn 
                    className="px-3 py-2 rounded-lg bg-green-500/20 text-green-300 text-sm border border-green-400/30 hover:bg-green-500/30 transition-colors"
                    onClick={() => {
                      const csvContent = [
                        'Bank,Interest Rate (%),Monthly EMI (LKR),Upfront Cost (LKR),Effective Rate (%)',
                        ...results.map(r => {
                          const rate = resolveInterestRate(r) || 0;
                          const eff = resolveEffectiveRate(r) || 0;
                          return `${r.row.bank},${rate.toFixed(2)},${r.emi || 0},${r.upfront || 0},${eff.toFixed(2)}`;
                        })
                      ].join('\n');
                      
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `loan-comparison-${new Date().toISOString().split('T')[0]}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                  >
                    📊 Export CSV
                  </Btn>

                  {/* Copy Summary (Enhanced) */}
                  <Btn 
                    className="px-3 py-2 rounded-lg bg-white/10 text-sm hover:bg-white/20 transition-colors"
                    onClick={() => {
                      const summary = [
                        `🏦 Loan Comparison Summary - ${new Date().toLocaleDateString()}`,
                        `💰 Loan Amount: LKR ${formatMoney(amount || 0)}`,
                        `📅 Tenure: ${tenureYears} years`,
                        `🏠 Product: ${PRODUCTS.find(p => p.key === product)?.label}`,
                        '',
                        '📊 Top Options:',
                        ...results.slice(0, 5).map((r, idx) => {
                          const rate = resolveInterestRate(r);
                          const eff = resolveEffectiveRate(r);
                          return `${idx + 1}. ${r.row.bank} - ${rate?.toFixed(2)}% interest, LKR ${lkr(r.emi || 0)}/month (Effective: ${eff?.toFixed(2)}%)`;
                        }),
                        '',
                        '💡 Generated via Union Bank Rate Comparison Tool'
                      ].join('\n');
                      
                      navigator.clipboard.writeText(summary);
                      
                      // Visual feedback
                      const btn = document.activeElement as HTMLButtonElement;
                      const originalText = btn.textContent;
                      btn.textContent = '✅ Copied!';
                      setTimeout(() => { btn.textContent = originalText; }, 2000);
                    }}
                  >
                    📋 Copy Summary
                  </Btn>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-white/60">Loan Amount</div>
                  <div className="font-medium">LKR {formatMoney(amount || 0)}</div>
                </div>
                <div>
                  <div className="text-white/60">Tenure</div>
                  <div className="font-medium">{tenureYears} years</div>
                </div>
                <div>
                  <div className="text-white/60">Product</div>
                  <div className="font-medium">{PRODUCTS.find(p => p.key === product)?.label}</div>
                </div>
                <div>
                  <div className="text-white/60">Options Found</div>
                  <div className="font-medium">{results.length} {hasBankFilter ? '(filtered)' : 'best matches'}</div>
                </div>
              </div>
            </div>

            {/* Best Deal Highlight */}
            {results.length > 0 && (
              <div className="rounded-xl p-1 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/40">
                <div className="rounded-lg p-4" style={{ backgroundColor: BRAND.card }}>
                  <div className="flex items-center gap-2 text-green-400 text-sm font-semibold mb-1">
                    ⭐ Best Overall Deal
                  </div>
                  <div className="text-white/80 text-xs">
                    {results[0].row.bank} offers the lowest rate at {resolveInterestRate(results[0])?.toFixed(2)}%
                    {includeTariffs && ` with estimated upfront costs of LKR ${lkr(results[0].upfront || 0)}`}
                  </div>
                </div>
              </div>
            )}

            {/* Visual Comparison Tools */}
            {results.length > 1 && (
              <div className="rounded-xl p-5 border border-white/10" style={{ backgroundColor: BRAND.card }}>
                <div className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>📊</span>
                  <span>Visual Comparison</span>
                </div>

                {/* Interest Rate Bar Chart */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-blue-400">Interest Rates</h4>
                  <div className="space-y-2">
                    {results.slice(0, 5).map((r, idx) => {
                      const rate = resolveInterestRate(r);
                      const maxRate = Math.max(...results.map(res => resolveInterestRate(res) || 0));
                      const widthPercent = rate ? (rate / maxRate) * 100 : 0;
                      const isLowest = idx === 0;
                      
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="w-20 text-xs font-medium truncate">{r.row.bank}</div>
                          <div className="flex-1 bg-white/10 rounded-full h-6 relative overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                isLowest ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-blue-500 to-blue-600'
                              }`}
                              style={{ width: `${widthPercent}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                              {rate?.toFixed(2)}%
                            </div>
                          </div>
                          {isLowest && <span className="text-green-400 text-xs">⭐ Best</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Total Cost Comparison */}
                {includeTariffs && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold mb-3 text-blue-400">Total Cost (EMI + Upfront)</h4>
                    <div className="space-y-2">
                      {results.slice(0, 5).map((r, idx) => {
                        const emi = r.emi || 0;
                        const upfront = r.upfront || 0;
                        const totalCost = (emi * (tenureYears * 12)) + upfront;
                        const maxCost = Math.max(...results.map(res => ((res.emi || 0) * (tenureYears * 12)) + (res.upfront || 0)));
                        const widthPercent = maxCost > 0 ? (totalCost / maxCost) * 100 : 0;
                        const isLowest = results.every(other => totalCost <= (((other.emi || 0) * (tenureYears * 12)) + (other.upfront || 0)));
                        
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <div className="w-20 text-xs font-medium truncate">{r.row.bank}</div>
                            <div className="flex-1 bg-white/10 rounded-full h-6 relative overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-500 ${
                                  isLowest ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-orange-500 to-red-500'
                                }`}
                                style={{ width: `${widthPercent}%` }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                                LKR {lkr(totalCost)}
                              </div>
                            </div>
                            {isLowest && <span className="text-green-400 text-xs">💰 Cheapest</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* EMI Comparison Calculator */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-blue-400">Monthly Payment (EMI)</h4>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.slice(0, 6).map((r, idx) => {
                      const emi = r.emi || 0;
                      const isLowest = results.every(other => emi <= (other.emi || 0));
                      
                      return (
                        <div key={idx} className={`p-3 rounded-lg border ${
                          isLowest ? 'border-green-400/40 bg-green-500/10' : 'border-white/10 bg-white/5'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{r.row.bank}</span>
                            {isLowest && <span className="text-green-400 text-xs">💳 Lowest EMI</span>}
                          </div>
                          <div className="text-lg font-bold">LKR {lkr(emi)}</div>
                          <div className="text-xs text-white/60">per month</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Savings Calculator */}
                {results.length > 1 && (
                  <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg p-4 border border-purple-400/20">
                    <h4 className="text-sm font-semibold mb-3 text-purple-300 flex items-center gap-2">
                      <span>💎</span>
                      <span>Potential Savings</span>
                    </h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      {(() => {
                        const bestResult = results[0];
                        const worstResult = results[results.length - 1];
                        
                        const bestTotal = ((bestResult.emi || 0) * (tenureYears * 12)) + (bestResult.upfront || 0);
                        const worstTotal = ((worstResult.emi || 0) * (tenureYears * 12)) + (worstResult.upfront || 0);
                        const totalSavings = worstTotal - bestTotal;
                        
                        const bestEMI = bestResult.emi || 0;
                        const worstEMI = worstResult.emi || 0;
                        const emiSavings = worstEMI - bestEMI;
                        
                        return (
                          <>
                            <div>
                              <div className="text-sm text-white/70 mb-1">By choosing {bestResult.row.bank} over {worstResult.row.bank}</div>
                              <div className="text-2xl font-bold text-green-400">
                                LKR {lkr(totalSavings)}
                              </div>
                              <div className="text-xs text-white/60">total savings over loan term</div>
                            </div>
                            <div>
                              <div className="text-sm text-white/70 mb-1">Monthly EMI difference</div>
                              <div className="text-2xl font-bold text-green-400">
                                LKR {lkr(emiSavings)}
                              </div>
                              <div className="text-xs text-white/60">lower monthly payment</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Affordability Analysis Tools */}
            {results.length > 0 && monthlyNetSalary && monthlyNetSalary > 0 && (
              <div className="rounded-xl p-5 border border-white/10" style={{ backgroundColor: BRAND.card }}>
                <div className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>🎯</span>
                  <span>Affordability Analysis</span>
                </div>

                {/* Payment Schedule Preview for Best Option */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-blue-400">Payment Schedule Preview - {results[0].row.bank}</h4>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(() => {
                      const bestEMI = results[0].emi || 0;
                      const principal = amount || 0;
                      const rate = (resolveInterestRate(results[0]) || 12) / 100 / 12;
                      const months = tenureYears * 12;
                      
                      // Payment breakdown for first payment
                      const interestComponent = principal * rate;
                      const principalComponent = bestEMI - interestComponent;
                      
                      // Total payments
                      const totalPayments = bestEMI * months;
                      const totalInterest = totalPayments - principal;
                      
                      return (
                        <>
                          <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-400/20">
                            <div className="text-xs text-blue-300 mb-1">Monthly Payment</div>
                            <div className="text-lg font-bold">LKR {lkr(bestEMI)}</div>
                            <div className="text-xs text-white/60">Fixed for {tenureYears} years</div>
                          </div>
                          <div className="bg-green-500/10 rounded-lg p-3 border border-green-400/20">
                            <div className="text-xs text-green-300 mb-1">Principal Component</div>
                            <div className="text-lg font-bold">LKR {lkr(principalComponent)}</div>
                            <div className="text-xs text-white/60">Month 1 breakdown</div>
                          </div>
                          <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-400/20">
                            <div className="text-xs text-orange-300 mb-1">Interest Component</div>
                            <div className="text-lg font-bold">LKR {lkr(interestComponent)}</div>
                            <div className="text-xs text-white/60">Month 1 breakdown</div>
                          </div>
                          <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-400/20">
                            <div className="text-xs text-purple-300 mb-1">Total Interest</div>
                            <div className="text-lg font-bold">LKR {lkr(totalInterest)}</div>
                            <div className="text-xs text-white/60">Over loan term</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Debt Service Ratio Analysis */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-blue-400">Debt Service Ratio (DSR) Analysis</h4>
                  <div className="space-y-3">
                    {results.slice(0, 3).map((r, idx) => {
                      const emi = r.emi || 0;
                      const dsr = (emi / monthlyNetSalary) * 100;
                      
                      let dsrStatus = 'excellent';
                      let dsrColor = 'text-green-400';
                      let dsrBg = 'bg-green-500/10';
                      let dsrBorder = 'border-green-400/20';
                      let dsrIcon = '✅';
                      
                      if (dsr > 60) {
                        dsrStatus = 'high risk';
                        dsrColor = 'text-red-400';
                        dsrBg = 'bg-red-500/10';
                        dsrBorder = 'border-red-400/20';
                        dsrIcon = '❌';
                      } else if (dsr > 40) {
                        dsrStatus = 'moderate risk';
                        dsrColor = 'text-yellow-400';
                        dsrBg = 'bg-yellow-500/10';
                        dsrBorder = 'border-yellow-400/20';
                        dsrIcon = '⚠️';
                      } else if (dsr > 30) {
                        dsrStatus = 'good';
                        dsrColor = 'text-blue-400';
                        dsrBg = 'bg-blue-500/10';
                        dsrBorder = 'border-blue-400/20';
                        dsrIcon = '💡';
                      }
                      
                      return (
                        <div key={idx} className={`rounded-lg p-4 ${dsrBg} border ${dsrBorder}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span>{dsrIcon}</span>
                              <span className="font-medium">{r.row.bank}</span>
                            </div>
                            <span className={`text-sm font-bold ${dsrColor}`}>
                              {dsr.toFixed(2)}% DSR
                            </span>
                          </div>
                          <div className="text-sm text-white/70">
                            Monthly commitment: LKR {lkr(emi)} ({dsrStatus} - Banks prefer ≤40% DSR)
                          </div>
                          <div className="mt-2 bg-white/10 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-500 ${
                                dsr <= 30 ? 'bg-green-500' : 
                                dsr <= 40 ? 'bg-blue-500' : 
                                dsr <= 60 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(dsr, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Affordability Stress Testing */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-blue-400">Stress Testing Scenarios</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    {(() => {
                      const bestEMI = results[0].emi || 0;
                      const scenarios = [
                        { name: "Interest Rate +2%", factor: 1.15, icon: "📈", desc: "If rates increase significantly" },
                        { name: "Income Reduction -20%", factor: 0.8, icon: "📉", desc: "Job change or salary cut" },
                        { name: "Economic Downturn", factor: 1.25, icon: "⚡", desc: "+25% higher costs & expenses" },
                        { name: "Emergency Reserve", factor: 0.7, icon: "🛡️", desc: "Keeping 30% for emergencies" }
                      ];
                      
                      return scenarios.map((scenario, idx) => {
                        const stressEMI = scenario.name.includes("Income") ? bestEMI : bestEMI * scenario.factor;
                        const stressSalary = scenario.name.includes("Income") ? monthlyNetSalary * scenario.factor : monthlyNetSalary;
                        const stressDSR = (stressEMI / stressSalary) * 100;
                        
                        const isAffordable = stressDSR <= 60;
                        
                        return (
                          <div key={idx} className={`rounded-lg p-3 border ${
                            isAffordable ? 'border-green-400/20 bg-green-500/5' : 'border-red-400/20 bg-red-500/5'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span>{scenario.icon}</span>
                              <span className="text-sm font-medium">{scenario.name}</span>
                            </div>
                            <div className="text-xs text-white/60 mb-2">{scenario.desc}</div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">DSR: {stressDSR.toFixed(2)}%</span>
                              <span className={`text-xs font-bold ${
                                isAffordable ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {isAffordable ? '✅ Manageable' : '❌ High Risk'}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Affordability Meter */}
                <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-lg p-4 border border-indigo-400/20">
                  <h4 className="text-sm font-semibold mb-3 text-indigo-300 flex items-center gap-2">
                    <span>🎯</span>
                    <span>Overall Affordability Score</span>
                  </h4>
                  {(() => {
                    const bestEMI = results[0].emi || 0;
                    const dsr = (bestEMI / monthlyNetSalary) * 100;
                    const leftover = monthlyNetSalary - bestEMI;
                    const leftoverRatio = (leftover / monthlyNetSalary) * 100;
                    
                    let score = 100;
                    if (dsr > 60) score = 20; // High risk
                    else if (dsr > 40) score = 40; // Moderate risk  
                    else if (dsr > 30) score = 70; // Good
                    else if (dsr > 20) score = 85; // Very good
                    else score = 95; // Excellent
                    
                    let scoreColor = 'text-green-400';
                    let scoreLabel = 'Excellent';
                    if (score < 40) {
                      scoreColor = 'text-red-400';
                      scoreLabel = 'High Risk';
                    } else if (score < 70) {
                      scoreColor = 'text-yellow-400';
                      scoreLabel = 'Moderate';
                    } else if (score < 85) {
                      scoreColor = 'text-blue-400';
                      scoreLabel = 'Good';
                    }
                    
                    return (
                      <div className="grid md:grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className={`text-3xl font-bold ${scoreColor} mb-1`}>{score}/100</div>
                          <div className="text-sm text-white/70">{scoreLabel}</div>
                          <div className="mt-2 bg-white/10 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-1000 ${
                                score >= 85 ? 'bg-green-500' : 
                                score >= 70 ? 'bg-blue-500' : 
                                score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-white/60 mb-1">Monthly Disposable Income</div>
                          <div className="text-xl font-bold text-green-400">LKR {lkr(leftover)}</div>
                          <div className="text-xs text-white/50">After loan payment</div>
                        </div>
                        <div>
                          <div className="text-sm text-white/60 mb-1">Breathing Room</div>
                          <div className="text-xl font-bold text-blue-400">{leftoverRatio.toFixed(0)}%</div>
                          <div className="text-xs text-white/50">Of salary available</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Results Cards */}
            {results.map((r, idx) => (
              <CompareResultCard key={`${r.row.bank}-${idx}`} result={r} idx={idx} />
            ))}

            {/* Smart Recommendations */}
            <div className="rounded-xl p-5 border border-white/10" style={{ backgroundColor: BRAND.card }}>
              <div className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🤖</span>
                <span>Smart Recommendations</span>
              </div>

              {/* Personalized Tips Based on Profile */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-3 text-purple-400">Personalized Tips for You</h4>
                <div className="space-y-3">
                  {(() => {
                    const tips: string[] = [];
                    
                    // Salary-based tips
                    if (monthlyNetSalary && monthlyNetSalary > 0) {
                      const bestDSR = results.length > 0 && results[0].emi ? (results[0].emi / monthlyNetSalary) * 100 : 0;
                      if (bestDSR > 60) {
                        tips.push("💰 Consider a longer tenure or smaller loan amount to improve your debt service ratio");
                      } else if (bestDSR < 25) {
                        tips.push("✨ Excellent affordability! You could qualify for premium products with better rates");
                      }
                    }
                    
                    // Product-specific tips
                    if (product === "HL" && isFirstHome === "yes") {
                      tips.push("🏡 As a first-time buyer, look for banks offering special first home schemes with lower rates");
                    }
                    
                    if (product === "PL" && (salaryLevel === "assignment" || salaryLevel === "remittance")) {
                      tips.push("📈 Your salary relationship could unlock preferential rates - negotiate with your salary bank");
                    }
                    
                    // Professional segment tips  
                    if (isProfessional === "yes") {
                      tips.push("👨‍💼 Professional packages often include rate discounts, fee waivers, and premium services");
                    }
                    
                    // Amount-based tips
                    if (amount && amount >= 10_000_000) {
                      tips.push("💎 High-value loans may qualify for VIP relationship manager and customized terms");
                    }
                    
                    // Tenure optimization
                    if (tenureYears <= 10 && product === "HL") {
                      tips.push("⚡ Shorter tenure saves significant interest - consider if monthly payment is manageable");
                    } else if (tenureYears >= 25) {
                      tips.push("📊 Long tenure reduces EMI but increases total interest - review total cost carefully");
                    }
                    
                    // Rate type advice
                    if (typePref === "any") {
                      tips.push("🎯 Consider starting with fixed rates for predictable payments, then switching to floating");
                    }
                    
                    // Default tip if no specific tips
                    if (tips.length === 0) {
                      tips.push("💡 Complete your profile details above for more personalized recommendations");
                    }
                    
                    return tips.slice(0, 4).map((tip, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-400/20">
                        <div className="text-sm text-white/80">{tip}</div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Alternative Suggestions if Limited Results */}
              {results.length < 3 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-orange-400">💭 Alternative Suggestions</h4>
                  <div className="space-y-2">
                    {(() => {
                      const suggestions: string[] = [];
                      
                      if (results.length === 0) {
                        suggestions.push("🔍 Try reducing loan amount or increasing tenure for more options");
                        suggestions.push("🏦 Consider removing bank filter to see all available loans");
                        suggestions.push("⚙️ Adjust salary relationship or professional status settings");
                      } else if (results.length < 3) {
                        suggestions.push("📊 Broaden search criteria to compare more options");
                        if (monthlyNetSalary && monthlyNetSalary > 0) {
                          suggestions.push("💼 Consider co-borrower option to improve eligibility");
                        }
                        if (product === "HL" && propertyValue) {
                          const ltv = amount && propertyValue ? (amount / propertyValue) * 100 : 0;
                          if (ltv > 80) {
                            suggestions.push("🏠 Lower LTV ratio by increasing property value or down payment");
                          }
                        }
                      }
                      
                      return suggestions.slice(0, 3).map((suggestion, idx) => (
                        <div key={idx} className="text-sm text-orange-300 bg-orange-500/10 p-2 rounded border border-orange-400/20">
                          {suggestion}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Rate Improvement Recommendations */}
              {results.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-3 text-green-400">🚀 Ways to Get Better Rates</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    {(() => {
                      const improvements = [
                        {
                          condition: salaryLevel === "none",
                          icon: "💰",
                          title: "Salary Banking",
                          tip: "Get 0.25-0.5% discount by transferring salary to the lending bank"
                        },
                        {
                          condition: useInternetBanking === "no",
                          icon: "💻", 
                          title: "Digital Banking",
                          tip: "Online account management often comes with rate benefits"
                        },
                        {
                          condition: takeCreditCard === "no" && product !== "EL",
                          icon: "💳",
                          title: "Credit Card Bundle", 
                          tip: "Cross-selling products can unlock relationship discounts"
                        },
                        {
                          condition: product === "HL" && propertyValue && amount && (amount / propertyValue) > 0.7,
                          icon: "🏠",
                          title: "Higher Down Payment",
                          tip: "Lower LTV ratio typically means better interest rates"
                        },
                        {
                          condition: isProfessional === "no" && monthlyNetSalary && monthlyNetSalary > 100000,
                          icon: "👨‍💼",
                          title: "Professional Status",
                          tip: "Doctors, Engineers, Lawyers often get preferential rates"
                        },
                        {
                          condition: isFirstHome === "no" && product === "HL",
                          icon: "🏡",
                          title: "First Home Benefits",
                          tip: "First-time buyers may qualify for government-backed schemes"
                        }
                      ];
                      
                      return improvements
                        .filter(item => item.condition)
                        .slice(0, 4)
                        .map((item, idx) => (
                          <div key={idx} className="bg-green-500/10 rounded-lg p-3 border border-green-400/20">
                            <div className="flex items-center gap-2 mb-1">
                              <span>{item.icon}</span>
                              <span className="text-sm font-medium text-green-300">{item.title}</span>
                            </div>
                            <div className="text-xs text-white/70">{item.tip}</div>
                          </div>
                        ));
                    })()}
                  </div>
                </div>
              )}

              {/* Market Intelligence */}
              <div className="bg-gradient-to-r from-indigo-500/10 to-blue-500/10 rounded-lg p-4 border border-indigo-400/20">
                <h4 className="text-sm font-semibold mb-3 text-indigo-300 flex items-center gap-2">
                  <span>📈</span>
                  <span>Market Intelligence</span>
                </h4>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/60 mb-1">Current Market Trend</div>
                    <div className="text-indigo-300 font-medium">
                      {(() => {
                        const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
                        const trends = [
                          "Rates showing stability with selective bank promotions",
                          "Processing fees becoming more competitive across banks", 
                          "Digital-first approaches offering better terms",
                          "Professional segment rates at historic competitive levels"
                        ];
                        return trends[Math.floor(Math.random() * trends.length)];
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-white/60 mb-1">Best Time to Apply</div>
                    <div className="text-indigo-300 font-medium">
                      Quarter-end and year-end typically offer promotional rates
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Tips */}
            <div className="rounded-xl p-4 border border-blue-400/20 bg-blue-500/5">
              <div className="flex items-start gap-3">
                <div className="text-2xl">💡</div>
                <div>
                  <div className="font-semibold text-blue-300 mb-1">Comparison Tips</div>
                  <ul className="text-sm text-white/70 space-y-1 list-disc list-inside">
                    <li>The effective rate includes upfront costs spread over the loan tenure</li>
                    <li>Monthly payments are calculated using standard amortization formula</li>
                    <li>Fees marked "At actuals" require bank confirmation for exact amounts</li>
                    <li>Consider total cost of borrowing, not just the interest rate</li>
                    {results.length < 3 && (
                      <li className="text-yellow-300">Try adjusting your criteria to see more options</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type ScrapeStatus = "idle" | "running" | "done" | "error";
type Bank = { key: string; label: string; url: string };
type PanelState = {
  status: Record<string, ScrapeStatus>;
  counts: Record<string, number>;
  errors: Record<string, string | undefined>;
  lastRun: Record<string, string | undefined>;
};

function makeEmptyPanelState(): PanelState {
  return { status: {}, counts: {}, errors: {}, lastRun: {} };
}

let panelStoreState: PanelState | null = null;
const panelStoreListeners = new Set<(state: PanelState) => void>();

function getPanelState(): PanelState {
  if (panelStoreState == null) {
    panelStoreState = loadJSON<PanelState>(LS_PANEL, makeEmptyPanelState());
  }
  return panelStoreState;
}

function setPanelState(next: PanelState): PanelState {
  panelStoreState = next;
  saveJSON(LS_PANEL, next);
  panelStoreListeners.forEach((listener) => {
    listener(next);
  });
  return next;
}

function updatePanelState(updater: (prev: PanelState) => PanelState): PanelState {
  const prev = getPanelState();
  const next = updater(prev);
  return setPanelState(next);
}

function subscribePanelState(listener: (state: PanelState) => void): () => void {
  panelStoreListeners.add(listener);
  return () => {
    panelStoreListeners.delete(listener);
  };
}

function ScraperPanel({
  apiBase, onMerge, onMergeTariffs, onResetRates, onResetTariffs, onCbsl, awprLatest, awplrLatest,
}: {
  apiBase: string;
  onMerge: (rows: RateRow[]) => void;
  onMergeTariffs: (rows: TariffRow[]) => void;
  onResetRates: () => void;
  onResetTariffs: () => void;
  onCbsl: (rows: any[]) => void;
  awprLatest?: number;
  awplrLatest?: number;
}) {
  /* ---- Rate scrapers (unchanged list incl. CBSL) ---- */
  const rateBanks: Bank[] = [
    { key: "hnb", label: "HNB", url: `${apiBase}/scrape/hnb` },
    { key: "seylan", label: "Seylan", url: `${apiBase}/scrape/seylan` },
    { key: "sampath", label: "Sampath", url: `${apiBase}/scrape/sampath` },
    { key: "combank", label: "Commercial Bank", url: `${apiBase}/scrape/combank` },
    { key: "ndb", label: "NDB", url: `${apiBase}/scrape/ndb` },
    { key: "unionb", label: "Union Bank", url: `${apiBase}/scrape/unionb` },
    { key: "dfcc", label: "DFCC", url: `${apiBase}/scrape/dfcc` },
    { key: "nsb", label: "NSB", url: `${apiBase}/scrape/nsb` },
    { key: "boc", label: "BOC", url: `${apiBase}/scrape/boc` },
    { key: "cargills", label: "Cargills", url: `${apiBase}/scrape/cargills` },
    { key: "ntb", label: "NTB", url: `${apiBase}/scrape/ntb` },
    { key: "amana", label: "Amana", url: `${apiBase}/scrape/amana` },
    { key: "peoples", label: "People’s", url: `${apiBase}/scrape/peoples` },
    { key: "cbsl", label: "CBSL (AWPR)", url: `${apiBase}/scrape/cbsl` },
  ];

  /* ---- Tariff scrapers: mirror keys with "-tariff" endpoints ---- */
  const tariffBanks: Bank[] = [
    { key: "hnb_tariff", label: "HNB – Tariff", url: tariffEndpointFor("hnb", apiBase)[0] },
    { key: "seylan_tariff", label: "Seylan – Tariff", url: tariffEndpointFor("seylan", apiBase)[0] },
    { key: "sampath_tariff", label: "Sampath – Tariff", url: tariffEndpointFor("sampath", apiBase)[0] },
    { key: "combank_tariff", label: "Commercial Bank – Tariff", url: tariffEndpointFor("combank", apiBase)[0] },
    { key: "ndb_tariff", label: "NDB – Tariff", url: tariffEndpointFor("ndb", apiBase)[0] },
    { key: "unionb_tariff", label: "Union Bank – Tariff", url: tariffEndpointFor("unionb", apiBase)[0] },
    { key: "dfcc_tariff", label: "DFCC – Tariff", url: tariffEndpointFor("dfcc", apiBase)[0] },
    { key: "nsb_tariff", label: "NSB – Tariff", url: tariffEndpointFor("nsb", apiBase)[0] },
    { key: "boc_tariff", label: "BOC – Tariff", url: tariffEndpointFor("boc", apiBase)[0] },
    { key: "cargills_tariff", label: "Cargills – Tariff", url: tariffEndpointFor("cargills", apiBase)[0] },
    { key: "ntb_tariff", label: "NTB – Tariff", url: tariffEndpointFor("ntb", apiBase)[0] },
    { key: "amana_tariff", label: "Amana – Tariff", url: tariffEndpointFor("amana", apiBase)[0] },
    { key: "peoples_tariff", label: "People’s – Tariff", url: tariffEndpointFor("peoples", apiBase)[0] },
  ];

  const [panel, setPanel] = useState<PanelState>(() => getPanelState());
  useEffect(() => {
    setPanel(getPanelState());
    return subscribePanelState((next) => setPanel(next));
  }, []);

  function patch(key: string, p: Partial<{ st: ScrapeStatus; cnt: number; err?: string; ts?: string }>) {
    updatePanelState((s) => ({
      status: { ...s.status, ...(p.st ? { [key]: p.st } : {}) },
      counts: { ...s.counts, ...(p.cnt !== undefined ? { [key]: p.cnt } : {}) },
      errors: { ...s.errors, ...(p.err !== undefined ? { [key]: p.err } : {}) },
      lastRun: { ...s.lastRun, ...(p.ts !== undefined ? { [key]: p.ts } : {}) },
    }));
  }

  /* ---- Rates coercer (unchanged) ---- */
  function coerceRows(raw: any): RateRow[] {
    const arr = Array.isArray(raw) ? raw : raw?.rows || raw?.data || [];
    if (!Array.isArray(arr)) return [];

    const getField = (obj: any, keys: string[]) => {
      for (const key of keys) {
        const value = obj?.[key];
        if (value === undefined || value === null) continue;
        if (typeof value === "string" && value.trim() === "") continue;
        return value;
      }
      return undefined;
    };

    const combineNotes = (...vals: (string | undefined)[]): string | undefined => {
      const seen = new Set<string>();
      const parts: string[] = [];
      for (const val of vals) {
        const trimmed = typeof val === "string" ? val.trim() : "";
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        parts.push(trimmed);
      }
      return parts.length ? parts.join(" ; ") : undefined;
    };

    const rowsOut: RateRow[] = [];

    for (const r of arr) {
      const hasHybrid = (() => {
        const fields = [
          r.notes, r.note, r.description, r.details, r.remark, r.remarks, r.comment, r.comments,
          ...(Array.isArray(r.notesArray) ? r.notesArray : []),
        ];
        return fields.some((f: any) => typeof f === "string" && /hybrid option/i.test(f));
      })();
      if (hasHybrid) continue;

      const stringFields: string[] = []
        .concat(r.rate, r.Rate, r.rateWithSalary, r.rateWithoutSalary, r.minRate, r.maxRate, r.Min, r.Max, r.notes)
        .filter((x: any) => typeof x === "string");
      const formulaStr = stringFields.find(containsFormula);
      const isFormula = !!formulaStr;

    let generalNotes = combineNotes(
      typeof r.notes === "string" ? r.notes : undefined,
      typeof r.note === "string" ? r.note : undefined,
      typeof r.description === "string" ? r.description : undefined,
      typeof r.details === "string" ? r.details : undefined,
    );
    const generalNotesOriginal = generalNotes;

    if (generalNotes && typeof generalNotes === "string" && /seylan/i.test(String(r.bank || ""))) {
      generalNotes = generalNotes.replace(/Tier\s*1\s*=\s*Professionals[\s\S]*/gi, " ");
      generalNotes = generalNotes.replace(/Secured\s*\(CAT\s*A\)\s*and\s*Unsecured\s*\(CAT\s*B\)[\s\S]*/gi, " ");
      generalNotes = generalNotes.replace(/\s*(?:;|\.)\s*$/g, " ").replace(/\s{2,}/g, " ").trim();
      if (!generalNotes) generalNotes = undefined;
    }

      const numericCandidates = [r.rate, r.Rate, r.rateWithSalary, r.rateWithoutSalary, r.minRate, r.maxRate, r.Min, r.Max]
        .filter((x: any) => !(isFormula && typeof x === "string"))
        .map(readNumber);
      const rateNum = isFormula ? undefined :
        numericCandidates.find((v) => typeof v === "number" && isFinite(v));

      const product = normProductName(r.product ?? r.Product ?? r.category ?? r.ProductName);
      const type: "Fixed" | "Floating" =
        /floating|float/i.test(String(r.type ?? r.Type ?? r.notes ?? "").toLowerCase())
          ? "Floating" : "Fixed";

      const fy =
        r.fixedYears ?? r.tenureYears ??
        (() => {
          const m =
            String(r.tenureLabel ?? r.notes ?? "").toLowerCase().match(/\b([0-9]+)\s*(?:y|year)/) ||
            String(r.type ?? "").toLowerCase().match(/\b([0-9]+)\s*(?:y|year)/);
          return m ? parseInt(m[1], 10) : undefined;
        })();

      const baseRowCommon = {
        bank: r.bank || r.Bank || "Unknown",
        product,
        type,
        fixedYears: fy,
        updatedAt: r.updatedAt || new Date().toISOString(),
        source: r.source,
        ltv: typeof r.ltv === "number" ? r.ltv : undefined,
        salaryRequired: typeof r.salaryRequired === "boolean" ? r.salaryRequired : undefined,
        tenureLabel: r.tenureLabel || r.tenure_label || undefined,
      };

      const bankLower = String(baseRowCommon.bank || "").toLowerCase();
      const withSalaryRaw = getField(r, ["rateWithSalary", "rate_with_salary", "withSalaryRate", "rateWith"]);
      const withoutSalaryRaw = getField(r, ["rateWithoutSalary", "rate_without_salary", "withoutSalaryRate", "rateWithout"]);
      const salaryVariants: RateRow[] = [];
      const hasBothSalary = withSalaryRaw !== undefined && withoutSalaryRaw !== undefined;

      const pushSalaryVariant = (
        rawValue: any,
        opts: { salaryRequired?: boolean; noteExtra?: string; variantKey: string; baseNotes?: string; },
      ) => {
        const valueStr = typeof rawValue === "string" ? rawValue : (typeof rawValue === "number" && isFinite(rawValue) ? String(rawValue) : undefined);
        const formulaNote = valueStr && containsFormula(valueStr) ? valueStr : undefined;
        const numericValue = formulaNote ? undefined : readNumber(rawValue);
        const hasNumber = typeof numericValue === "number" && isFinite(numericValue);

        if (!hasNumber && !formulaNote) return;

        if (bankLower.includes("combank") || bankLower.includes("commercial bank")) {
          const noteLower = (opts.noteExtra || "").toLowerCase();
          if (opts.salaryRequired === false || noteLower.includes("without")) return;
        }

        salaryVariants.push({
          ...baseRowCommon,
          rate: hasNumber ? (numericValue as number) : NaN,
          notes: combineNotes(generalNotes, opts.baseNotes, formulaNote, opts.noteExtra),
          salaryRequired: opts.salaryRequired ?? baseRowCommon.salaryRequired,
          raw: { ...r, __variant: opts.variantKey },
        });
      };

      let handledSpecificSalary = false;
      if (bankLower.includes("seylan")) {
        const tierNoteCache: Record<string, string | undefined> = {};
        const getSeylanTierNote = (tier: string): string | undefined => {
          if (tierNoteCache[tier] !== undefined) return tierNoteCache[tier];
          if (!generalNotesOriginal) {
            tierNoteCache[tier] = undefined;
            return undefined;
          }
          const pattern = "Tier\\s*" + tier + "\\s*=[\\s\\S]*?(?=Tier\\s*[123]\\s*=|$)";
          const regex = new RegExp(pattern, "i");
          const match = generalNotesOriginal.match(regex);
          let cleaned = match ? match[0].trim() : undefined;
          if (cleaned) {
            cleaned = cleaned.replace(/[\-\s]+$/, "").replace(/\s{2,}/g, " " );
          }
          tierNoteCache[tier] = cleaned;
          return cleaned;
        };

        const getSeylanEduNote = (kind: "secured" | "unsecured"): string | undefined => {
          if (!generalNotesOriginal) return kind === "secured" ? "Secured (CAT A)" : "Unsecured (CAT B)";
          const regex = kind === "secured" ? /Secured\s*\(CAT\s*A\)/i : /Unsecured\s*\(CAT\s*B\)/i;
          const match = generalNotesOriginal.match(regex);
          if (match) return match[0].trim();
          return kind === "secured" ? "Secured (CAT A)" : "Unsecured (CAT B)";
        };

        const seylanDefs: Array<{ field: string; salaryRequired: boolean; label: string; noteBase?: string }> = [
          { field: "rateWithSalaryAbove700kCreditCardInternetBanking", salaryRequired: true, label: "With salary (>= 700k, credit card + internet banking)" },
          { field: "rateWithSalaryAbove700k", salaryRequired: true, label: "With salary (>= 700k)" },
          { field: "rateWithSalaryBelow700kCreditCardInternetBanking", salaryRequired: true, label: "With salary (< 700k, credit card + internet banking)" },
          { field: "rateWithSalaryBelow700k", salaryRequired: true, label: "With salary (< 700k)" },
          { field: "rateWithoutSalaryWithCreditCardInternetBanking", salaryRequired: false, label: "Without salary (credit card + internet banking)" },
          { field: "rateWithoutSalary", salaryRequired: false, label: "Without salary" },
          { field: "rateEduSecuredWithCreditCardInternetBanking", salaryRequired: false, label: "With credit card + internet banking", noteBase: getSeylanEduNote("secured") },
          { field: "rateEduSecuredWithoutCreditCardInternetBanking", salaryRequired: false, label: "Without credit card / internet banking", noteBase: getSeylanEduNote("secured") },
          { field: "rateEduUnsecuredWithCreditCardInternetBanking", salaryRequired: false, label: "With credit card + internet banking", noteBase: getSeylanEduNote("unsecured") },
          { field: "rateEduUnsecuredWithoutCreditCardInternetBanking", salaryRequired: false, label: "Without credit card / internet banking", noteBase: getSeylanEduNote("unsecured") },
          { field: "ratePLTier1WithCreditCardInternetBanking", salaryRequired: true, label: "PL Tier 1 (with credit card + internet banking)" },
          { field: "ratePLTier1WithoutCreditCardInternetBanking", salaryRequired: true, label: "PL Tier 1 (without credit card/internet)" },
          { field: "ratePLTier2WithCreditCardInternetBanking", salaryRequired: true, label: "PL Tier 2 (with credit card + internet banking)" },
          { field: "ratePLTier2WithoutCreditCardInternetBanking", salaryRequired: true, label: "PL Tier 2 (without credit card/internet)" },
          { field: "ratePLTier3WithCreditCardInternetBanking", salaryRequired: true, label: "PL Tier 3 (with credit card + internet banking)" },
          { field: "ratePLTier3WithoutCreditCardInternetBanking", salaryRequired: true, label: "PL Tier 3 (without credit card/internet)" },
        ];
        for (const def of seylanDefs) {
          const val = getField(r, [def.field]);
          if (val === undefined) continue;
          const tierMatch = def.field.match(/Tier([123])/i);
          const baseNotes = def.noteBase ?? (tierMatch ? getSeylanTierNote(tierMatch[1]) : undefined);
          pushSalaryVariant(val, {
            salaryRequired: def.salaryRequired,
            noteExtra: def.label,
            variantKey: def.field,
            baseNotes,
          });
          handledSpecificSalary = true;
        }
      } else if (bankLower.includes("cargills")) {
        const cargillsDefs = [
          { field: "rateWithSalaryAssignmentAbove300k", salaryRequired: true, noteBase: "Salary assignment >= 300k", noteExtra: "With salary assignment" },
          { field: "rateWithSalaryRemittedAbove300k", salaryRequired: true, noteBase: "Salary remitted >= 300k", noteExtra: "With salary remittance" },
          { field: "rateWithoutSalaryAbove300k", salaryRequired: false, noteBase: "Standing instruction >= 300k", noteExtra: "Without salary" },
          { field: "rateWithSalaryAssignment150kTo299999", salaryRequired: true, noteBase: "Salary assignment 150k-299,999", noteExtra: "With salary assignment" },
          { field: "rateWithSalaryRemitted150kTo299999", salaryRequired: true, noteBase: "Salary remitted 150k-299,999", noteExtra: "With salary remittance" },
          { field: "rateWithoutSalary150kTo299999", salaryRequired: false, noteBase: "Standing instruction 150k-299,999", noteExtra: "Without salary" },
          { field: "rateWithSalaryAssignmentUpTo149999", salaryRequired: true, noteBase: "Salary assignment <= 149,999", noteExtra: "With salary assignment" },
          { field: "rateWithSalaryRemittedUpTo149999", salaryRequired: true, noteBase: "Salary remitted <= 149,999", noteExtra: "With salary remittance" },
          { field: "rateWithoutSalaryUpTo149999", salaryRequired: false, noteBase: "Standing instruction <= 149,999", noteExtra: "Without salary" },
          { field: "rateWithSalaryRemitted", salaryRequired: true, noteBase: "Salary remittance", noteExtra: "With salary remittance" },
          { field: "rateWithoutSalary", salaryRequired: false, noteBase: "Without salary", noteExtra: "Without salary" },
        ];
        const baseNote = /home/.test(product.toLowerCase()) ? "Home Loan" : /lap/.test(product.toLowerCase()) ? "Loan Against Property" : undefined;
        for (const def of cargillsDefs) {
          const val = getField(r, [def.field]);
          if (val === undefined) continue;
          pushSalaryVariant(val, {
            salaryRequired: def.salaryRequired,
            noteExtra: def.noteExtra,
            variantKey: def.field,
            baseNotes: combineNotes(baseNote, def.noteBase),
          });
          handledSpecificSalary = true;
        }
      }

      if (!handledSpecificSalary && (withSalaryRaw !== undefined || withoutSalaryRaw !== undefined)) {
        if (withSalaryRaw !== undefined) {
          pushSalaryVariant(withSalaryRaw, {
            salaryRequired: true,
            noteExtra: hasBothSalary ? "With salary" : undefined,
            variantKey: "with_salary",
          });
        }
        if (withoutSalaryRaw !== undefined) {
          pushSalaryVariant(withoutSalaryRaw, {
            salaryRequired: false,
            noteExtra: hasBothSalary ? "Without salary" : undefined,
            variantKey: "without_salary",
          });
        }
      }

      if (salaryVariants.length) {
        rowsOut.push(...salaryVariants);
        continue;
      }

      rowsOut.push({
        ...baseRowCommon,
        rate: typeof rateNum === "number" ? rateNum : NaN,
        notes: combineNotes(generalNotes, isFormula ? formulaStr : undefined),
        raw: r,
      } as RateRow);
    }

    return rowsOut.filter((row) => Number.isFinite(row.rate) || /awpr|awplr/i.test(row.notes || ""));
  }

  /* ---- runners ---- */

  async function runRateOne(b: Bank) {
    patch(b.key, { st: "running", err: undefined });
    const tries: string[] = [b.url];
    if (!/[?&](show|save)=/i.test(b.url)) {
      tries.push(b.url + (b.url.includes("?") ? "&" : "?") + "show=true");
    }

    let lastErr: any = null;
    for (const url of tries) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();

        if (b.key === "cbsl") {
          const rows = Array.isArray(data) ? data : [];
          onCbsl(rows);
          patch(b.key, { st: "done", cnt: rows.length, ts: new Date().toLocaleString() });
          return;
        }

        let rows = coerceRows(data);
        if (typeof awprLatest === "number" || typeof awplrLatest === "number") {
          rows = normalizeFormulaRates(rows, awprLatest, awplrLatest);
        }
        onMerge(rows);
        patch(b.key, { st: "done", cnt: rows.length, ts: new Date().toLocaleString() });
        return;
      } catch (e: any) {
        lastErr = e;
      }
    }
    patch(b.key, { st: "error", err: String(lastErr?.message || lastErr) });
  }

  async function runTariffOne(b: Bank) {
    patch(b.key, { st: "running", err: undefined });

    // Try both -tariff and _tariff transparently (server variations)
    const baseTries = tariffEndpointFor(b.key.replace(/_tariff$/, "").replace(/-tariff$/, ""), apiBase);
    const tries: string[] = [];
    for (const base of baseTries) {
      tries.push(base);
      if (!/[?&](show|save)=/i.test(base)) {
        tries.push(base + (base.includes("?") ? "&" : "?") + "show=true");
      }
    }

    let lastErr: any = null;
    for (const url of tries) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        const rows = coerceTariffs(data);
        onMergeTariffs(rows);
        patch(b.key, { st: "done", cnt: rows.length, ts: new Date().toLocaleString() });
        return;
      } catch (e: any) {
        lastErr = e;
      }
    }
    patch(b.key, { st: "error", err: String(lastErr?.message || lastErr) });
  }

  async function runAllSequential() {
    // 1) All rate scrapers (incl. CBSL)
    for (const b of rateBanks) { // eslint-disable-next-line no-await-in-loop
      await runRateOne(b);
    }
    // 2) All tariff scrapers
    for (const b of tariffBanks) { // eslint-disable-next-line no-await-in-loop
      await runTariffOne(b);
    }
  }

  function resetAll() {
    // Clear panel
    setPanelState(makeEmptyPanelState());
    // Clear rates
    onResetRates();
    saveJSON(LS_RATES, [] as RateRow[]);
    // Clear tariffs
    onResetTariffs();
    saveJSON(LS_TARIFFS, [] as TariffRow[]);
  }

  /* ---- UI ---- */

  function Tile({ id, label, url, onRun }: { id: string; label: string; url: string; onRun: () => void; }) {
    const st = panel.status[id] || "idle";
    const cnt = panel.counts[id] ?? 0;
    const err = panel.errors[id];
    const ts = panel.lastRun[id];
    const tag = st.toUpperCase();

    return (
      <div className="rounded-xl p-4 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">{label}</div>
          <span
            className={
              "text-xs px-2 py-1 rounded " +
              (st === "running" ? "bg-yellow-500/20 text-yellow-300"
                : st === "done" ? "bg-green-500/20 text-green-300"
                : st === "error" ? "bg-red-500/20 text-red-300"
                : "bg-white/10 text-white/70")
            }
          >
            {tag}
          </span>
        </div>

        <div className="mt-2 text-sm text-white/70">
          Rows: <span className="text-white/90">{cnt}</span>
          {ts && <span className="ml-3">Last: {ts}</span>}
        </div>

        {err && <div className="mt-2 text-xs text-red-300 break-words">{err}</div>}

        <div className="mt-3">
          <Btn className="px-3 py-1.5 rounded-lg bg-white/10" disabled={st === "running"} onClick={onRun}>
            {st === "running" ? "Running…" : "Run"}
          </Btn>
          <a href={url} target="_blank" rel="noreferrer" className="ml-3 text-[#60a5fa] underline text-sm">
            Open endpoint
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Scraper Control Panel</h2>
        <div className="flex items-center gap-2">
          <Btn className="px-4 py-2 rounded-lg bg-white/10" onClick={resetAll}>Reset</Btn>
          <Btn className="px-4 py-2 rounded-lg bg-white/10" onClick={runAllSequential}>Run All</Btn>
        </div>
      </div>

      {/* Section 1: Rate scrapers (unchanged visually) */}
      <div>
        <div className="text-white/80 mb-2 font-semibold">Rate scrapers</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rateBanks.map((b) => (
            <Tile
              key={b.key}
              id={b.key}
              label={b.label}
              url={/[?&](show|save)=/i.test(b.url) ? b.url : b.url + (b.url.includes("?") ? "&" : "?") + "show=true"}
              onRun={() => runRateOne(b)}
            />
          ))}
        </div>
      </div>

      {/* Section 2: Tariff scrapers (new) */}
      <div>
        <div className="text-white/80 mb-2 font-semibold">Tariff scrapers</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tariffBanks.map((b) => {
            const [dashUrl] = tariffEndpointFor(b.key.replace(/_tariff$/, "").replace(/-tariff$/, ""), apiBase);
            const openUrl = /[?&](show|save)=/i.test(dashUrl)
              ? dashUrl
              : dashUrl + (dashUrl.includes("?") ? "&" : "?") + "show=true";
            return (
              <Tile
                key={b.key}
                id={b.key}              // distinct keys like "hnb_tariff"
                label={b.label}
                url={openUrl}
                onRun={() => runTariffOne(b)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

type CbslRow = { period: string; weekEnd: string; metric: string; rate: string; source: string; updatedAt: string };

function reduceCbslToMonthlyAwpr(rows: CbslRow[]): Record<string, number> {
  const map: Record<string, { ts: number; rate: number }> = {};
  for (const r of rows) {
    const m = ym(r.weekEnd || r.period);
    const n = parseFloat(String(r.rate));
    if (!isFinite(n)) continue;
    const ts = new Date(r.weekEnd || r.period).getTime();
    const cur = map[m];
    if (!cur || ts >= cur.ts) map[m] = { ts, rate: n };
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(map).sort()) out[k] = map[k].rate;
  return out;
}
function monthRange(minYm: string, maxYm: string): string[] {
  const [y1, m1] = minYm.split("-").map(Number);
  const [y2, m2] = maxYm.split("-").map(Number);
  const out: string[] = [];
  let y = y1, m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
function tenorKeys(): TenorKey[] { return ["1M","3M","6M","12M","24M","36M","48M","60M"]; }

function applyLiquidityPremium(
  base: number | undefined,
  lp: number | Partial<Record<TenorKey, number>> | undefined,
  tenor: TenorKey
): number | undefined {
  if (typeof base === "number") {
    // Parsed FTP values already include any liquidity premium.
    return base;
  }
  // Fall back only if we lack a base value but have a numeric premium on its own.
  if (!lp) return undefined;
  if (typeof lp === "number") return lp;
  if (typeof lp[tenor] === "number") return lp[tenor];
  return undefined;
}

export function buildAwprFtpMultiSeries(cbslRows: CbslRow[], ftpMonths: UbFtpMonth[]) {
  const awprMonthly = reduceCbslToMonthlyAwpr(cbslRows);
  const ftpByMonth: Record<string, Partial<Record<TenorKey, number>>> = {};
  const lpByMonth: Record<string, number | Partial<Record<TenorKey, number>>> = {};

  for (const rec of ftpMonths) {
    ftpByMonth[rec.month] = rec.asset || {};
    if (rec.liquidityPremium != null) lpByMonth[rec.month] = rec.liquidityPremium;
  }

  const monthsAll = (() => {
    const ms = new Set<string>([...Object.keys(awprMonthly), ...Object.keys(ftpByMonth)]);
    const sorted = [...ms].sort();
    if (!sorted.length) return [];
    return monthRange(sorted[0], sorted[sorted.length - 1]);
  })();

  const months = monthsAll.length > 6 ? monthsAll.slice(monthsAll.length - 6) : monthsAll;

  const awprFfilled: Record<string, number | null> = {};
  let lastAwpr: number | null = null;
  for (const m of monthsAll) {
    const cur = typeof awprMonthly[m] === "number" ? awprMonthly[m] : null;
    if (cur != null) lastAwpr = cur;
    awprFfilled[m] = lastAwpr;
  }

  const rows = months.map((m) => {
    const row: any = { month: m, AWPR: awprFfilled[m] ?? null };
    for (const t of tenorKeys()) {
      let last: number | undefined = undefined;
      for (let i = monthsAll.indexOf(m); i >= 0; i--) {
        const mm = monthsAll[i];
        const base = ftpByMonth[mm]?.[t];
        const lp = lpByMonth[mm];
        const eff = applyLiquidityPremium(base, lp, t);
        if (typeof eff === "number") { last = eff; break; }
      }
      row[t] = last ?? null;
    }
    return row;
  });
  return rows as Array<{ month: string; AWPR: number | null } & Partial<Record<TenorKey, number | null>>>;
}

function AwprFtpChartMulti({
  cbslRows, ftpMonths, brand,
}: {
  cbslRows: CbslRow[];
  ftpMonths: UbFtpMonth[];
  brand: typeof BRAND;
}) {
  const data = useMemo(() => buildAwprFtpMultiSeries(cbslRows, ftpMonths), [cbslRows, ftpMonths]);

  const [activeTenors, setActiveTenors] = useState<Set<TenorKey>>(
    () => new Set<TenorKey>(["6M","12M","24M"])
  );
  function toggle(t: TenorKey) {
    setActiveTenors((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3 flex flex-wrap gap-2">
        {tenorKeys().map((t) => (
          <Btn
            key={t}
            className={`px-2.5 py-1 rounded-full text-xs ${activeTenors.has(t) ? "bg-[#3b82f6] text-white" : "bg-white/10"}`}
            onClick={() => toggle(t)}
          >
            {t}
          </Btn>
        ))}
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value) => (typeof value === "number" ? value.toFixed(2) : value)} />
          <Legend />
          <Line dataKey="AWPR" stroke={brand.Gold} dot={false} strokeWidth={2} />
          {tenorKeys().map((t) =>
            activeTenors.has(t) ? <Line key={t} dataKey={t} dot={false} strokeWidth={2} /> : null
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function FtpFileUploader({
  initialMonths, onSaveAll, onReset,
}: {
  initialMonths: UbFtpMonth[];
  onSaveAll: (months: UbFtpMonth[]) => void;
  onReset: () => void;
}) {
  const [staged, setStaged] = useState<UbFtpMonth[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  function currentYm(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  async function parseCsv(text: string): Promise<Partial<Record<TenorKey, number>>> {
    const out: Partial<Record<TenorKey, number>> = {};
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      const m =
        line.match(/([0-9]{1,2})\s*(m|y)\s*[,:\- ]\s*([0-9]+(?:\.[0-9]+)?)/i) ||
        line.match(/^\s*([0-9]{1,2})(m|y)\s+([0-9]+(?:\.[0-9]+)?)\s*$/i);
      if (!m) continue;
      const num = Number(m[1]);
      const unit = m[2].toUpperCase();
      const rate = parseFloat(m[3]);
      if (!isFinite(rate)) continue;
      let key: TenorKey | undefined;
      if (unit === "M") key = ({ 1: "1M", 3: "3M", 6: "6M", 12: "12M" } as const)[num];
      else key = ({ 1: "12M", 2: "24M", 3: "36M", 4: "48M", 5: "60M" } as const)[num];
      if (key) out[key] = rate;
    }
    return out;
  }

  async function parsePdf(
    file: File
  ): Promise<{ asset: Partial<Record<TenorKey, number>>; lp?: Partial<Record<TenorKey, number>> | number }> {
    const pdfjsLib = await import("pdfjs-dist");
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

    const buf = new Uint8Array(await file.arrayBuffer());
    // @ts-ignore
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;

    let allRows: string[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let lineTokens: string[] = [];
      let lastY: number | null = null;
      for (const item of content.items as any[]) {
        const [,, , , _x, y] = item.transform;
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (lineTokens.length) allRows.push([...lineTokens]);
          lineTokens = [];
        }
        lastY = y;
        const text = String(item.str || "").trim();
        if (text) lineTokens.push(text);
      }
      if (lineTokens.length) allRows.push([...lineTokens]);
    }

    const tenors: TenorKey[] = ["1M", "3M", "6M", "12M", "24M", "36M", "48M", "60M"];
    const asset: Partial<Record<TenorKey, number>> = {};
    const lp: Partial<Record<TenorKey, number>> = {};

    let augHeaderIdx = -1, periodIdx = -1, assetFtpIdx = -1;
    for (let i = 0; i < allRows.length; ++i) {
      const lower = allRows[i].map(s => s.toLowerCase());
      if (lower.includes("period") && lower.includes("asset ftp")) {
        augHeaderIdx = i; periodIdx = lower.indexOf("period"); assetFtpIdx = lower.indexOf("asset ftp"); break;
      }
    }

    if (augHeaderIdx !== -1 && periodIdx !== -1 && assetFtpIdx !== -1) {
      for (let i = augHeaderIdx + 1; i < allRows.length; ++i) {
        const row = allRows[i];
        if (!row.length) continue;
        const joined = row.join(" ").toLowerCase();
        if (joined.includes("tenor") || joined.includes("liability/asset") || joined.includes("ftp - fcy")
            || (joined.includes("asset") && joined.length < 20)) break;

        const period = (row[periodIdx] || "").replace(/\s/g, "").toUpperCase();
        if (!tenors.includes(period as TenorKey)) continue;

        const assetStr = row[assetFtpIdx] || "";
        const assetNum = parseFloat(assetStr.replace(/[^0-9.]/g, ""));
        if (isFinite(assetNum)) asset[period as TenorKey] = assetNum;

        if (row.length > assetFtpIdx + 1) {
          const lpStr = row[assetFtpIdx + 1] || "";
          const lpNum = parseFloat(lpStr.replace(/[^0-9.]/g, ""));
          if (isFinite(lpNum)) lp[period as TenorKey] = lpNum;
        }
      }
      for (const tenor of tenors) {
        if (typeof asset[tenor] === "number" && typeof lp[tenor] === "number") {
          asset[tenor] = (asset[tenor] as number) + (lp[tenor] as number);
        }
      }
      const lpOut = Object.keys(lp).length ? lp : undefined;
      return { asset, lp: lpOut };
    }

    let headerRowIdx2 = -1;
    let periodIdx2 = -1, assetIdx2 = -1, lpIdx2 = -1;
    for (let i = 0; i < allRows.length; ++i) {
      const lower = allRows[i].map(s => s.toLowerCase());
      if (lower.includes("period") && (lower.includes("asset lkr") || lower.includes("asset ftp"))) {
        headerRowIdx2 = i; periodIdx2 = lower.indexOf("period");
        assetIdx2 = lower.findIndex(c => c === "asset lkr" || c === "asset ftp");
        lpIdx2 = lower.findIndex(c => c.includes("liquidity premium"));
        break;
      }
    }

    if (headerRowIdx2 !== -1 && assetIdx2 !== -1 && periodIdx2 !== -1) {
      const rows = [];
      for (let i = headerRowIdx2 + 1; i < allRows.length; ++i) {
        const rowLower = allRows[i].map(s => s.toLowerCase()).join(" ");
        if (rowLower.includes("liability") || rowLower.includes("fcy") || rowLower.includes("foreign")
            || (rowLower.includes("premium") && !rowLower.includes("liquidity")) || rowLower.includes("period")) break;
        rows.push(allRows[i]);
      }
      for (const tenor of tenors) {
        const matchRows = rows.filter(r => {
          const periodCell = r[periodIdx2] || "";
          return periodCell.replace(/\s/g, "").toUpperCase().startsWith(tenor);
        });
        if (matchRows.length) {
          const last = matchRows[matchRows.length - 1];
          let val = last[assetIdx2] || "";
          val = val.replace(/[^0-9.]/g, "");
          const num = parseFloat(val);
          if (isFinite(num)) asset[tenor] = num;

          if (lpIdx2 !== -1 && last[lpIdx2]) {
            const lpVal = parseFloat((last[lpIdx2] || "").replace(/[^0-9.]/g, ""));
            if (isFinite(lpVal)) lp[tenor] = lpVal;
          }
        }
      }
      for (const tenor of tenors) {
        if (typeof asset[tenor] === "number" && typeof lp[tenor] === "number") {
          asset[tenor] = (asset[tenor] as number) + (lp[tenor] as number);
        }
      }
      const lpOut = Object.keys(lp).length ? lp : undefined;
      return { asset, lp: lpOut };
    }
    return { asset: {}, lp: undefined };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    const newRows: UbFtpMonth[] = [];

    for (const f of Array.from(files)) {
      try {
        const name = f.name;
        const month = inferMonthFromFilename(name) || currentYm();

        let asset: Partial<Record<TenorKey, number>> = {};
        let lpMaybe: number | Partial<Record<TenorKey, number>> | undefined;

        if (/\.(csv|txt)$/i.test(name)) {
          const text = await f.text();
          asset = await parseCsv(text);
        } else if (/\.(pdf)$/i.test(name)) {
          const parsed = await parsePdf(f);
          asset = parsed.asset || {};
          if (parsed.lp && Object.keys(parsed.lp).length) lpMaybe = parsed.lp;
        } else {
          continue;
        }

        if (Object.keys(asset).length === 0) continue;

        newRows.push({
          month,
          sourceName: name,
          asset,
          liquidityPremium: lpMaybe,
          uploadedAt: new Date().toISOString(),
        });
      } catch {
        // ignore parse errors
      }
    }

    const combined = dedupeByMonth([...staged, ...newRows]);
    setStaged(combined);
    setBusy(false);
  }

  function dedupeByMonth(arr: UbFtpMonth[]): UbFtpMonth[] {
    const map = new Map<string, UbFtpMonth>();
    for (const r of arr) map.set(r.month, r);
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  function saveAll() {
    const merged = dedupeByMonth([...initialMonths, ...staged]);
    onSaveAll(merged);
    setStaged([]);
  }
  function resetAll() { onReset(); setStaged([]); }

  const previewList = staged.length ? staged : initialMonths;

  return (
    <div className="rounded-2xl border border-white/10 p-4" style={{ backgroundColor: BRAND.card }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">FTP Uploader</div>
          <div className="text-white/70 text-sm">Upload monthly Asset FTP (CSV or PDF). Each file = one month.</div>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="ftpFile" className="cursor-pointer px-4 py-2 rounded-xl bg-white text-black font-semibold shadow hover:bg-[#60a5fa] hover:text-black transition">Browse…</label>
          <span className="text-white/70 text-sm">{files?.length ? `${files.length} file(s) selected` : "No files selected."}</span>
          {busy && <span className="text-white/60 text-sm ml-2">Parsing…</span>}
          <input
            id="ftpFile" type="file" multiple accept=".csv,.pdf,.txt"
            onChange={async (e) => { const list = e.target.files; setFiles(Array.from(list ?? [])); await handleFiles(list); e.currentTarget.value = ""; }}
            className="hidden"
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm text-white/80 mb-2">
          {staged.length
            ? `Preview (${staged.length} month${staged.length === 1 ? "" : "s"}) — not saved yet`
            : `Saved (${initialMonths.length} month${initialMonths.length === 1 ? "" : "s"})`}
        </div>
        <div className="overflow-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                <th>Month</th>
                <th>Source</th>
                <th>Tenors (parsed)</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-white/5">
              {previewList.map((r) => (
                <tr key={r.month} className="border-t border-white/10">
                  <td className="px-3 py-2 font-medium">{r.month}</td>
                  <td className="px-3 py-2">{r.sourceName}</td>
                  <td className="px-3 py-2">
                    {Object.entries(r.asset)
                      .filter(([, v]) => typeof v === "number")
                      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}%`)
                      .join("     ") || "—"}
                  </td>
                </tr>
              ))}
              {!previewList.length && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-white/70">No staged uploads yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn className="px-4 py-2 rounded-lg bg-white text-black disabled:opacity-60" disabled={!staged.length || busy} onClick={saveAll}>Save All</Btn>
        <Btn className="px-4 py-2 rounded-lg bg-white/10 disabled:opacity-60" disabled={busy} onClick={() => setStaged([])}>Clear Preview</Btn>
        <Btn className="px-4 py-2 rounded-lg bg-white/10 disabled:opacity-60" disabled={busy || !initialMonths.length} onClick={resetAll}>Reset</Btn>
        {busy && <span className="text-white/60 text-sm ml-2">Parsing…</span>}
      </div>
    </div>
  );
}
export default function AppWithAuth() {
  const [ok, setOk] = React.useState(false);   // always start locked
  if (!ok) return <LoginGate onSuccess={() => setOk(true)} />;
  return <UBRateAnalyst />;
}


