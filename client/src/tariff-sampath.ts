// Sampath Bank Tariff Calculator
// Supports: Home Loan (HL), Loan Against Property (LAP), Personal Loan (PL)

import type { FeeRow, TariffResult } from "./tariff-calculator";

// Utility function
function round(n: number): number {
  return Math.round(n);
}

// ============================================================================
// 1) PROCESSING / ADVANCES FEE
// ============================================================================
// Applies to all products (HL, LAP, PL) - new facilities/enhancements
// Slabs by loan amount:
// - Up to Rs. 500,000 → Rs. 5,000
// - Rs. 500,001 - 1,000,000 → Rs. 10,000
// - Rs. 1,000,001 - 5,000,000 → Rs. 20,000
// - Rs. 5,000,001 - 10,000,000 → Rs. 25,000
// - Above Rs. 10,000,000 → 0.25% of loan amount

export function sampathProcessing(loanAmount: number): number {
  if (loanAmount <= 500_000) return 5_000;
  if (loanAmount <= 1_000_000) return 10_000;
  if (loanAmount <= 5_000_000) return 20_000;
  if (loanAmount <= 10_000_000) return 25_000;
  // Above 10M: 0.25%
  return round(loanAmount * 0.0025);
}

function getProcessingBasis(loanAmount: number): string {
  if (loanAmount <= 500_000) return "Fixed: Rs. 5,000";
  if (loanAmount <= 1_000_000) return "Fixed: Rs. 10,000";
  if (loanAmount <= 5_000_000) return "Fixed: Rs. 20,000";
  if (loanAmount <= 10_000_000) return "Fixed: Rs. 25,000";
  return "0.25% of loan amount";
}

// ============================================================================
// 2) LEGAL CHARGES — DOCUMENTATION BY BANK LEGAL OFFICERS
// ============================================================================
// For HL/LAP only; uses bond value = loan amount
// Slabs:
// - Up to Rs. 1,000,000 → 1.00%
// - Rs. 1,000,001 - 5,000,000 → 0.75%
// - Rs. 5,000,001 - 10,000,000 → 0.50%
// - Over Rs. 10,000,001 → 0.25%

export function sampathLegalBond(loanAmount: number): number {
  if (loanAmount <= 1_000_000) return round(loanAmount * 0.01);
  if (loanAmount <= 5_000_000) return round(loanAmount * 0.0075);
  if (loanAmount <= 10_000_000) return round(loanAmount * 0.005);
  // Above 10M: 0.25%
  return round(loanAmount * 0.0025);
}

function getLegalBondBasis(loanAmount: number): string {
  if (loanAmount <= 1_000_000) return "1.00% of bond value";
  if (loanAmount <= 5_000_000) return "0.75% of bond value";
  if (loanAmount <= 10_000_000) return "0.50% of bond value";
  return "0.25% of bond value";
}

// ============================================================================
// 3) MORTGAGE HANDLING FEE (OPTIONAL)
// ============================================================================
// LKR 5,000 per property (excludes external agent costs)
const MORTGAGE_HANDLING_FEE = 5_000;

// ============================================================================
// MAIN CALCULATOR
// ============================================================================

export interface SampathInputs {
  product: "HomeLoan" | "LAP" | "PersonalLoan";
  loanAmount: number;
  includeMortgageHandling?: boolean; // Adds Rs. 5,000 (property mortgage value-added service)
}

export function calculateSampathTariff(inputs: SampathInputs): TariffResult {
  const rows: FeeRow[] = [];
  let proc = 0;
  let legal = 0;
  let val = 0;
  const appUpfront = 0;

  // 1) Processing / Advances Fee (all products)
  proc = sampathProcessing(inputs.loanAmount);
  rows.push({
    key: "processing",
    label: "Processing / Advances Fee (Sampath)",
    amount: proc,
    basis: getProcessingBasis(inputs.loanAmount),
  });

  // 2) Legal Charges - Bond (HL/LAP only)
  if (inputs.product !== "PersonalLoan") {
    const bond = sampathLegalBond(inputs.loanAmount);
    legal += bond;
    rows.push({
      key: "legal_bond",
      label: "Legal Charges (Bond) — Bank Legal Officers",
      amount: bond,
      basis: getLegalBondBasis(inputs.loanAmount),
    });
  }

  // 3) Mortgage Handling Fee (optional, HL/LAP)
  if (inputs.includeMortgageHandling && inputs.product !== "PersonalLoan") {
    legal += MORTGAGE_HANDLING_FEE;
    rows.push({
      key: "mortgage_handling",
      label: "Mortgage Handling Fee (per property)",
      amount: MORTGAGE_HANDLING_FEE,
      basis: "Fixed fee",
      note: "Excludes external agent costs",
    });
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
