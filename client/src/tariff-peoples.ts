// client/src/tariff-peoples.ts
// People's Bank Tariff Calculator

import type { UserInputs, TariffResult, FeeRow } from "./tariff-calculator";

/**
 * Compute People's Bank Legal Tariffs based on loan amount tiers and fixed charges
 * Logic from https://www.peoplesbank.lk/roastoth/2023/12/Legal-Charges.pdf
 */
export function computePeoplesTariffs(
  loanAmountLKR: number
): TariffResult {
  // Note: In future, we could use tariffRows parameter to extract these values dynamically
  // For now, using hardcoded values from the PDF specification

  // Legal Fee Percentage Tiers (Bank Law Officers)
  const legalTiers = [
    { max: 1_000_000, rate: 1.25 },
    { max: 25_000_000, rate: 1.00 },
    { max: 50_000_000, rate: 0.80 },
    { max: 75_000_000, rate: 0.75 },
    { max: 100_000_000, rate: 0.50 },
    { max: Infinity, rate: 0.25 }
  ];

  // Find the appropriate tier for the loan amount
  const tier = legalTiers.find(t => loanAmountLKR <= t.max) || legalTiers[legalTiers.length - 1];
  const legalFeePercent = tier.rate / 100;
  const legalFee = loanAmountLKR * legalFeePercent;

  // Fixed Legal Charges
  const fixedCharges = [
    { 
      label: "Examination of Title (≤ 500K)", 
      amount: loanAmountLKR <= 500_000 ? 2_500 : 0 
    },
    { 
      label: "Examination of Title (> 500K)", 
      amount: loanAmountLKR > 500_000 ? 4_500 : 0 
    },
    { 
      label: "Land Registry Extract (per extract)", 
      amount: 1_000 
    },
    { 
      label: "Additional Registry Extract", 
      amount: 1_500 
    }
  ];

  const fixedSum = fixedCharges.reduce((sum, charge) => sum + charge.amount, 0);
  
  // Round to nearest 10 LKR
  const upfrontTotal = Math.round((legalFee + fixedSum) / 10) * 10;

  // Build fee rows for display
  const rows: FeeRow[] = [
    {
      key: "legal_percentage",
      label: `Legal Fee (Bank Law Officers) - ${tier.rate}%`,
      amount: Math.round(legalFee),
      basis: "percent",
      note: `${tier.rate}% of loan amount LKR ${loanAmountLKR.toLocaleString()}`
    }
  ];

  // Add only the applicable fixed charges
  fixedCharges
    .filter(charge => charge.amount > 0)
    .forEach((charge, index) => {
      rows.push({
        key: `fixed_legal_${index}`,
        label: charge.label,
        amount: charge.amount,
        basis: "flat"
      });
    });

  return {
    rows,
    subtotalProcessing: 0,
    subtotalLegal: upfrontTotal,
    subtotalValuation: 0,
    applicationFeePaidUpfront: 0,
    grandTotalDueAtDisbursement: upfrontTotal,
    grandTotalCashOutflow: upfrontTotal,
  };
}

/**
 * Main People's Bank tariff calculator entry point
 * Maps Union Bank product types to People's Bank equivalents
 */
export function calculatePeoplesTariff(inputs: UserInputs): TariffResult {
  // Personal Loans do not have legal fees - exclude them
  if (inputs.product === "PersonalLoan" || inputs.product.startsWith("PersonalLoan")) {
    return {
      rows: [],
      subtotalProcessing: 0,
      subtotalLegal: 0,
      subtotalValuation: 0,
      applicationFeePaidUpfront: 0,
      grandTotalDueAtDisbursement: 0,
      grandTotalCashOutflow: 0,
    };
  }
  
  // All other loan types (Housing Loans, LAP, etc.) include legal fees
  return computePeoplesTariffs(inputs.loanAmount);
}