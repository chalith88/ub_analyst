export type Bank = {
  key: string;
  label: string;
  url: string;
};

export type ScrapeStatus = "idle" | "running" | "done" | "error";

export type PanelState = {
  status: Record<string, ScrapeStatus>;
  counts: Record<string, number>;
  errors: Record<string, string | undefined>;
  lastRun: Record<string, string | undefined>;
};

export type ProductKey = "HL" | "PL" | "LAP" | "EL";
export type TariffFeeType = "processing" | "legal" | "valuation" | "crib" | "early_settlement" | "stamp_duty" | "penalty" | "other";
export type TariffBasis = "percent" | "flat" | "actuals";

export type RateRow = {
  bank: string;
  product: ProductKey | string;
  type: "Fixed" | "Floating" | "Fixed & Floating" | string;
  tenureLabel?: string;
  tenureYears?: number;
  rate?: number;
  fixedYears?: number;
  source?: string;
  updatedAt?: string;
  notes?: string;
};

export type TariffRow = {
  bank: string;
  product: ProductKey;
  feeType: TariffFeeType;
  feeTypeRaw?: string;
  basis: TariffBasis;
  description?: string;
  value?: number;
  min?: number;
  max?: number;
  amount?: string;
  updatedAt?: string;
  notes?: string;
  source?: string;
};