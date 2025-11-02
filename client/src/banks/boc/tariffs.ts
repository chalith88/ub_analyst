import type { BocRateRow, BocTariffRow, BocRateResult, BocTariffResult, BocCalculatorInputs } from './types';

// Helper function for percentage with cap calculation
function pctCap(amount: number, pct: number, min: number, max: number): number {
  const raw = amount * pct;
  return Math.min(Math.max(raw, min), max);
}

// Parse percentage string to number
function parseRate(rateStr: string): number {
  const match = rateStr.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return match ? parseFloat(match[1]) : 0;
}

// Map product names
function mapProductName(product: string): string {
  switch (product) {
    case "Home Loans": return "Home Loan";
    case "Loan Against Property": return "LAP";
    case "Personal Loans": return "Personal Loan";
    case "Education Loans": return "Education Loan";
    default: return product;
  }
}

export function getBocRate(
  inputs: BocCalculatorInputs,
  rateData: BocRateRow[]
): BocRateResult | null {
  const { product, loanAmount, tenureYears } = inputs;
  const mappedProduct = mapProductName(product);

  // Filter rows by product and tenure
  const candidateRows = rateData
    .filter(row => 
      row.bank === "Bank of Ceylon" &&
      row.product === mappedProduct &&
      row.tenureYears === tenureYears
    );

  if (candidateRows.length === 0) {
    return null;
  }

  // Apply product-specific logic
  if (product === "Home Loans") {
    return getBocHomeRate(candidateRows, loanAmount);
  } else if (product === "Personal Loans") {
    return getBocPersonalRate(candidateRows);
  } else if (product === "Education Loans") {
    return getBocEducationRate(candidateRows);
  } else if (product === "Loan Against Property") {
    // LAP may need fallback even if no direct LAP rows
    return getBocLapRate(candidateRows, loanAmount, tenureYears, rateData);
  }

  return null;
}

function getBocHomeRate(rows: BocRateRow[], loanAmount: number): BocRateResult | null {
  // Home Loan logic based on amount ranges
  let bestRate = Infinity;
  let bestRow: BocRateRow | null = null;

  for (const row of rows) {
    const rate = parseRate(row.rateWithSalary);
    const notes = row.notes || "";

    // Amount-based filtering
    if (loanAmount <= 5_000_000) {
      // ≤ Rs. 5 Mn
      if (notes.includes("up to Rs. 5")) {
        if (rate < bestRate) {
          bestRate = rate;
          bestRow = row;
        }
      }
    } else if (loanAmount <= 7_500_000) {
      // Rs. 5-7.5 Mn
      if (notes.includes("Rs. 5.0 Mn up to Rs. 7.5 Mn")) {
        if (rate < bestRate) {
          bestRate = rate;
          bestRow = row;
        }
      }
    } else {
      // > Rs. 7.5 Mn
      if (notes.includes("above Rs. 7.5 Mn")) {
        if (rate < bestRate) {
          bestRate = rate;
          bestRow = row;
        }
      }
    }
  }

  if (!bestRow) return null;

  return {
    label: bestRow.tenureLabel,
    rate: bestRate,
    source: bestRow.source,
    notes: bestRow.notes
  };
}

function getBocPersonalRate(rows: BocRateRow[]): BocRateResult | null {
  // Return both schemes with the lower rate marked as "Best Available"
  const schemes: { [key: string]: BocRateResult } = {};

  for (const row of rows) {
    const rate = parseRate(row.rateWithSalary);
    const schemeName = row.notes || "Standard";
    
    if (!schemes[schemeName] || rate < schemes[schemeName].rate) {
      schemes[schemeName] = {
        label: row.tenureLabel,
        rate: rate,
        source: row.source,
        notes: row.notes
      };
    }
  }

  const schemeList = Object.values(schemes);
  if (schemeList.length === 0) return null;

  // Find the best (lowest) rate
  const bestScheme = schemeList.reduce((best, current) => 
    current.rate < best.rate ? current : best
  );

  // Mark the best scheme
  if (schemeList.length > 1) {
    bestScheme.notes = (bestScheme.notes || "") + " (Best Available)";
  }

  return bestScheme;
}

function getBocEducationRate(rows: BocRateRow[]): BocRateResult | null {
  if (rows.length === 0) return null;

  const bestRow = rows.reduce((best, current) => {
    const currentRate = parseRate(current.rateWithSalary);
    const bestRate = parseRate(best.rateWithSalary);
    return currentRate < bestRate ? current : best;
  });

  return {
    label: bestRow.tenureLabel,
    rate: parseRate(bestRow.rateWithSalary),
    source: bestRow.source,
    notes: bestRow.notes
  };
}

function getBocLapRate(
  rows: BocRateRow[], 
  _loanAmount: number, 
  tenureYears: number, 
  allRateData: BocRateRow[]
): BocRateResult | null {
  // First try to find dedicated LAP rows (from the pre-filtered rows)
  const lapRows = rows.filter(row => row.product === "LAP");
  
  if (lapRows.length > 0) {
    const bestRow = lapRows.reduce((best, current) => {
      const currentRate = parseRate(current.rateWithSalary);
      const bestRate = parseRate(best.rateWithSalary);
      return currentRate < bestRate ? current : best;
    });

    return {
      label: bestRow.tenureLabel,
      rate: parseRate(bestRow.rateWithSalary),
      source: bestRow.source,
      notes: bestRow.notes
    };
  }

  // Fallback to Home Loan rates with matching tenure (>7.5M tier)
  const homeRows = allRateData
    .filter(row => 
      row.bank === "Bank of Ceylon" &&
      row.product === "Home Loan" &&
      row.tenureYears === tenureYears &&
      (row.notes || "").includes("above Rs. 7.5 Mn")
    );

  if (homeRows.length > 0) {
    const bestRow = homeRows.reduce((best, current) => {
      const currentRate = parseRate(current.rateWithSalary);
      const bestRate = parseRate(best.rateWithSalary);
      return currentRate < bestRate ? current : best;
    });

    return {
      label: bestRow.tenureLabel,
      rate: parseRate(bestRow.rateWithSalary),
      source: bestRow.source,
      notes: "LAP (using Home Loan rates)"
    };
  }

  return null;
}

export function getBocTariffs(
  inputs: BocCalculatorInputs,
  tariffData: BocTariffRow[]
): BocTariffResult | null {
  const { product, loanAmount } = inputs;
  const mappedProduct = mapProductName(product);

  const processingFee = getProcessingFee(mappedProduct, loanAmount, tariffData);
  const earlySettlement = getEarlySettlement(mappedProduct, tariffData);

  if (!processingFee && !earlySettlement) {
    return null;
  }

  const source = tariffData.find(row => row.bank === "Bank of Ceylon")?.source || "";

  return {
    processingFee: processingFee || {
      label: "Processing Fee",
      amount: 0,
      formula: "Not available"
    },
    earlySettlement: earlySettlement ?? undefined,
    source
  };
}

function getProcessingFee(
  product: string, 
  loanAmount: number, 
  tariffData: BocTariffRow[]
): BocTariffResult['processingFee'] | null {
  const processingRows = tariffData.filter(row => 
    row.bank === "Bank of Ceylon" &&
    row.product === product &&
    row.feeCategory === "Processing Fee"
  );

  if (processingRows.length === 0) {
    return null;
  }

  // Apply product-specific processing fee logic
  if (product === "Home Loan") {
    return calculateHomeLoanProcessing(loanAmount, processingRows);
  } else if (product === "Personal Loan") {
    return calculatePersonalLoanProcessing(loanAmount, processingRows);
  } else if (product === "LAP") {
    return calculateLapProcessing(loanAmount, processingRows);
  }

  return null;
}

function calculateHomeLoanProcessing(
  loanAmount: number, 
  _rows: BocTariffRow[]
): BocTariffResult['processingFee'] {
  // Check if it's Government Housing Loan (this would need additional logic)
  const isGovtLoan = false; // For now, assume regular BOC Housing Loan

  if (isGovtLoan) {
    // 0.8% of loan, min 1,000, max 10,000
    const amount = Math.round(pctCap(loanAmount, 0.008, 1000, 10000));
    return {
      label: "Processing Fee (Govt. Housing)",
      amount,
      formula: "0.8% of loan amount",
      capNote: "Min Rs. 1,000, Max Rs. 10,000"
    };
  } else {
    // 0.8% of loan, min 1,000, max 25,000
    const amount = Math.round(pctCap(loanAmount, 0.008, 1000, 25000));
    return {
      label: "Processing Fee",
      amount,
      formula: "0.8% of loan amount",
      capNote: "Min Rs. 1,000, Max Rs. 25,000"
    };
  }
}

function calculatePersonalLoanProcessing(
  loanAmount: number, 
  _rows: BocTariffRow[]
): BocTariffResult['processingFee'] {
  let min = 2000;
  let max: number;

  if (loanAmount <= 5_000_000) {
    // ≤5M: max 20,000
    max = 20000;
  } else if (loanAmount <= 10_000_000) {
    // 5-10M: max 30,000
    max = 30000;
  } else {
    // ≥10M: max 50,000
    max = 50000;
  }

  const amount = Math.round(pctCap(loanAmount, 0.008, min, max));
  
  return {
    label: "Processing Fee",
    amount,
    formula: "0.8% of loan amount",
    capNote: `Min Rs. ${min.toLocaleString()}, Max Rs. ${max.toLocaleString()}`
  };
}

function calculateLapProcessing(
  loanAmount: number, 
  _rows: BocTariffRow[]
): BocTariffResult['processingFee'] {
  // LAP (Personal): 0.8% of loan, min 2,000, max 250,000
  const amount = Math.round(pctCap(loanAmount, 0.008, 2000, 250000));
  
  return {
    label: "Processing Fee (LAP)",
    amount,
    formula: "0.8% of loan amount",
    capNote: "Min Rs. 2,000, Max Rs. 250,000"
  };
}

function getEarlySettlement(
  product: string, 
  tariffData: BocTariffRow[]
): BocTariffResult['earlySettlement'] | null {
  const earlyRows = tariffData.filter(row => 
    row.bank === "Bank of Ceylon" &&
    row.product === product &&
    row.feeCategory === "Early Settlement"
  );

  if (earlyRows.length === 0) {
    return null;
  }

  const tiers = [];

  // Standard early settlement tiers for all products
  const within3Years = earlyRows.find(row => row.description.includes("Within 3 years"));
  if (within3Years) {
    tiers.push({
      window: "≤3 years",
      rate: 3
    });
  }

  const threeToFive = earlyRows.find(row => row.description.includes("Above 3 years and up to 5 years"));
  if (threeToFive) {
    tiers.push({
      window: "3-5 years",
      rate: 2
    });
  }

  const aboveFive = earlyRows.find(row => row.description.includes("Above 5 years"));
  if (aboveFive) {
    tiers.push({
      window: ">5 years",
      rate: 1
    });
  }

  return tiers.length > 0 ? { tiers } : null;
}