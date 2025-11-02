// DFCC Bank calculator implementation
// This module implements the BankCalculator interface for DFCC only.
// It parses rates from dfcc.json and tariffs from dfcc-tariff.json, never hard-coding numbers.


// Use local types for DFCC calculator
export type DFCCInputs = {
  bank?: 'DFCC';
  product: 'Home Loans' | 'Loan Against Property' | 'Personal Loans' | 'Education Loans';
  amount: number;
  tenureYears: number;
  monthlyNetSalary?: number;
  propertyValue?: number;
  includeTariffs: boolean;
  rateType: 'Any' | 'Fixed' | 'Variable';
  takeCreditCard?: boolean;
  useInternetBanking?: boolean;
  firstHome?: boolean;
  salaryRelationship: 'None' | 'Remittance' | 'Assignment';
  customerCategory: 'None' | 'VIP';
  worksAtPremiumCompany?: boolean;
  enableExpress?: boolean;
  isProfessional?: boolean;
  isBanker?: boolean;
  isTeacher?: boolean;
  isCondo?: "yes" | "no";
};

export type PriceResult = {
  bank: 'DFCC';
  product: DFCCInputs['product'];
  rates: Array<{ label: string; minAPR: string; maxAPR?: string }>;
  processing: { label: string; amountLKR: number; ruleRef: string; row?: any };
  legal?: Array<{ label: string; amountLKR?: number; formula?: string; capLKR?: number; ruleRef: string; row?: any }>;
  otherFees?: Array<{ label: string; amountLKR?: number; formula?: string; ruleRef: string; row?: any }>;
  notes?: string[];
};

// Helper: parse LKR string to number
function parseLKR(s: string): number {
  return Number(String(s).replace(/[^\d.]/g, ''));
}

// Helper: parse numeric thresholds with units (e.g., "Rs.100 Mn" → 100,000,000)
function parseNumberWithUnits(s: string): number {
  const str = String(s);
  const hasMillion = /\b(Mn\.?|Million)\b/i.test(str);
  const nums = str.match(/[\d,]+(?:\.\d+)?/g);
  if (!nums || !nums.length) return NaN;
  const raw = nums[nums.length - 1];
  const val = parseFloat(raw.replace(/,/g, ''));
  if (isNaN(val)) return NaN;
  return hasMillion ? val * 1_000_000 : val;
}

// Helper: minMax logic for rates
function minMax(rates: any[], pred: (r: any) => boolean, salaryRel: DFCCInputs['salaryRelationship']): { min: string, max?: string } | undefined {
  const filtered = rates.filter(pred);
  // Debug helper (can be enabled if needed)
  // console.log('🔍 minMax filtered rates:', filtered.length, filtered.map(r => ({ product: r.product, type: r.type, tenureLabel: r.tenureLabel, rateWithSalary: r.rateWithSalary })));
  if (!filtered.length) return undefined;
  // Prefer with salary if Assignment, else fallback
  let minAPR = undefined, maxAPR = undefined;
  for (const r of filtered) {
    let min = r.min, max = r.max;
    if (salaryRel === 'Assignment' && r.rateWithSalary) {
      min = r.rateWithSalary;
      max = r.max || r.rateWithSalary;
    } else if (r.rateWithoutSalary) {
      min = r.rateWithoutSalary;
      max = r.max || r.rateWithoutSalary;
    } else if (r.rateWithSalary) {
      min = r.rateWithSalary;
      max = r.max || r.rateWithSalary;
    }
    if (!minAPR || min < minAPR) minAPR = min;
    if (!maxAPR || max > maxAPR) maxAPR = max;
  }
  return { min: minAPR, max: maxAPR };
}

// Helper: pick slab amount from tariff rows
function pickSlabAmount(rows: any[], amount: number): number {
  let best = undefined;
  for (const row of rows) {
    // Parse description for range
    const desc = row.description;
    const amt = parseLKR(row.amount);
    if (/Up to|≤/i.test(desc) && amount <= parseNumberWithUnits(desc)) {
      if (!best || amt < best) best = amt;
    } else if (/–|to|-/i.test(desc)) {
      // Range: 3,000,001–10,000,000
      const m = desc.match(/([\d,\.]+)\s*[–-]\s*([\d,\.]+)/);
      if (m) {
        const low = parseNumberWithUnits(m[1]), high = parseNumberWithUnits(m[2]);
        if (amount >= low && amount <= high) {
          if (!best || amt < best) best = amt;
        }
      }
    } else if (/Over|Above|>/i.test(desc)) {
      const thr = parseNumberWithUnits(desc);
      if (!isNaN(thr) && amount > thr) {
        if (!best || amt < best) best = amt;
      }
    }
  }
  return best ?? 0;
}

// Helper: select a single slab row based on loan amount and description ranges
function selectSlabRowByAmount(rows: any[], amount: number): any | undefined {
  for (const row of rows) {
    const desc = String(row.description || '');
    if (/Up to|≤/i.test(desc)) {
      const thr = parseNumberWithUnits(desc);
      if (!isNaN(thr) && amount <= thr) return row;
    } else if (/–|to|-/i.test(desc)) {
      const m = desc.match(/([\d,\.]+)\s*[–-]\s*([\d,\.]+)/);
      if (m) {
        const low = parseNumberWithUnits(m[1]);
        const high = parseNumberWithUnits(m[2]);
        if (amount >= low && amount <= high) return row;
      }
    } else if (/Over|Above|and above|>/i.test(desc)) {
      const thr = parseNumberWithUnits(desc);
      if (!isNaN(thr) && amount > thr) return row;
    }
  }
  return undefined;
}

// Normalize product label variants between raw JSON and normalized UI rows
function productMatches(rowProd: any, inputLabel: DFCCInputs['product']): boolean {
  const p = String(rowProd ?? '').toLowerCase();
  const want = String(inputLabel).toLowerCase();
  if (/home\s*loan/.test(p) && /home\s*loan/.test(want)) return true;
  if ((p === 'hl' || /housing\s*loan/.test(p)) && /home|housing/.test(want)) return true;
  if ((p === 'lap' || /against\s*property|equity|mortgage/.test(p)) && /against\s*property/.test(want)) return true;
  if ((p === 'pl' || /personal/.test(p)) && /personal/.test(want)) return true;
  if ((p === 'edu' || /education/.test(p)) && /education/.test(want)) return true;
  return String(rowProd) === inputLabel;
}

// Extract DFCC-shaped rate rows from possibly normalized RateRow objects
function extractDfccRates(ratesJson: any[]): any[] {
  const arr = Array.isArray(ratesJson) ? ratesJson : [];
  return arr
    .map((r: any) => (r && r.raw ? r.raw : r))
    .filter((r: any) => r && /dfcc/i.test(String(r.bank || '')));
}

// Helper: label to product
function labelToProduct(label: string): string {
  if (/Home Loans?/i.test(label)) return 'Home Loan';
  if (/Personal Loans?/i.test(label)) return 'Personal Loan';
  if (/Education Loans?/i.test(label)) return 'Education Loan';
  if (/Loan Against Property/i.test(label)) return 'Loan Against Property';
  return label;
}

// Helper: compute legal fees
function computeLegal(inputs: DFCCInputs, tariffJson: any[]): any[] {
  const bondValue = Math.min(inputs.amount, inputs.propertyValue ?? inputs.amount);
  const legal: any[] = [];

  // Restrict to DFCC and matching product
  const dfccProductTariffs = (tariffJson as any[])
    .filter((t: any) => /DFCC/i.test(String(t.bank || '')))
    .filter((t: any) => productMatches(t.product, inputs.product));


  // Helper to select matching slab row by numeric range in description
  function selectSlabRow(rows: any[], value: number): any | undefined {
    let match: any | undefined;
    for (const row of rows) {
      const desc: string = String(row.description || '');
      // Up to / ≤ threshold
      if (/Up to|≤/i.test(desc)) {
        const thr = parseNumberWithUnits(desc);
        if (!isNaN(thr) && value <= thr) { match = row; }
      }
      // Range with dash or the word "to" (e.g., "LKR 5,000,001 - LKR 10,000,000" or "5,000,001 to 10,000,000")
      else if (/–|—|to|-/i.test(desc)) {
        const m = desc.match(/(\d[\d,\.]*)\s*(?:[–—-]|to)\s*(\d[\d,\.]*)/i);
        if (m) {
          const low = parseNumberWithUnits(m[1]);
          const high = parseNumberWithUnits(m[2]);
          if (!isNaN(low) && !isNaN(high) && value >= low && value <= high) { match = row; }
        } else {
          // Fallback: grab first two numbers found as a range
          const nums = desc.match(/\d[\d,\.]*/g);
          if (nums && nums.length >= 2) {
            const low = parseNumberWithUnits(nums[0]);
            const high = parseNumberWithUnits(nums[1]);
            if (!isNaN(low) && !isNaN(high) && value >= low && value <= high) { match = row; }
          }
        }
      }
      // Over / Above threshold
      else if (/Over|Above|and above|>/i.test(desc)) {
        const thr = parseNumberWithUnits(desc);
        if (!isNaN(thr) && value > thr) { match = row; }
      }
      if (match) break;
    }
    return match;
  }

  // Title Report (select one slab)
  const titleRows = dfccProductTariffs.filter((t: any) =>
    /Title Report/i.test(String(t.feeTypeRaw || '')) || /Title Report/i.test(String(t.feeType || '')) || /Title Report/i.test(String(t.description || ''))
  );
  const title = selectSlabRow(titleRows, bondValue);
  if (title) {
    const amt = parseLKR(String(title.amount || ''));
    legal.push({
      label: 'Title Report',
      formula: title.amount,
      amountLKR: isFinite(amt) ? amt : undefined,
      ruleRef: 'DFCC tariff - Title Report',
      row: title
    });
  }

  // Mortgage Bond (select one slab)
  const bondRows = dfccProductTariffs.filter((t: any) =>
    /Mortgage Bond/i.test(String(t.feeTypeRaw || '')) || /Mortgage Bond/i.test(String(t.feeType || '')) || /Mortgage Bond/i.test(String(t.description || ''))
  );
  const bondRow = selectSlabRow(bondRows, bondValue);
  if (bondRow) {
    let formula = bondRow.amount as string;
    let amountLKR: number | undefined = undefined;
    let capLKR: number | undefined = undefined;
    if (/([\d.]+)%/.test(formula)) {
      const perc = parseFloat(formula.match(/([\d.]+)%/)![1]);
      amountLKR = Math.round((perc / 100) * bondValue);
      // Minimum
      const minMatch = formula.match(/min(?:\.|imum)?\s*(?:of)?\s*Rs\.?\s*([\d,]+)/i);
      if (minMatch) {
        const minLKR = parseLKR(minMatch[1]);
        if (amountLKR < minLKR) amountLKR = minLKR;
      }
      // Cap
      const capMatch = formula.match(/cap\s*([\d,]+)/i) || formula.match(/Max\.?\s*(?:of)?\s*Rs\.?\s*([\d,]+)/i);
      if (capMatch) {
        capLKR = parseLKR((capMatch[1] || '').toString());
        if (amountLKR > capLKR) amountLKR = capLKR;
      }
    } else {
      amountLKR = parseLKR(formula);
    }
    legal.push({
      label: 'Mortgage Bond',
      amountLKR,
      formula,
      capLKR,
      ruleRef: 'DFCC tariff - Mortgage Bond',
      row: bondRow
    });
  }

  // Condominium Tripartite Agreement (only if isCondo is "yes")
  if (inputs.isCondo === "yes") {
    const tripartiteRows = dfccProductTariffs.filter((t: any) => {
      const desc = String(t.description || '').toLowerCase();
      return /tripartite\s*agreement/i.test(desc) && /buyer/i.test(desc);
    });
    // Typically one row for buyer; use raw amount parsing
    for (const row of tripartiteRows) {
      const formula = String(row.amount || '');
      // Parse the complex formula like "100% of the mortgage value when executing the tripartite agreement and Rs. 30,000/- when the mortgage bond is being executed"
      const match = formula.match(/Rs\.?\s*([\d,]+)/i);
      const amountLKR = match ? parseLKR(match[1]) : 0;
      if (amountLKR > 0) {
        legal.push({
          label: 'Condominium Tripartite Agreement',
          formula,
          amountLKR,
          ruleRef: 'DFCC tariff - Tripartite',
          row
        });
      }
    }
  }

  // Personal/Corporate Guarantees - EXCLUDED per user request
  // const guaranteeRows = dfccProductTariffs.filter((t: any) =>
  //   /Personal\/Corporate Guarantees/i.test(String(t.feeTypeRaw || '')) || /Guarantee/i.test(String(t.description || ''))
  // );
  // const guarantee = selectSlabRow(guaranteeRows, bondValue);
  // if (guarantee) {
  //   const amt = parseLKR(String(guarantee.amount || ''));
  //   legal.push({
  //     label: 'Personal/Corporate Guarantee',
  //     formula: guarantee.amount,
  //     amountLKR: isFinite(amt) ? amt : undefined,
  //     ruleRef: 'DFCC tariff - Guarantee',
  //     row: guarantee
  //   });
  // }

  return legal;
}

// Helper: collect other charges
function collectOtherCharges(tariffJson: any[]): any[] {
  const otherRows = tariffJson.filter((t: any) =>
    /Other Charges/i.test(String(t.feeTypeRaw || '')) || /Other Charges/i.test(String(t.feeType || '')) || /Other Charges/i.test(String(t.description || ''))
  );
  const out: any[] = [];
  for (const row of otherRows) {
    const text = String(row.amount || '') + ' ' + String(row.description || '');
    // Skip per-km charges and exclude commonly irrelevant items
    const perKm = /per\s*km/i.test(text);
    const desc = String(row.description || '').toLowerCase();
    // Exclude: release/discharge/declaration/tripartite/supplementary agreement/etc.
    const isExcluded = 
      /\b(release|discharge|declaration|tripartite|supplementary agreement|deed of cancellation|additional mortgage|deed of rectification|deed of confirmation|deed of postponement|addendum|instrument of cancellation)\b/i.test(desc);
    
    const val = parseLKR(String(row.amount || ''));
    if (!perKm && !isExcluded && isFinite(val) && val > 0) {
      out.push({
        label: row.description,
        amountLKR: val,
        formula: row.amount,
        ruleRef: 'DFCC tariff - Other Charges',
        row
      });
    }
  }
  return out;
}

// Main calculator
export const dfccCalculator = {
  name: 'DFCC',
  calculate(inputs: DFCCInputs, ratesJson: any[], tariffJson: any[]): PriceResult {
    if (inputs.bank !== 'DFCC') throw new Error('This module handles only DFCC');
    const out: PriceResult = {
      bank: 'DFCC',
      product: inputs.product,
      rates: [],
      processing: { label: '', amountLKR: 0, ruleRef: '' },
      notes: []
    };
  const rates = extractDfccRates(ratesJson);
  // console.log('🔍 DFCC rates from JSON:', rates.length);
    const wantFixed = inputs.rateType === 'Fixed' || inputs.rateType === 'Any';
    const wantVar = inputs.rateType === 'Variable' || inputs.rateType === 'Any';
    if (inputs.product === 'Home Loans') {
      if (wantFixed) {
        // Check if customer qualifies for Pro/Pinnacle rates (better rates than Normal)
        const proVipEligible = inputs.isProfessional || inputs.customerCategory === 'VIP';
        // console.log('🔍 DFCC proVipEligible:', { isProfessional: inputs.isProfessional, customerCategory: inputs.customerCategory, proVipEligible });
        if (proVipEligible) {
          const proVip = minMax(rates, r => r.product === 'Home Loan' && r.type === 'Fixed' && /(Professionals|Pinnacle)/i.test(r.tenureLabel), inputs.salaryRelationship);
          if (proVip) {
            // If Pro/Pinnacle available, use ONLY that (don't add Normal - Pro/Pinnacle is better)
            out.rates.push({ label: 'Fixed - Professionals & Pinnacle', minAPR: proVip.min, maxAPR: proVip.max });
            out.notes?.push('Professionals & Pinnacle applied');
          } else {
            // Fallback to Normal if Pro/Pinnacle not available
            const normal = minMax(rates, r => r.product === 'Home Loan' && r.type === 'Fixed' && /Normal/i.test(r.tenureLabel), inputs.salaryRelationship);
            if (normal) out.rates.push({ label: 'Fixed - Normal', minAPR: normal.min, maxAPR: normal.max });
          }
        } else {
          // Not qualified for Pro/Pinnacle, use Normal
          const normal = minMax(rates, r => r.product === 'Home Loan' && r.type === 'Fixed' && /Normal/i.test(r.tenureLabel), inputs.salaryRelationship);
          if (normal) out.rates.push({ label: 'Fixed - Normal', minAPR: normal.min, maxAPR: normal.max });
        }
      }
      if (wantVar) {
        const v = minMax(rates, r => r.product === 'Home Loan' && r.type !== 'Fixed' && /Variable/i.test(r.tenureLabel), inputs.salaryRelationship);
        if (v) out.rates.push({ label: 'Variable', minAPR: v.min, maxAPR: v.max });
      }
    } else if (inputs.product === 'Personal Loans') {
      const v = minMax(rates, r => r.product === 'Personal Loan' && /Personal Loans - Variable/i.test(r.tenureLabel), inputs.salaryRelationship);
      if (v) out.rates.push({ label: 'Variable', minAPR: v.min, maxAPR: v.max });
    } else if (inputs.product === 'Education Loans') {
      // Omit rates if not present
    } else if (inputs.product === 'Loan Against Property') {
      const v = minMax(rates, r => /Housing Loans - Variable/i.test(r.tenureLabel), inputs.salaryRelationship);
      if (v && wantVar) out.rates.push({ label: 'Variable', minAPR: v.min, maxAPR: v.max });
    }
    // Processing Fee
    const pfRows = (tariffJson as any[])
      .filter((t: any) => /DFCC/i.test(String(t.bank || '')))
      .filter((t: any) => productMatches(t.product, inputs.product))
      .filter((t: any) => /processing\s*fee/i.test(String(t.feeTypeRaw || t.feeType || t.description || '')));
    const pfSelected = selectSlabRowByAmount(pfRows, inputs.amount);
    out.processing = {
      label: 'Processing Fee',
      amountLKR: pfSelected ? parseLKR(pfSelected.amount) : pickSlabAmount(pfRows, inputs.amount),
      ruleRef: 'DFCC tariff - processing slabs',
      row: pfSelected
    };
    // Legal & Other
    if (inputs.product === 'Home Loans' || inputs.product === 'Loan Against Property') {
      out.legal = computeLegal(inputs, tariffJson);
      out.otherFees = collectOtherCharges(tariffJson.filter((t: any) => /DFCC/i.test(String(t.bank || ''))).filter((t: any) => productMatches(t.product, inputs.product)));
    }
    if (!out.legal || !out.legal.length) delete out.legal;
    if (!out.otherFees || !out.otherFees.length) delete out.otherFees;
    if (!out.notes || !out.notes.length) delete out.notes;
    return out;
  }
};
