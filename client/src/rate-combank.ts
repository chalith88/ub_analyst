// Commercial Bank Rate Selector
// Supports: Home Loan (HL), Loan Against Property (LAP), Personal Loan (PL), Education Loan
// Source: combank.json with Standard/Premium/Platinum tiers

import combankData from "../../output/combank.json";

export interface RateRow {
  key: string;
  label: string;
  ratePct: number;
  basis?: string;
}

export interface RateResult {
  rows: RateRow[];
  bestRatePct: number;
  source: string;
}

export interface CombankRateInputs {
  product: "HomeLoan" | "LAP" | "PersonalLoan" | "EducationLoan";
  tenureYears: number;
  tier?: "Standard" | "Premium" | "Platinum"; // Default: Standard
  guarantorType?: "Personal" | "PropertyMortgage"; // For Education Loan only
  allowLapUseHomeRates?: boolean; // If LAP table missing, reuse HL rates
  awpr?: number; // Current AWPR rate for normalizing AWPLR/AWPR formulas
}

// Parse rate string like "11.50%" → 11.5
// Also handles AWPR/AWPLR formulas when awprRate is provided
function parseRate(rateStr: string, awprRate?: number): number {
  const cleaned = rateStr.trim();
  
  // Check for AWPR/AWPLR formula (e.g., "AWPR + 3%", "AWPLR+2%")
  const formulaMatch = cleaned.match(/\b(AWPR|AWPLR)\b\s*([+-])\s*([0-9]+(?:\.[0-9]+)?)(\s*%)?/i);
  if (formulaMatch) {
    if (typeof awprRate === "number") {
      const sign = formulaMatch[2] === "-" ? -1 : 1;
      const offset = parseFloat(formulaMatch[3]);
      return awprRate + (sign * offset);
    }
    // If no AWPR rate provided, return 0 as fallback
    return 0;
  }
  
  // Standard percentage parsing
  const numericStr = cleaned.replace("%", "").trim();
  return parseFloat(numericStr);
}

// Detect tier from notes field
function getTierFromNotes(notes: string): "Standard" | "Premium" | "Platinum" {
  const lower = notes.toLowerCase();
  if (lower.includes("platinum")) return "Platinum";
  if (lower.includes("premium")) return "Premium";
  return "Standard";
}

// Map tenure to bucket for Home Loan
// Buckets: 3, 5, 10, 15 years
// If tenure > 15, use "AWPR + 3%" floating rate (handled separately)
function mapTenureToHLBucket(tenureYears: number): number {
  if (tenureYears <= 3) return 3;
  if (tenureYears <= 5) return 5;
  if (tenureYears <= 10) return 10;
  return 15; // 11-15 years
}

// Map tenure to bucket for Personal Loan
// Buckets: 1, 2, 3, 4-5, 7 years
function mapTenureToPLBucket(tenureYears: number): number {
  if (tenureYears === 1) return 1;
  if (tenureYears === 2) return 2;
  if (tenureYears === 3) return 3;
  if (tenureYears === 4 || tenureYears === 5) return 4; // 4-5 Years bucket
  if (tenureYears >= 7) return 7;
  // If 6, round up to 7
  return 7;
}

// Map tenure to bucket for Education Loan (Personal Guarantors)
// Max 5 years: buckets "<=3", "4-5"
function mapTenureToEducationPersonalBucket(tenureYears: number): string {
  if (tenureYears <= 3) return "Up to 3 Years";
  return "4 - 5 Years"; // 4-5 years
}

// Map tenure to bucket for Education Loan (Property Mortgage)
// Max 7 years: buckets "<=3", "5", "7"
function mapTenureToEducationPropertyBucket(tenureYears: number): number {
  if (tenureYears <= 3) return 3;
  if (tenureYears <= 5) return 5;
  return 7;
}

// Main rate selector
export function selectBestRate(inputs: CombankRateInputs): RateResult {
  // Default to Standard tier if not specified or if explicitly "none"
  // Customer Category: none → Standard, Premium → Premium, Platinum → Platinum
  const tier = inputs.tier || "Standard";
  const rows: RateRow[] = [];

  // Load and normalize data
  const allRates = combankData as Array<{
    bank: string;
    product: string;
    type: string;
    tenureLabel: string;
    rateWithSalary: string;
    source: string;
    notes: string;
    tenureYears: number;
  }>;

  // Handle LAP fallback to Home Loan
  let productToSearch = inputs.product;
  let lapFallback = false;
  if (inputs.product === "LAP") {
    const hasLap = allRates.some((r) => r.product === "Loan Against Property");
    if (!hasLap) {
      if (inputs.allowLapUseHomeRates) {
        productToSearch = "HomeLoan";
        lapFallback = true;
      } else {
        throw new Error("ComBankRateNotFound: LAP table missing");
      }
    } else {
      productToSearch = "LAP"; // Use actual LAP if exists
    }
  }

  // Map product name to JSON format
  const productMap: Record<string, string> = {
    HomeLoan: "Home Loan",
    LAP: "Loan Against Property",
    PersonalLoan: "Personal Loan",
    EducationLoan: "Education Loan",
  };
  const productName = productMap[productToSearch] || productToSearch;

  // Filter by product
  let filtered = allRates.filter((r) => r.product === productName);

  // Handle Education Loan guarantor type
  if (inputs.product === "EducationLoan") {
    if (!inputs.guarantorType) {
      throw new Error(
        "ComBankRateNotFound: Education Loan requires guarantorType (Personal or PropertyMortgage)"
      );
    }
    const guarantorLabel =
      inputs.guarantorType === "Personal"
        ? "With Personal Guarantors"
        : "With Property Mortgages";
    filtered = filtered.filter((r) => r.notes === guarantorLabel);

    // Map tenure to appropriate bucket
    let targetTenure: number | string;
    if (inputs.guarantorType === "Personal") {
      targetTenure = mapTenureToEducationPersonalBucket(inputs.tenureYears);
      const match = filtered.find((r) => r.tenureLabel === targetTenure);
      if (match) {
        const rate = parseRate(match.rateWithSalary, inputs.awpr);
        rows.push({
          key: "match",
          label: `Education Loan • ${inputs.guarantorType} • ${match.tenureLabel}`,
          ratePct: rate,
          basis: "fixed",
        });
        return { rows, bestRatePct: rate, source: match.source };
      }
    } else {
      // Property Mortgage
      targetTenure = mapTenureToEducationPropertyBucket(inputs.tenureYears);
      const match = filtered.find((r) => r.tenureYears === targetTenure);
      if (match) {
        const rate = parseRate(match.rateWithSalary, inputs.awpr);
        rows.push({
          key: "match",
          label: `Education Loan • ${inputs.guarantorType} • ${match.tenureLabel}`,
          ratePct: rate,
          basis: "fixed",
        });
        return { rows, bestRatePct: rate, source: match.source };
      }
    }
    throw new Error(
      `ComBankRateNotFound: No Education Loan rate for ${inputs.guarantorType} / ${inputs.tenureYears}y`
    );
  }

  // Filter by tier (detect from notes) - exclude generic floating rates and green loans
  filtered = filtered.filter((r) => {
    // Exclude "Floating (footnote)" entries - these are generic rates not tied to tiers
    if (r.notes.toLowerCase().includes("floating (footnote)")) return false;
    // Exclude "Green Home Loans" - these are a separate product variant
    if (r.notes.toLowerCase().includes("green")) return false;
    // Now check tier
    return getTierFromNotes(r.notes) === tier;
  });

  // Handle Home Loan
  if (productToSearch === "HomeLoan") {
    // Check if tenure > 15 (use floating AWPR + 3%)
    if (inputs.tenureYears > 15) {
      const floatingRate = filtered.find(
        (r) =>
          r.type === "Floating" &&
          r.rateWithSalary.includes("AWPR") &&
          r.tenureYears >= 15
      );
      if (floatingRate) {
        const rate = parseRate(floatingRate.rateWithSalary, inputs.awpr);
        rows.push({
          key: "floating",
          label: `Home Loan • ${tier} • ${floatingRate.tenureLabel}`,
          ratePct: rate,
          basis: floatingRate.rateWithSalary,
        });
        return { rows, bestRatePct: rate, source: floatingRate.source };
      }
    }

    // Fixed rate mapping
    const bucketTenure = mapTenureToHLBucket(inputs.tenureYears);
    const match = filtered.find(
      (r) => r.type === "Fixed" && r.tenureYears === bucketTenure
    );
    if (match) {
      const rate = parseRate(match.rateWithSalary, inputs.awpr);
      rows.push({
        key: "match",
        label: `Home Loan • ${tier} • ${match.tenureLabel}${lapFallback ? " (LAP mapped to HL)" : ""}`,
        ratePct: rate,
        basis: "fixed",
      });
      return { rows, bestRatePct: rate, source: match.source };
    }
  }

  // Handle Personal Loan
  if (inputs.product === "PersonalLoan") {
    const bucketTenure = mapTenureToPLBucket(inputs.tenureYears);
    const match = filtered.find((r) => r.tenureYears === bucketTenure);
    if (match) {
      const rate = parseRate(match.rateWithSalary, inputs.awpr);
      rows.push({
        key: "match",
        label: `Personal Loan • ${tier} • ${match.tenureLabel}`,
        ratePct: rate,
        basis: "fixed",
      });
      return { rows, bestRatePct: rate, source: match.source };
    }
  }

  // If no match found
  throw new Error(
    `ComBankRateNotFound: No rate for ${inputs.product} / ${tier} / ${inputs.tenureYears}y`
  );
}
