// Seylan Bank - Type Definitions for Rate Selection

export type SeylanProduct = "HomeLoan" | "LAP" | "PersonalLoan";

export type SalaryRelationship = "Assignment" | "Remittance" | "None";

export type SalaryBand = ">=700k" | "150k-699k" | "Other";

export type PersonalLoanTier = "Tier1" | "Tier2" | "Tier3";

export interface RateInputs {
  product: SeylanProduct;
  tenureYears: number;
  loanAmount: number;

  // For HL/LAP rate buckets
  salaryRelationship?: SalaryRelationship;
  salaryBand?: SalaryBand;
  usesCreditAndInternet?: boolean; // "With Credit Card & Internet Banking" vs "Without"

  // For Personal Loan tiers
  personalLoanTier?: PersonalLoanTier; // Tier1 = Professionals >= 300k, Tier2 = 200k-299k, Tier3 = CAT A/B >= 200k
}

export interface RateRow {
  key: string;
  label: string;
  ratePct: number;
  basis?: string;
  note?: string;
}

export interface RateResult {
  rows: RateRow[];
  bestRatePct: number;
  source: string;
  note?: string;
}

export class SeylanRateNotFoundError extends Error {
  public context: {
    product?: string;
    tenure?: number;
    salaryRelationship?: string;
    salaryBand?: string;
    tier?: string;
  };

  constructor(
    message: string,
    context: {
      product?: string;
      tenure?: number;
      salaryRelationship?: string;
      salaryBand?: string;
      tier?: string;
    }
  ) {
    super(message);
    this.name = "SeylanRateNotFoundError";
    this.context = context;
  }
}

// Raw rate data structure from JSON
export interface RawSeylanRate {
  bank: string;
  product: string;
  type: string;
  tenureLabel: string;
  tenureYears: number;
  source: string;
  updatedAt: string;
  notes?: string;

  // Home Loan / LAP rate columns
  rateWithSalaryAbove700kCreditCardInternetBanking?: string;
  rateWithSalaryAbove700k?: string;
  rateWithSalaryBelow700kCreditCardInternetBanking?: string;
  rateWithSalaryBelow700k?: string;
  rateWithoutSalaryWithCreditCardInternetBanking?: string;
  rateWithoutSalary?: string;

  // Personal Loan rate columns (3 tiers × 2 columns)
  ratePLTier1WithCreditCardInternetBanking?: string;
  ratePLTier1WithoutCreditCardInternetBanking?: string;
  ratePLTier2WithCreditCardInternetBanking?: string;
  ratePLTier2WithoutCreditCardInternetBanking?: string;
  ratePLTier3WithCreditCardInternetBanking?: string;
  ratePLTier3WithoutCreditCardInternetBanking?: string;

  // Education Loan rate columns (secured/unsecured)
  rateEduSecuredWithCreditCardInternetBanking?: string;
  rateEduSecuredWithoutCreditCardInternetBanking?: string;
  rateEduUnsecuredWithCreditCardInternetBanking?: string;
  rateEduUnsecuredWithoutCreditCardInternetBanking?: string;
}
