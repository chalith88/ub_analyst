// Seylan Bank - Best-Match Rate Selector
// Implements deterministic rate selection for Home Loan, LAP, and Personal Loan

import type {
  RateInputs,
  RateResult,
  RawSeylanRate,
  SeylanProduct,
} from "./types-seylan";
import { SeylanRateNotFoundError } from "./types-seylan";

// Embedded rate data from seylan.json
import seylanRatesData from "../../output/seylan.json";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize strings: trim, lowercase, collapse multiple spaces
 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse percentage string to decimal number
 * "11.75%" => 11.75
 */
function parseRate(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.trim().replace("%", "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Map tenure years to closest available bucket (ceil to next if not exact match)
 * - Home Loan / LAP buckets: 1, 2, 5, 10 years
 * - Personal Loan buckets: 1, 2, 3, 4, 5, 6, 7 years
 */
function mapTenureToBucketForProduct(product: SeylanProduct, tenureYears: number): number {
  const isPL = product === "PersonalLoan";
  const buckets = isPL ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 5, 10];

  // Exact match
  if (buckets.includes(tenureYears)) {
    return tenureYears;
  }

  // Ceil to next bucket
  const next = buckets.find((b) => b > tenureYears);
  if (next) return next;

  // If beyond last bucket, use the max available
  return buckets[buckets.length - 1];
}

/**
 * Filter rate data by product
 */
function filterByProduct(
  data: RawSeylanRate[],
  product: SeylanProduct
): RawSeylanRate[] {
  const normalizedProduct = normalize(product);
  
  return data.filter((row) => {
    const rowProduct = normalize(row.product);
    
    // Map variations
    if (normalizedProduct === "homeloan") {
      return rowProduct === "home loan" || rowProduct === "homeloan";
    }
    if (normalizedProduct === "lap") {
      return rowProduct === "lap";
    }
    if (normalizedProduct === "personalloan") {
      return rowProduct === "personal loan" || rowProduct === "personalloan";
    }
    
    return false;
  });
}

/**
 * Find rate row by tenure bucket
 */
function findByTenure(
  data: RawSeylanRate[],
  tenureBucket: number
): RawSeylanRate | null {
  return data.find((row) => row.tenureYears === tenureBucket) || null;
}

// ============================================================================
// HOME LOAN / LAP RATE SELECTOR
// ============================================================================

function selectHlLapRate(inputs: RateInputs, rateRow: RawSeylanRate): RateResult {
  const {
    salaryRelationship = "None",
    salaryBand = "Other",
    usesCreditAndInternet = false,
  } = inputs;
  
  let selectedRate: number | null = null;
  let columnLabel = "";
  let bandLabel = "";
  
  // Determine salary band and column
  if (salaryRelationship === "Assignment") {
    if (salaryBand === ">=700k") {
      // Salary >= 700k with assignment
      bandLabel = "Assignment with Salary >= 700k";
      if (usesCreditAndInternet) {
        selectedRate = parseRate(rateRow.rateWithSalaryAbove700kCreditCardInternetBanking);
        columnLabel = "With Credit Card & Internet Banking";
      } else {
        selectedRate = parseRate(rateRow.rateWithSalaryAbove700k);
        columnLabel = "Without Credit Card & Internet Banking";
      }
    } else if (salaryBand === "150k-699k") {
      // Salary 150k-699k with assignment
      bandLabel = "Assignment with Salary 150k-699k";
      if (usesCreditAndInternet) {
        selectedRate = parseRate(rateRow.rateWithSalaryBelow700kCreditCardInternetBanking);
        columnLabel = "With Credit Card & Internet Banking";
      } else {
        selectedRate = parseRate(rateRow.rateWithSalaryBelow700k);
        columnLabel = "Without Credit Card & Internet Banking";
      }
    } else {
      // Fall back to Others
      bandLabel = "Others (No qualifying assignment/remittance)";
      if (usesCreditAndInternet) {
        selectedRate = parseRate(rateRow.rateWithoutSalaryWithCreditCardInternetBanking);
        columnLabel = "With Credit Card & Internet Banking";
      } else {
        selectedRate = parseRate(rateRow.rateWithoutSalary);
        columnLabel = "Without Credit Card & Internet Banking";
      }
    }
  } else {
    // No assignment/remittance → Others
    bandLabel = "Others (No qualifying assignment/remittance)";
    if (usesCreditAndInternet) {
      selectedRate = parseRate(rateRow.rateWithoutSalaryWithCreditCardInternetBanking);
      columnLabel = "With Credit Card & Internet Banking";
    } else {
      selectedRate = parseRate(rateRow.rateWithoutSalary);
      columnLabel = "Without Credit Card & Internet Banking";
    }
  }
  
  if (selectedRate === null) {
    throw new SeylanRateNotFoundError(
      `Rate not found for ${inputs.product} with tenure ${inputs.tenureYears}y, band "${bandLabel}", column "${columnLabel}"`,
      {
        product: inputs.product,
        tenure: inputs.tenureYears,
        salaryRelationship: salaryRelationship,
        salaryBand: salaryBand,
      }
    );
  }
  
  const basisDetail = `${inputs.product}, ${rateRow.tenureLabel} tenure, ${bandLabel}, ${columnLabel}`;
  
  return {
    rows: [
      {
        key: "best_rate",
        label: `Best Rate (Seylan ${inputs.product})`,
        ratePct: selectedRate,
        basis: basisDetail,
      },
    ],
    bestRatePct: selectedRate,
    source: rateRow.source || "seylan.json",
    note: rateRow.notes
      ? `${rateRow.notes}. Note: For review/repricing, add 1% above displayed rate.`
      : "Note: For review/repricing, add 1% above displayed rate.",
  };
}

// ============================================================================
// PERSONAL LOAN RATE SELECTOR
// ============================================================================

function selectPlRate(inputs: RateInputs, rateRow: RawSeylanRate): RateResult {
  const { personalLoanTier = "Tier3", usesCreditAndInternet = false } = inputs;
  
  let selectedRate: number | null = null;
  let columnLabel = "";
  let tierLabel = "";
  
  // Select tier and column
  if (personalLoanTier === "Tier1") {
    tierLabel = "Tier 1 (Professionals & Premium Companies >= 300k)";
    if (usesCreditAndInternet) {
      selectedRate = parseRate(rateRow.ratePLTier1WithCreditCardInternetBanking);
      columnLabel = "With Credit Card & Internet Banking";
    } else {
      selectedRate = parseRate(rateRow.ratePLTier1WithoutCreditCardInternetBanking);
      columnLabel = "Without Credit Card & Internet Banking";
    }
  } else if (personalLoanTier === "Tier2") {
    tierLabel = "Tier 2 (Professionals & Premium Companies 200k-299k)";
    if (usesCreditAndInternet) {
      selectedRate = parseRate(rateRow.ratePLTier2WithCreditCardInternetBanking);
      columnLabel = "With Credit Card & Internet Banking";
    } else {
      selectedRate = parseRate(rateRow.ratePLTier2WithoutCreditCardInternetBanking);
      columnLabel = "Without Credit Card & Internet Banking";
    }
  } else {
    // Tier3
    tierLabel = "Tier 3 (CAT A & B Companies >= 200k)";
    if (usesCreditAndInternet) {
      selectedRate = parseRate(rateRow.ratePLTier3WithCreditCardInternetBanking);
      columnLabel = "With Credit Card & Internet Banking";
    } else {
      selectedRate = parseRate(rateRow.ratePLTier3WithoutCreditCardInternetBanking);
      columnLabel = "Without Credit Card & Internet Banking";
    }
  }
  
  if (selectedRate === null) {
    throw new SeylanRateNotFoundError(
      `Rate not found for Personal Loan with tenure ${inputs.tenureYears}y, tier "${tierLabel}", column "${columnLabel}"`,
      {
        product: inputs.product,
        tenure: inputs.tenureYears,
        tier: personalLoanTier,
      }
    );
  }
  
  const basisDetail = `Personal Loan, ${rateRow.tenureLabel} tenure, ${tierLabel}, ${columnLabel}`;
  
  return {
    rows: [
      {
        key: "best_rate",
        label: "Best Rate (Seylan Personal Loan)",
        ratePct: selectedRate,
        basis: basisDetail,
      },
    ],
    bestRatePct: selectedRate,
    source: rateRow.source || "seylan.json",
    note: rateRow.notes,
  };
}

// ============================================================================
// MAIN RATE SELECTOR
// ============================================================================

/**
 * Select best-match rate for Seylan Bank based on user inputs
 * 
 * @throws {SeylanRateNotFoundError} if no matching rate found
 */
export function selectBestRate(inputs: RateInputs): RateResult {
  // Load and filter data
  const allRates = seylanRatesData as RawSeylanRate[];
  const productRates = filterByProduct(allRates, inputs.product);
  
  if (productRates.length === 0) {
    throw new SeylanRateNotFoundError(
      `No rate data found for product: ${inputs.product}`,
      { product: inputs.product }
    );
  }
  
  // Map tenure to available bucket, product-aware
  const tenureBucket = mapTenureToBucketForProduct(inputs.product, inputs.tenureYears);
  const rateRow = findByTenure(productRates, tenureBucket);
  
  if (!rateRow) {
    throw new SeylanRateNotFoundError(
      `No rate data found for tenure ${inputs.tenureYears} years (bucket: ${tenureBucket})`,
      {
        product: inputs.product,
        tenure: inputs.tenureYears,
      }
    );
  }
  
  // Dispatch to product-specific selector
  if (inputs.product === "HomeLoan" || inputs.product === "LAP") {
    return selectHlLapRate(inputs, rateRow);
  } else if (inputs.product === "PersonalLoan") {
    return selectPlRate(inputs, rateRow);
  }
  
  throw new SeylanRateNotFoundError(
    `Unsupported product: ${inputs.product}`,
    { product: inputs.product }
  );
}
