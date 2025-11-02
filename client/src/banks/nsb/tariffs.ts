// nsb/tariffs.ts
export type Inputs = {
  product: "Home Loans" | "Loan Against Property" | "Personal Loans" | "Education Loans";
  bank: "NSB";
  amount: number;
  includeTariffs: boolean;
  enableExpress?: boolean;
  expressDays?: 4 | 10;
  extraCribParties?: number;
  isGovtHousing?: boolean;
};

export type TariffRow = {
  bank: "NSB";
  product: "Home Loan" | "Personal Loan" | "Education Loan";
  feeType: string;
  description?: string;
  note?: string;
  amount: string;
  source: string;
  updatedAt: string;
};

export type TariffPayload = { bank: "NSB"; rows: TariffRow[] };

export type PriceResultPart = {
  processing?: { label: string; amountLKR?: number; formula?: string; ruleRef: string };
  otherFees?: Array<{ label: string; amountLKR?: number; formula?: string; ruleRef: string }>;
  notes?: string[];
};

const amtFrom = (raw?: string): number | undefined => {
  if (!raw) return undefined;
  // Handle patterns like "Rs. 20,000/ -", "Rs. 5,000", "5000", etc.
  const cleanStr = raw
    .replace(/Rs\.?\s*/gi, '')  // Remove "Rs." prefix
    .replace(/,/g, '')          // Remove commas
    .replace(/\s*\/\s*-/g, '')  // Remove "/ -" suffix
    .replace(/[^\d.]/g, '')     // Keep only digits and dots
    .trim();
  
  if (!cleanStr) return undefined;
  const n = Number(cleanStr);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

export function calculateNSBTariffs(inputs: Inputs, payload: TariffPayload): PriceResultPart {
  const out: PriceResultPart = {};
  if (!inputs.includeTariffs) return out;

  const rows = (payload?.rows || []).filter(r => r.bank === "NSB");
  const add = (label: string, amountLKR?: number, formula?: string, ruleRef?: string) => {
    out.otherFees ??= [];
    out.otherFees.push({ label, amountLKR, formula, ruleRef: ruleRef || "NSB tariff" });
  };

  // === CRIB ===
  const cribRow = rows.find(r => /CRIB report/i.test(r.feeType));
  if (cribRow) {
    if (inputs.product !== "Personal Loans") add("CRIB report (Retail)", 250, undefined, cribRow.source);
  }

  // === Home Loans ===
  if (inputs.product === "Home Loans") {
    // Processing
    const procGov = rows.find(r => /Processing Fees - Government Housing Loan/i.test(r.feeType));
    if (inputs.isGovtHousing && procGov) {
      out.processing = { label: "Processing Fee (Govt. Housing)", amountLKR: 7500, ruleRef: procGov.source };
    } else {
      const procLE = rows.find(r => r.feeType === "Processing Fees" && /Upto\s*Rs\.?\s*2,?500,?000/i.test(r.description || ""));
      const procGT = rows.find(r => r.feeType === "Processing Fees" && /Above\s*Rs\.?\s*2,?500,?000/i.test(r.description || ""));
      if (inputs.amount <= 2_500_000 && procLE) {
        out.processing = { label: "Processing Fee", formula: "Actual Cost (≤ LKR 2.5M)", ruleRef: procLE.source };
      } else if (procGT) {
        const m = /([\d.]+)\s*%/.exec(procGT.amount);
        const pct = m ? Number(m[1]) : 0.5;
        out.processing = {
          label: "Processing Fee",
          amountLKR: Math.round(inputs.amount * (pct / 100)),
          formula: `${pct}% of loan amount`,
          ruleRef: procGT.source
        };
      }
    }

    // Express
    const e4 = rows.find(r => /Processing Fees - Express/i.test(r.feeType) && /4\s*days/i.test(r.description || ""));
    const e10 = rows.find(r => /Processing Fees - Express/i.test(r.feeType) && /10\s*days/i.test(r.description || ""));
    if (inputs.enableExpress) {
      const days = inputs.expressDays === 4 ? 4 : 10;
      const src = days === 4 ? e4 : e10;
      const fee = amtFrom(src?.amount) ?? (days === 4 ? 50000 : 20000);
      add(`Express Service (HL) – ${days} days`, fee, undefined, src?.source);
    }

    // Optional ancillary services - excluded from upfront calculation as they are not mandatory
    // These are available but not included in standard loan processing:
    // - Deed of Release (≤ 1M): LKR 4,500
    // - Deed of Release (> 1M): LKR 9,000  
    // - Deed of Postponement: LKR 2,500
    
    // Only include mandatory ancillaries like Cancellation of Mortgage Bond when client loses documents
    const cancelMb = rows.find(r => /Cancellation of Mortgage bond/i.test(r.feeType));
    if (cancelMb) add("Cancellation of Mortgage Bond (lost by client)", amtFrom(cancelMb.amount), undefined, cancelMb.source);
  }

  // === Personal Loans ===
  if (inputs.product === "Personal Loans") {
    const slabUp = rows.find(r => r.product === "Personal Loan" && r.feeType === "Processing Fees" && /Upto\s*Rs\.?\s*1\s*Mn/i.test(r.description || ""));
    const slabMid = rows.find(r => r.product === "Personal Loan" && r.feeType === "Processing Fees" && /(from\s*Rs\.?\s*1,?000,?001\s*to\s*Rs\.?\s*3\s*Mn|1,?000,?001\s*to\s*3\s*Mn)/i.test(r.description || ""));
    const slabHi = rows.find(r => r.product === "Personal Loan" && r.feeType === "Processing Fees" && /Above\s*Rs\.?\s*3,?000,?001/i.test(r.description || ""));
    const A = inputs.amount;
    let fee = 0;
    let selectedRow: typeof slabUp;
    
    if (A <= 1_000_000 && slabUp) {
      fee = amtFrom(slabUp.amount) ?? 5000;
      selectedRow = slabUp;
    } else if (A <= 3_000_000 && slabMid) {
      fee = amtFrom(slabMid.amount) ?? 8500;
      selectedRow = slabMid;
    } else if (slabHi) {
      fee = amtFrom(slabHi.amount) ?? 10000;
      selectedRow = slabHi;
    }

    out.processing = { 
      label: "Service Charge (includes CRIB for applicant + joint + 2 guarantors)", 
      amountLKR: fee, 
      ruleRef: selectedRow?.source || "NSB tariff" 
    };

    if (inputs.extraCribParties && inputs.extraCribParties > 0) {
      const crib = rows.find(r => /CRIB report/i.test(r.feeType));
      add("Additional CRIB (beyond bundle)", 250 * inputs.extraCribParties, undefined, crib?.source);
    }
  }

  // === Education Loans ===
  // (CRIB and note only)

  // Early settlement
  const early = rows.find(r => /Early Settlement Charges/i.test(r.feeType) && /5\.?0*%/.test(r.amount));
  if (early) (out.notes ??= []).push("Early settlement charge: 5% (not included upfront)");

  return out;
}