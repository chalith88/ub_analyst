// Commercial Bank Tariff Calculator
// Supports: Home Loan (HL), Loan Against Property (LAP), Personal Loan (PL)
// Source: "Charges on Advances" and "Personal Loans Setting Up Charges"

import type { FeeRow, TariffResult } from "./tariff-calculator";

// Utility function
function roundPercent(n: number, pct: number): number {
  return Math.round(n * pct);
}

// ============================================================================
// 1) HOME LOANS / LAP — PROCESSING FEE (SAME SLAB)
// ============================================================================
// Slabs by loan amount:
// - Up to Rs. 500,000 → Rs. 7,500
// - Rs. 500,001 - 1,000,000 → Rs. 12,500
// - Rs. 1,000,001 - 5,000,000 → Rs. 22,500
// - Rs. 5,000,001 - 10,000,000 → Rs. 35,000
// - Rs. 10,000,001 - 25,000,000 → Rs. 45,000
// - Rs. 25,000,001 - 50,000,000 → Rs. 55,000
// - Rs. 50,000,001 - 100,000,000 → Rs. 80,000
// - Rs. 100,000,001 - 500,000,000 → 0.05% of facility
// - Rs. 500,000,001 - 1,000,000,000 → 0.06% of facility
// - Over Rs. 1,000,000,000 → 0.06% of facility

export function combankProcessingHL(loanAmount: number): number {
  if (loanAmount <= 500_000) return 7_500;
  if (loanAmount <= 1_000_000) return 12_500;
  if (loanAmount <= 5_000_000) return 22_500;
  if (loanAmount <= 10_000_000) return 35_000;
  if (loanAmount <= 25_000_000) return 45_000;
  if (loanAmount <= 50_000_000) return 55_000;
  if (loanAmount <= 100_000_000) return 80_000;
  if (loanAmount <= 500_000_000) return roundPercent(loanAmount, 0.0005);
  if (loanAmount <= 1_000_000_000) return roundPercent(loanAmount, 0.0006);
  // Over 1B: same as previous tier (0.06%)
  return roundPercent(loanAmount, 0.0006);
}

function getProcessingBasisHL(loanAmount: number): string {
  if (loanAmount <= 500_000) return "Fixed: Rs. 7,500";
  if (loanAmount <= 1_000_000) return "Fixed: Rs. 12,500";
  if (loanAmount <= 5_000_000) return "Fixed: Rs. 22,500";
  if (loanAmount <= 10_000_000) return "Fixed: Rs. 35,000";
  if (loanAmount <= 25_000_000) return "Fixed: Rs. 45,000";
  if (loanAmount <= 50_000_000) return "Fixed: Rs. 55,000";
  if (loanAmount <= 100_000_000) return "Fixed: Rs. 80,000";
  if (loanAmount <= 500_000_000) return "0.05% of facility";
  return "0.06% of facility";
}

// ============================================================================
// 2) PERSONAL LOANS — PROCESSING FEE
// ============================================================================
// Slabs by loan amount:
// - Up to Rs. 500,000 → Rs. 7,000
// - Rs. 500,001 - 1,000,000 → Rs. 10,000
// - Rs. 1,000,001 - 3,000,000 → Rs. 12,500
// - Rs. 3,000,001 - 5,000,000 → Rs. 17,500
// - Rs. 5,000,001 - 8,000,000 → Rs. 28,000
// - Over Rs. 8,000,000 → 0.60% of facility
// - Top-Up (any amount) → 0.40% with min Rs. 4,000

export function combankProcessingPL(
  loanAmount: number,
  purpose?: "TopUp"
): number {
  if (purpose === "TopUp") {
    return Math.max(roundPercent(loanAmount, 0.004), 4_000);
  }
  if (loanAmount <= 500_000) return 7_000;
  if (loanAmount <= 1_000_000) return 10_000;
  if (loanAmount <= 3_000_000) return 12_500;
  if (loanAmount <= 5_000_000) return 17_500;
  if (loanAmount <= 8_000_000) return 28_000;
  // Over 8M: 0.60%
  return roundPercent(loanAmount, 0.006);
}

function getProcessingBasisPL(loanAmount: number, purpose?: "TopUp"): string {
  if (purpose === "TopUp") return "0.40% of facility (min Rs. 4,000)";
  if (loanAmount <= 500_000) return "Fixed: Rs. 7,000";
  if (loanAmount <= 1_000_000) return "Fixed: Rs. 10,000";
  if (loanAmount <= 3_000_000) return "Fixed: Rs. 12,500";
  if (loanAmount <= 5_000_000) return "Fixed: Rs. 17,500";
  if (loanAmount <= 8_000_000) return "Fixed: Rs. 28,000";
  return "0.60% of facility";
}

// ============================================================================
// MAIN CALCULATOR
// ============================================================================

export interface CombankInputs {
  product: "HomeLoan" | "LAP" | "PersonalLoan";
  loanAmount: number;
  purpose?: "TopUp"; // For Personal Loan top-up (0.40% with min 4k)
}

export function calculateCombankTariff(inputs: CombankInputs): TariffResult {
  const rows: FeeRow[] = [];
  let processing = 0;

  if (inputs.product === "PersonalLoan") {
    processing = combankProcessingPL(inputs.loanAmount, inputs.purpose);
    rows.push({
      key: "processing",
      label: "Processing Fee (Personal Loan)",
      amount: processing,
      basis: getProcessingBasisPL(inputs.loanAmount, inputs.purpose),
    });
  } else {
    // HomeLoan or LAP (same slab)
    processing = combankProcessingHL(inputs.loanAmount);
    rows.push({
      key: "processing",
      label: `Processing Fee (${inputs.product === "HomeLoan" ? "Home Loan" : "LAP"})`,
      amount: processing,
      basis: getProcessingBasisHL(inputs.loanAmount),
    });
  }

  const zero = 0;
  const total = processing;

  return {
    rows,
    subtotalProcessing: processing,
    subtotalLegal: zero,
    subtotalValuation: zero,
    applicationFeePaidUpfront: zero,
    grandTotalDueAtDisbursement: total,
    grandTotalCashOutflow: total,
  };
}
