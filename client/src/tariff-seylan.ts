// Seylan Bank Tariff Calculator
// Supports: Home Loan (HL), Loan Against Property (LAP), Personal Loan (PL)

import type { FeeRow, TariffResult } from "./tariff-calculator";

// Utility functions
function pct(amount: number, rate: number): number {
  return Math.round(amount * rate);
}

function clamp(n: number, min?: number, max?: number): number {
  if (min != null && n < min) n = min;
  if (max != null && n > max) n = max;
  return n;
}

// ============================================================================
// A) PROCESSING FEE - HL & LAP
// ============================================================================
// 0.5% of loan amount, min 15k, max 200k

function seylanHlLapProcessing(loanAmount: number): number {
  return clamp(pct(loanAmount, 0.005), 15_000, 200_000);
}

// ============================================================================
// B) MORTGAGE BOND (LEGAL) FEE - HL & LAP
// ============================================================================
// Tiered structure based on loan amount

function seylanMortgageBond(loanAmount: number): number {
  if (loanAmount <= 5_000_000) {
    // 1% with min 10,000
    return clamp(pct(loanAmount, 0.01), 10_000);
  }
  
  if (loanAmount <= 25_000_000) {
    // 50,000 + 0.5% on balance over 5M
    return 50_000 + pct(loanAmount - 5_000_000, 0.005);
  }
  
  // Above 25M: 150,000 + 0.25% on balance over 25M
  return 150_000 + pct(loanAmount - 25_000_000, 0.0025);
}

function getMortgageBondBasis(loanAmount: number): string {
  if (loanAmount <= 5_000_000) return "1% (min 10,000)";
  if (loanAmount <= 25_000_000) return "50,000 + 0.5% over 5M";
  return "150,000 + 0.25% over 25M";
}

// ============================================================================
// C) TITLE REPORT - HL & LAP
// ============================================================================

function seylanTitleReport(isCondominium: boolean): number {
  return isCondominium ? 10_000 : 7_500;
}

// ============================================================================
// D) VALUATION FEE - HL & LAP
// ============================================================================
// Tiered per million with cumulative caps

function seylanValuation(propertyValue: number): {
  amount: number;
  basis: string;
  negotiable?: boolean;
} {
  const mn = propertyValue / 1_000_000;
  
  if (mn <= 1) {
    return { amount: 5_000, basis: "Up to 1Mn (min 5,000)" };
  }
  
  if (mn <= 20) {
    const raw = Math.round(mn * 750);
    return {
      amount: Math.min(raw, 19_250),
      basis: "750 per Mn (cap 19,250)",
    };
  }
  
  if (mn <= 50) {
    const raw = Math.round(mn * 500);
    return {
      amount: Math.min(raw, 34_250),
      basis: "500 per Mn (cap 34,250)",
    };
  }
  
  if (mn <= 100) {
    const raw = Math.round(mn * 250);
    return {
      amount: Math.min(raw, 46_750),
      basis: "250 per Mn (cap 46,750)",
    };
  }
  
  if (mn <= 500) {
    const raw = Math.round(mn * 100);
    return {
      amount: Math.min(raw, 86_750),
      basis: "100 per Mn (cap 86,750)",
    };
  }
  
  // Above 500M
  return {
    amount: 0,
    basis: "Negotiable (>500Mn)",
    negotiable: true,
  };
}

// ============================================================================
// E) INSPECTION FEES - HL & LAP
// ============================================================================

const INSPECTION_FEE_FLAT = 2_000;
const INSPECTION_FEE_PER_STAGE = 2_000;

// ============================================================================
// F) PERSONAL LOAN PROCESSING
// ============================================================================
// Normal vs FastTrack slabs

function seylanPlProcessing(
  loanAmount: number,
  speed: "Normal" | "FastTrack" = "Normal"
): number {
  const isFast = speed === "FastTrack";
  
  if (loanAmount <= 1_000_000) {
    return isFast ? 12_500 : 7_500;
  }
  
  if (loanAmount <= 3_000_000) {
    return isFast ? 15_000 : 10_000;
  }
  
  if (loanAmount <= 5_000_000) {
    return isFast ? 25_000 : 15_000;
  }
  
  if (loanAmount <= 7_000_000) {
    return isFast ? 30_000 : 20_000;
  }
  
  // Above 7M: percentage with cap
  const rate = isFast ? 0.005 : 0.004; // 0.5% or 0.4%
  const cap = isFast ? 50_000 : 40_000;
  return Math.min(pct(loanAmount, rate), cap);
}

function getPlProcessingBasis(
  loanAmount: number,
  speed: "Normal" | "FastTrack"
): string {
  const isFast = speed === "FastTrack";
  
  if (loanAmount <= 1_000_000) return `Fixed: ${isFast ? "12,500" : "7,500"}`;
  if (loanAmount <= 3_000_000) return `Fixed: ${isFast ? "15,000" : "10,000"}`;
  if (loanAmount <= 5_000_000) return `Fixed: ${isFast ? "25,000" : "15,000"}`;
  if (loanAmount <= 7_000_000) return `Fixed: ${isFast ? "30,000" : "20,000"}`;
  
  return isFast
    ? "0.5% (cap 50,000)"
    : "0.4% (cap 40,000)";
}

// ============================================================================
// MAIN CALCULATOR
// ============================================================================

export interface SeylanInputs {
  product: "HomeLoan" | "LAP" | "PersonalLoan";
  loanAmount: number;
  propertyValue?: number;
  personalSpeed?: "Normal" | "FastTrack";
  isCondominium?: boolean;
  // Title Report and Inspection fees default to TRUE for HL/LAP (as per Seylan tariff structure)
  includeTitleReport?: boolean; // Default: true for HL/LAP
  includeInspectionFlat?: boolean; // Default: true for HL/LAP
  constructionInspectionCount?: number;
}

export function calculateSeylanTariff(inputs: SeylanInputs): TariffResult {
  const rows: FeeRow[] = [];
  let proc = 0;
  let legal = 0;
  let val = 0;
  const appUpfront = 0;
  
  if (inputs.product === "PersonalLoan") {
    // Personal Loan - Processing only
    const speed = inputs.personalSpeed || "Normal";
    proc = seylanPlProcessing(inputs.loanAmount, speed);
    
    rows.push({
      key: "processing",
      label: `Processing Fee (Seylan PL — ${speed})`,
      amount: proc,
      basis: getPlProcessingBasis(inputs.loanAmount, speed),
    });
  } else {
    // Home Loan or LAP
    
    // 1) Processing Fee
    proc = seylanHlLapProcessing(inputs.loanAmount);
    rows.push({
      key: "processing",
      label: "Processing Fee (Seylan HL/LAP)",
      amount: proc,
      basis: "0.5% (min 15k, max 200k)",
    });
    
    // 2) Mortgage Bond
    const bond = seylanMortgageBond(inputs.loanAmount);
    legal += bond;
    rows.push({
      key: "mortgage_bond",
      label: "Mortgage Bond Fee (Seylan)",
      amount: bond,
      basis: getMortgageBondBasis(inputs.loanAmount),
    });
    
    // 3) Title Report (default: included for HL/LAP)
    const shouldIncludeTitleReport = inputs.includeTitleReport ?? true; // Default TRUE
    if (shouldIncludeTitleReport) {
      const isCondo = inputs.isCondominium || false;
      const tr = seylanTitleReport(isCondo);
      legal += tr;
      rows.push({
        key: "title_report",
        label: `Title Report${isCondo ? " (Condominium)" : ""}`,
        amount: tr,
        basis: isCondo ? "Condominium property" : "Standard property",
      });
    }
    
    // 4) Property Inspection (flat, default: included for HL/LAP)
    const shouldIncludeInspectionFlat = inputs.includeInspectionFlat ?? true; // Default TRUE
    if (shouldIncludeInspectionFlat) {
      legal += INSPECTION_FEE_FLAT;
      rows.push({
        key: "inspection_flat",
        label: "Property Inspection (flat)",
        amount: INSPECTION_FEE_FLAT,
        basis: "Flat fee",
      });
    }
    
    // 5) Construction Inspections (per stage)
    const stageCount = Math.max(0, Math.floor(inputs.constructionInspectionCount || 0));
    if (stageCount > 0) {
      const amt = INSPECTION_FEE_PER_STAGE * stageCount;
      legal += amt;
      rows.push({
        key: "inspection_construction",
        label: `Construction Stage Inspections × ${stageCount}`,
        amount: amt,
        basis: "2,000 per stage",
      });
    }
    
    // 6) Valuation Fee
    if (inputs.propertyValue && inputs.propertyValue > 0) {
      const { amount, basis, negotiable } = seylanValuation(inputs.propertyValue);
      
      if (negotiable) {
        rows.push({
          key: "valuation",
          label: "Valuation Fee (Negotiable)",
          amount: 0,
          note: "Property value over 500Mn - negotiable",
        });
      } else {
        val += amount;
        rows.push({
          key: "valuation",
          label: "Valuation Fee (Seylan)",
          amount,
          basis,
        });
      }
    }
  }
  
  const grandDue = proc + legal + val;
  
  return {
    rows,
    subtotalProcessing: proc,
    subtotalLegal: legal,
    subtotalValuation: val,
    applicationFeePaidUpfront: appUpfront,
    grandTotalDueAtDisbursement: grandDue,
    grandTotalCashOutflow: grandDue + appUpfront,
  };
}
