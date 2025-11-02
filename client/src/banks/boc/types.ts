// BOC-specific types and interfaces
export interface BocRateRow {
  bank: string;
  product: string;
  type: string;
  tenureLabel: string;
  rateWithSalary: string;
  rateWithoutSalary: string;
  source: string;
  updatedAt: string;
  notes?: string;
  tenureYears: number;
}

export interface BocTariffRow {
  bank: string;
  product: string;
  feeCategory: string;
  description: string;
  amount: string;
  updatedAt: string;
  source: string;
}

export interface BocRateResult {
  label: string;
  rate: number;
  source: string;
  notes?: string;
}

export interface BocTariffResult {
  processingFee: {
    label: string;
    amount: number;
    formula: string;
    capNote?: string;
  };
  earlySettlement?: {
    tiers: Array<{
      window: string;
      rate: number;
    }>;
  };
  otherFees?: Array<{
    label: string;
    amount: number | string;
    note?: string;
  }>;
  source: string;
}

export interface BocCalculatorInputs {
  product: "Home Loans" | "Loan Against Property" | "Personal Loans" | "Education Loans";
  loanAmount: number;
  tenureYears: number;
}