// HNB Tariff Calculator (Documentation Charges)
// All products use the same documentation charge slabs based on loan amount

import type { FeeRow, TariffResult } from "./tariff-calculator";

const CAP = 400_000;

/**
 * Calculate HNB documentation charge based on loan amount slabs
 * Applies to all products: Home Loan, LAP, Personal Loan, Education Loan
 */
export function hnbDocumentationCharge(loanAmount: number): number {
  if (loanAmount <= 1_000_000) return 10_000;
  if (loanAmount <= 5_000_000) return 20_000;
  if (loanAmount <= 10_000_000) return 30_000;
  if (loanAmount <= 25_000_000) return 50_000;
  if (loanAmount <= 50_000_000) return 75_000;
  
  // 0.2% with cap of 400,000 for amounts above 50M
  const pct = Math.round(loanAmount * 0.002);
  return Math.min(pct, CAP);
}

/**
 * Get human-readable basis description for the documentation charge
 */
function getDocChargeBasis(loanAmount: number, amount: number): string {
  if (amount >= CAP) return "0.2% (capped at 400,000)";
  if (loanAmount <= 1_000_000) return "Fixed slab: Rs. 10,000";
  if (loanAmount <= 5_000_000) return "Fixed slab: Rs. 20,000";
  if (loanAmount <= 10_000_000) return "Fixed slab: Rs. 30,000";
  if (loanAmount <= 25_000_000) return "Fixed slab: Rs. 50,000";
  if (loanAmount <= 50_000_000) return "Fixed slab: Rs. 75,000";
  return "0.2% of loan amount";
}

/**
 * Calculate complete HNB tariff (currently only documentation charges)
 */
export function calculateHnbTariff(loanAmount: number): TariffResult {
  const amount = hnbDocumentationCharge(loanAmount);

  const rows: FeeRow[] = [
    {
      key: "documentation_charges",
      label: "Documentation Charges (HNB)",
      amount,
      basis: getDocChargeBasis(loanAmount, amount),
      note: "Applies to all loan products",
    },
  ];

  return {
    rows,
    subtotalProcessing: amount,
    subtotalLegal: 0,
    subtotalValuation: 0,
    applicationFeePaidUpfront: 0,
    grandTotalDueAtDisbursement: amount,
    grandTotalCashOutflow: amount,
  };
}
