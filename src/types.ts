// src/types.ts

export type RateRow = {
  bank: string;
  product: "Home Loan" | "Personal Loan" | "LAP" | "Education Loan" | string;
  type: "Fixed" | "Floating" | "Fixed & Floating" | string;

  // Tenure info
  tenureLabel?: string;
  tenureYears?: number;

  // ── Generic fields (used by HNB and others)
  rateWithSalary?: string;
  rateWithoutSalary?: string;
  rateWithSalaryCreditCardInternetBanking?: string;

  // ── Seylan-specific explicit fields (6 variations)
  rateWithSalaryAbove700k?: string;
  rateWithSalaryAbove700kCreditCardInternetBanking?: string;
  rateWithSalaryBelow700k?: string;
  rateWithSalaryBelow700kCreditCardInternetBanking?: string;
  rateWithoutSalary?: string; // "Others (%)" without CC & IB
  rateWithoutSalaryWithCreditCardInternetBanking?: string; // "Others (%)" with CC & IB

  // Education (Seylan Scholar)
  rateEduSecuredWithCreditCardInternetBanking?: string;
  rateEduSecuredWithoutCreditCardInternetBanking?: string;
  rateEduUnsecuredWithCreditCardInternetBanking?: string;
  rateEduUnsecuredWithoutCreditCardInternetBanking?: string;

  // Meta
  source: string;
  updatedAt: string;
  notes?: string;
};
