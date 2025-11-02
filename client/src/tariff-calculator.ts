// client/src/tariff-calculator.ts
// Multi-Bank Tariff Calculator with Router

export type Bank = "UnionBank" | "HNB" | "Seylan" | "Sampath" | "CommercialBank" | "NDB" | "PeoplesBank";

export type Product =
  | "PersonalLoan"
  | "PersonalLoan_Green"
  | "HousingLoan"
  | "HousingLoan_EmployedAbroad"
  | "HousingLoan_Green"
  | "LAP"
  | "LAP_EmployedAbroad"
  | "LAP_Green"
  | "EducationLoan";

export interface UserInputs {
  bank?: Bank; // Optional for backward compatibility, defaults to UnionBank
  loanAmount: number;
  product: Product;
  propertyValue?: number;
  usePanelLawyer?: boolean;
  tripartite?: "None" | "Standard" | "HomeLoanPlus";
  includeTitleClearance?: boolean;
  deductApplicationFeeAtDisbursement?: boolean; // default true
  // Seylan-specific fields
  personalSpeed?: "Normal" | "FastTrack";
  isCondominium?: boolean;
  includeTitleReport?: boolean;
  includeInspectionFlat?: boolean;
  constructionInspectionCount?: number;
  // Sampath-specific fields
  includeMortgageHandling?: boolean;
  // NDB-specific fields
  tenureYears?: number;
  isProfessional?: boolean;
  plChannel?: "Standard" | "FastTrack" | "MortgagedBack";
  bondType?: "Primary" | "Further";
  addTripartiteCondo?: boolean;
  addTransferApproval?: boolean;
  addRelease?: boolean;
  addPartRelease?: boolean;
  addOtherDeeds?: boolean;
  specialAgreementAmount?: number;
  preferMinFloating?: boolean;
}

export interface FeeRow {
  key: string;
  label: string;
  amount: number;
  basis?: string;
  note?: string;
}

export interface TariffResult {
  rows: FeeRow[];
  subtotalProcessing: number;
  subtotalLegal: number;
  subtotalValuation: number;
  applicationFeePaidUpfront: number;
  grandTotalDueAtDisbursement: number;
  grandTotalCashOutflow: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const APPLICATION_FEE = 10_000; // 12.03 - Housing/LAP only

// Personal Loan Processing (12.01)
const PL_PROCESSING = [
  { max: 999_999, fee: 8_500 },
  { max: 4_999_999, fee: 11_000 },
  { max: Infinity, fee: 12_500 },
];

// Personal Loan Green Channel (12.02)
const PL_GREEN_PROCESSING = [
  { max: 999_999, fee: 11_000 },
  { max: 4_999_999, fee: 13_500 },
  { max: Infinity, fee: 15_000 },
];

// Housing Processing (12.04/12.05/12.06)
const HOUSING_STANDARD = { rate: 0.004, min: 25_000, max: 100_000 };
const HOUSING_ABROAD = { rate: 0.0075, min: 35_000, max: 150_000 };
const HOUSING_GREEN = { rate: 0.005, min: 25_000, max: 100_000 };

// LAP Processing (12.07/12.08/12.09)
const LAP_STANDARD = { rate: 0.005, min: 25_000, max: 100_000 };
const LAP_ABROAD = { rate: 0.0075, min: 35_000, max: 150_000 };
const LAP_GREEN = { rate: 0.006, min: 25_000, max: 100_000 };

// Legal Fees (12.11)
const LEGAL_TIERS = [
  { max: 4_999_999.99, rate: 0.0075, minFee: 15_000, maxFee: Infinity },
  { max: 9_999_999.99, rate: 0.007, minFee: 37_500, maxFee: Infinity },
  { max: Infinity, rate: 0.0035, minFee: 70_000, maxFee: 175_000 },
];

// Panel Lawyer Charges (12.11 alternative)
const PANEL_LAWYER_TIERS = [
  { min: 500_000, max: 999_999.99, rate: 0.01, minFee: 7_500, maxFee: Infinity },
  { min: 1_000_000, max: 4_999_999.99, rate: 0.0075, minFee: 10_000, maxFee: Infinity },
  { min: 5_000_000, max: Infinity, rate: 0.006, minFee: 30_000, maxFee: 50_000 },
];

// Title Clearance (12.12)
const TITLE_CLEARANCE_FEE = 10_000;

// Tripartite Legal (12.13)
const TRIPARTITE_STANDARD = 25_000; // 12.13a
const TRIPARTITE_HOME_LOAN_PLUS = 50_000; // 12.13b

// Valuation Fees (13.00)
const VALUATION_TIERS = [
  { max: 499_999, fixedFee: 1_250 },
  { max: 999_999, rate: 0.0025 }, // 250 per 100k
  { max: 9_999_999, rate: 0.001 }, // 1000 per Mn
  { max: 19_999_999, rate: 0.0006 }, // 600 per Mn
  { max: 49_999_999, rate: 0.0005 }, // 500 per Mn
  { max: 99_999_999, rate: 0.00025 }, // 250 per Mn
  { max: 500_000_000, rate: 0.0001 }, // 100 per Mn
  { max: Infinity, fixedFee: 0, note: "Negotiable" }, // >500Mn
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToLKR(n: number): number {
  return Math.round(n);
}

export function formatCurrency(n: number): string {
  return `LKR ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ============================================================================
// PROCESSING FEE CALCULATION
// ============================================================================

export function calcProcessingFee(inputs: UserInputs): FeeRow {
  const { loanAmount, product } = inputs;
  let amount = 0;
  let basis = "";
  let label = "";

  if (product === "PersonalLoan") {
    // 12.01 - Tiered flat fees
    const tier = PL_PROCESSING.find((t) => loanAmount <= t.max);
    amount = tier?.fee || PL_PROCESSING[PL_PROCESSING.length - 1].fee;
    label = "Processing Fee (Personal Loan)";
    basis = "Tiered flat fee";
  } else if (product === "PersonalLoan_Green") {
    // 12.02 - Green channel express
    const tier = PL_GREEN_PROCESSING.find((t) => loanAmount <= t.max);
    amount = tier?.fee || PL_GREEN_PROCESSING[PL_GREEN_PROCESSING.length - 1].fee;
    label = "Processing Fee (Personal Loan - Green Channel)";
    basis = "Express tiered flat fee";
  } else if (product.startsWith("HousingLoan")) {
    // 12.04/12.05/12.06
    let config = HOUSING_STANDARD;
    if (product === "HousingLoan_EmployedAbroad") {
      config = HOUSING_ABROAD;
      label = "Processing Fee (Housing - Employed Abroad)";
    } else if (product === "HousingLoan_Green") {
      config = HOUSING_GREEN;
      label = "Processing Fee (Housing - Green Channel)";
    } else {
      label = "Processing Fee (Housing)";
    }

    const calculated = roundToLKR(loanAmount * config.rate);
    amount = clamp(calculated, config.min, config.max);
    basis = `${(config.rate * 100).toFixed(2)}% (Min ${formatCurrency(config.min)}, Max ${formatCurrency(config.max)})`;
  } else if (product.startsWith("LAP")) {
    // 12.07/12.08/12.09
    let config = LAP_STANDARD;
    if (product === "LAP_EmployedAbroad") {
      config = LAP_ABROAD;
      label = "Processing Fee (LAP - Employed Abroad)";
    } else if (product === "LAP_Green") {
      config = LAP_GREEN;
      label = "Processing Fee (LAP - Green Channel)";
    } else {
      label = "Processing Fee (LAP)";
    }

    const calculated = roundToLKR(loanAmount * config.rate);
    amount = clamp(calculated, config.min, config.max);
    basis = `${(config.rate * 100).toFixed(2)}% (Min ${formatCurrency(config.min)}, Max ${formatCurrency(config.max)})`;
  }

  return {
    key: "processing",
    label,
    amount: roundToLKR(amount),
    basis,
  };
}

// ============================================================================
// APPLICATION FEE CALCULATION
// ============================================================================

export function calcApplicationFee(inputs: UserInputs): number {
  const { product } = inputs;
  // 12.03 - Only for Housing/LAP at lodgement
  const isHousingOrLAP = product.startsWith("HousingLoan") || product.startsWith("LAP");
  return isHousingOrLAP ? APPLICATION_FEE : 0;
}

// ============================================================================
// NET PROCESSING AFTER APPLICATION FEE DEDUCTION
// ============================================================================

export function netProcessingAfterApplication(
  processingFee: number,
  applicationFee: number,
  deduct: boolean = true
): number {
  if (!deduct || applicationFee === 0) return processingFee;
  // Never below zero
  return Math.max(0, processingFee - applicationFee);
}

// ============================================================================
// LEGAL FEE CALCULATION
// ============================================================================

export function calcLegal(inputs: UserInputs): FeeRow[] {
  const { product, propertyValue, usePanelLawyer, tripartite, includeTitleClearance } = inputs;
  const rows: FeeRow[] = [];

  // Only for Housing/LAP products
  const isHousingOrLAP = product.startsWith("HousingLoan") || product.startsWith("LAP");
  if (!isHousingOrLAP) return rows;

  const propValue = propertyValue || 0;
  if (propValue <= 0) return rows;

  // Main legal fee (12.11 or Panel Lawyer)
  if (usePanelLawyer) {
    // Panel lawyer charges
    const tier = PANEL_LAWYER_TIERS.find((t) => propValue >= t.min && propValue <= t.max);
    if (tier) {
      const calculated = roundToLKR(propValue * tier.rate);
      const amount = clamp(calculated, tier.minFee, tier.maxFee);
      rows.push({
        key: "legal_panel",
        label: "Legal Fee (Panel Lawyer)",
        amount,
        basis: `${(tier.rate * 100).toFixed(2)}% (Min ${formatCurrency(tier.minFee)}, Max ${formatCurrency(tier.maxFee)})`,
      });
    }
  } else {
    // Standard legal fees (12.11)
    const tier = LEGAL_TIERS.find((t) => propValue <= t.max);
    if (tier) {
      const calculated = roundToLKR(propValue * tier.rate);
      const amount = clamp(calculated, tier.minFee, tier.maxFee);
      rows.push({
        key: "legal_standard",
        label: "Legal Fee",
        amount,
        basis: `${(tier.rate * 100).toFixed(2)}% (Min ${formatCurrency(tier.minFee)}${
          tier.maxFee !== Infinity ? `, Max ${formatCurrency(tier.maxFee)}` : ""
        })`,
      });
    }
  }

  // Title clearance (12.12)
  if (includeTitleClearance) {
    rows.push({
      key: "title_clearance",
      label: "Title Clearance",
      amount: TITLE_CLEARANCE_FEE,
      basis: "Fixed fee",
    });
  }

  // Tripartite legal (12.13)
  if (tripartite === "Standard") {
    rows.push({
      key: "tripartite_standard",
      label: "Tripartite Legal (Standard)",
      amount: TRIPARTITE_STANDARD,
      basis: "Fixed fee (12.13a)",
    });
  } else if (tripartite === "HomeLoanPlus") {
    rows.push({
      key: "tripartite_plus",
      label: "Tripartite Legal (Home Loan+)",
      amount: TRIPARTITE_HOME_LOAN_PLUS,
      basis: "Fixed fee (12.13b)",
    });
  }

  return rows;
}

// ============================================================================
// VALUATION FEE CALCULATION
// ============================================================================

export function calcValuation(propertyValue?: number): FeeRow | null {
  if (!propertyValue || propertyValue <= 0) return null;

  const tier = VALUATION_TIERS.find((t) => propertyValue <= t.max);
  if (!tier) return null;

  if (tier.fixedFee !== undefined) {
    return {
      key: "valuation",
      label: "Valuation Fee",
      amount: tier.fixedFee,
      basis: tier.note || "Fixed fee",
      note: tier.note,
    };
  }

  if (tier.rate !== undefined) {
    const amount = roundToLKR(propertyValue * tier.rate);
    return {
      key: "valuation",
      label: "Valuation Fee",
      amount,
      basis: `${(tier.rate * 100).toFixed(3)}% of property value`,
    };
  }

  return null;
}

// ============================================================================
// UNION BANK CALCULATOR (renamed to avoid conflicts)
// ============================================================================

function calculateUnionBankTariff(inputs: UserInputs): TariffResult {
  const {
    loanAmount,
    propertyValue,
    deductApplicationFeeAtDisbursement = true,
  } = inputs;

  // Validate inputs
  if (loanAmount <= 0) {
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

  const rows: FeeRow[] = [];

  // 1. Processing Fee (gross)
  const processingFeeRow = calcProcessingFee(inputs);
  const grossProcessingFee = processingFeeRow.amount;

  // 2. Application Fee (paid upfront for Housing/LAP)
  const applicationFee = calcApplicationFee(inputs);

  // 3. Net Processing Fee at disbursement (after application fee deduction)
  const netProcessingFee = netProcessingAfterApplication(
    grossProcessingFee,
    applicationFee,
    deductApplicationFeeAtDisbursement
  );

  // Add application fee row if applicable
  if (applicationFee > 0) {
    rows.push({
      key: "application_fee",
      label: "Application Fee (Paid at Lodgement)",
      amount: applicationFee,
      basis: "Fixed fee (12.03)",
      note: "Non-refundable, deducted from processing fee at disbursement",
    });
  }

  // Add processing fee row (net amount due at disbursement)
  rows.push({
    ...processingFeeRow,
    amount: netProcessingFee,
    note:
      applicationFee > 0 && deductApplicationFeeAtDisbursement
        ? `Gross ${formatCurrency(grossProcessingFee)} minus application fee ${formatCurrency(applicationFee)}`
        : undefined,
  });

  // 4. Legal Fees
  const legalRows = calcLegal(inputs);
  rows.push(...legalRows);

  // 5. Valuation Fee
  const valuationRow = calcValuation(propertyValue);
  if (valuationRow) {
    rows.push(valuationRow);
  }

  // 6. Calculate subtotals
  const subtotalProcessing = netProcessingFee;
  const subtotalLegal = legalRows.reduce((sum, r) => sum + r.amount, 0);
  const subtotalValuation = valuationRow?.amount || 0;

  // 7. Grand totals
  const grandTotalDueAtDisbursement = subtotalProcessing + subtotalLegal + subtotalValuation;
  const grandTotalCashOutflow = applicationFee + grandTotalDueAtDisbursement;

  return {
    rows,
    subtotalProcessing,
    subtotalLegal,
    subtotalValuation,
    applicationFeePaidUpfront: applicationFee,
    grandTotalDueAtDisbursement,
    grandTotalCashOutflow,
  };
}

// ============================================================================
// BANK ROUTER - Multi-bank dispatcher
// ============================================================================

import { calculateHnbTariff } from "./tariff-hnb";
import { calculateSeylanTariff } from "./tariff-seylan";
import { calculateSampathTariff } from "./tariff-sampath";
import { calculateCombankTariff } from "./tariff-combank";
import { calculateTariff as calculateNdbTariff } from "./banks/ndb/tariff";
import { calculatePeoplesTariff } from "./tariff-peoples";
import { selectBestRate as selectSeylanRate } from "./rate-seylan";
import { selectBestRate as selectCombankRate } from "./rate-combank";
import { selectBestRate as selectNdbRate } from "./banks/ndb/rates";
import type { RateInputs, RateResult } from "./types-seylan";

/**
 * Main entry point - routes to appropriate bank calculator
 * Defaults to Union Bank for backward compatibility
 */
export function calculateTariff(inputs: UserInputs): TariffResult {
  const bank = inputs.bank || "UnionBank";
  
  if (bank === "HNB") {
    return calculateHnbTariff(inputs.loanAmount);
  }
  
  if (bank === "Seylan") {
    // Map Union Bank product types to Seylan product types
    let seylanProduct: "HomeLoan" | "LAP" | "PersonalLoan";
    if (inputs.product.startsWith("PersonalLoan")) {
      seylanProduct = "PersonalLoan";
    } else if (inputs.product.startsWith("HousingLoan")) {
      seylanProduct = "HomeLoan";
    } else {
      seylanProduct = "LAP";
    }
    
    return calculateSeylanTariff({
      product: seylanProduct,
      loanAmount: inputs.loanAmount,
      propertyValue: inputs.propertyValue,
      personalSpeed: inputs.personalSpeed,
      isCondominium: inputs.isCondominium,
      includeTitleReport: inputs.includeTitleReport,
      includeInspectionFlat: inputs.includeInspectionFlat,
      constructionInspectionCount: inputs.constructionInspectionCount,
    });
  }
  
  if (bank === "Sampath") {
    // Map Union Bank product types to Sampath product types
    let sampathProduct: "HomeLoan" | "LAP" | "PersonalLoan";
    if (inputs.product.startsWith("PersonalLoan")) {
      sampathProduct = "PersonalLoan";
    } else if (inputs.product.startsWith("HousingLoan")) {
      sampathProduct = "HomeLoan";
    } else {
      sampathProduct = "LAP";
    }
    
    return calculateSampathTariff({
      product: sampathProduct,
      loanAmount: inputs.loanAmount,
      includeMortgageHandling: inputs.includeMortgageHandling,
    });
  }
  
  if (bank === "CommercialBank") {
    // Map Union Bank product types to CommercialBank product types
    let combankProduct: "HomeLoan" | "LAP" | "PersonalLoan";
    if (inputs.product.startsWith("PersonalLoan")) {
      combankProduct = "PersonalLoan";
    } else if (inputs.product.startsWith("HousingLoan")) {
      combankProduct = "HomeLoan";
    } else {
      combankProduct = "LAP";
    }
    
    return calculateCombankTariff({
      product: combankProduct,
      loanAmount: inputs.loanAmount,
      // Note: TopUp purpose would need to be passed via inputs if implemented in UI
    });
  }
  
  if (bank === "NDB") {
    // Map Union Bank product types to NDB product types
    let ndbProduct: "HomeLoan" | "PersonalLoan" | "EducationLoan";
    if (inputs.product.startsWith("PersonalLoan")) {
      ndbProduct = "PersonalLoan";
    } else if (inputs.product.startsWith("HousingLoan") || inputs.product.startsWith("LAP")) {
      ndbProduct = "HomeLoan";
    } else {
      ndbProduct = "EducationLoan";
    }
    
    // Determine plChannel based on personalSpeed and plChannel override
    // Priority: explicit plChannel > personalSpeed mapping
    let plChannel: "Standard" | "FastTrack" | "MortgagedBack" = "Standard";
    if (inputs.plChannel) {
      // If explicitly set (e.g., via plSecurity=secured → MortgagedBack), use it
      plChannel = inputs.plChannel;
    } else if (inputs.personalSpeed === "FastTrack") {
      // Otherwise map personalSpeed to FastTrack
      plChannel = "FastTrack";
    }
    
    return calculateNdbTariff({
      bank: "NDB",
      product: ndbProduct,
      loanAmount: inputs.loanAmount,
      tenureYears: inputs.tenureYears || 10,
      plChannel,
      // NDB-specific inputs would be passed from UI if available
    });
  }
  
  if (bank === "PeoplesBank") {
    return calculatePeoplesTariff(inputs);
  }
  
  // Default to Union Bank
  return calculateUnionBankTariff(inputs);
}

// ============================================================================
// RATE SELECTION API - Multi-bank best-match rate selector
// ============================================================================

/**
 * Extended inputs for rate selection including all rate-related parameters
 */
export interface RateSelectionInputs extends UserInputs {
  // Seylan-specific rate selection fields
  tenureYears?: number;
  salaryRelationship?: "Assignment" | "Remittance" | "None";
  salaryBand?: ">=700k" | "150k-699k" | "Other";
  usesCreditAndInternet?: boolean;
  personalLoanTier?: "Tier1" | "Tier2" | "Tier3";
  // CommercialBank-specific rate selection fields
  tier?: "Standard" | "Premium" | "Platinum";
  guarantorType?: "Personal" | "PropertyMortgage";
  allowLapUseHomeRates?: boolean;
  awpr?: number; // Current AWPR rate for normalizing formulas
}

/**
 * Select best-match interest rate based on user inputs
 * Currently supports Seylan Bank and CommercialBank
 * 
 * @throws {SeylanRateNotFoundError} if Seylan rate not found
 * @throws {Error} if CommercialBank rate not found
 */
export function selectBestRate(inputs: RateSelectionInputs): RateResult {
  const bank = inputs.bank || "UnionBank";
  
  if (bank === "Seylan") {
    // Map Union Bank product types to Seylan product types
    let seylanProduct: "HomeLoan" | "LAP" | "PersonalLoan";
    if (inputs.product.startsWith("PersonalLoan")) {
      seylanProduct = "PersonalLoan";
    } else if (inputs.product.startsWith("HousingLoan")) {
      seylanProduct = "HomeLoan";
    } else {
      seylanProduct = "LAP";
    }
    
    const rateInputs: RateInputs = {
      product: seylanProduct,
      loanAmount: inputs.loanAmount,
      tenureYears: inputs.tenureYears || 10, // Default to 10 years
      salaryRelationship: inputs.salaryRelationship,
      salaryBand: inputs.salaryBand,
      usesCreditAndInternet: inputs.usesCreditAndInternet,
      personalLoanTier: inputs.personalLoanTier,
    };
    
    return selectSeylanRate(rateInputs);
  }
  
  if (bank === "CommercialBank") {
    // Map Union Bank product types to CommercialBank product types
    let combankProduct: "HomeLoan" | "LAP" | "PersonalLoan" | "EducationLoan";
    if (inputs.product.startsWith("PersonalLoan")) {
      combankProduct = "PersonalLoan";
    } else if (inputs.product.startsWith("HousingLoan")) {
      combankProduct = "HomeLoan";
    } else if (inputs.product.startsWith("EducationLoan")) {
      combankProduct = "EducationLoan";
    } else {
      combankProduct = "LAP";
    }
    
    return selectCombankRate({
      product: combankProduct,
      tenureYears: inputs.tenureYears || 10, // Default to 10 years
      tier: inputs.tier,
      guarantorType: inputs.guarantorType,
      allowLapUseHomeRates: inputs.allowLapUseHomeRates,
      awpr: inputs.awpr,
    });
  }
  
  if (bank === "NDB") {
    // Map Union Bank product types to NDB product types
    let ndbProduct: "HomeLoan" | "PersonalLoan" | "EducationLoan";
    if (inputs.product.startsWith("PersonalLoan")) {
      ndbProduct = "PersonalLoan";
    } else if (inputs.product.startsWith("HousingLoan") || inputs.product.startsWith("LAP")) {
      ndbProduct = "HomeLoan";
    } else {
      ndbProduct = "EducationLoan";
    }
    
    return selectNdbRate({
      bank: "NDB",
      product: ndbProduct,
      loanAmount: inputs.loanAmount,
      tenureYears: inputs.tenureYears || 10,
      isProfessional: inputs.isProfessional,
      // Use salaryRelationship to decide min/max policy (None -> use max)
      salaryRelationship: inputs.salaryRelationship,
      preferMinFloating: inputs.preferMinFloating,
    });
  }
  
  // Union Bank and HNB don't have rate selection yet
  throw new Error(`Rate selection not implemented for ${bank}`);
}

// ============================================================================
// OFFER GENERATION - Combined tariff + rate
// ============================================================================

export interface OfferResult {
  tariff: TariffResult;
  rate?: RateResult; // Optional - only when rate selection is available
}

/**
 * Generate complete offer including both tariff and best-match rate
 * 
 * For Seylan, CommercialBank, and NDB: Returns both tariff and rate
 * For Union Bank/HNB: Returns tariff only (rate selection not yet implemented)
 */
export function generateOffer(inputs: RateSelectionInputs): OfferResult {
  const tariff = calculateTariff(inputs);
  
  const bank = inputs.bank || "UnionBank";
  
  if (bank === "Seylan" || bank === "CommercialBank" || bank === "NDB") {
    try {
      const rate = selectBestRate(inputs);
      return { tariff, rate };
    } catch (error) {
      // If rate selection fails, return tariff only
      console.warn(`Rate selection failed for ${bank}: ${error}`);
      return { tariff };
    }
  }
  
  // For other banks, return tariff only
  return { tariff };
}

// Re-export Seylan types for convenience
export type { RateResult, RateRow } from "./types-seylan";
export { SeylanRateNotFoundError } from "./types-seylan";
