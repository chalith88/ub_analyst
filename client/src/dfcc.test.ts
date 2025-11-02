import { describe, it, expect } from 'vitest';
import { dfccCalculator, type DFCCInputs } from './banks/dfcc';

// Use the provided DFCC rates JSON (data-driven; no hard-coded numbers beyond test fixtures)
const ratesJson = [
  {"bank":"DFCC","product":"Home Loan","type":"Fixed","tenureLabel":"Housing Loans - Fixed (Normal)","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"11.00%","rateWithoutSalary":"11.00%","notes":"Minimum"},
  {"bank":"DFCC","product":"Home Loan","type":"Fixed","tenureLabel":"Housing Loans - Fixed (Normal)","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"16.00%","rateWithoutSalary":"16.00%","notes":"Maximum"},
  {"bank":"DFCC","product":"Home Loan","type":"Fixed","tenureLabel":"Housing Loans - Fixed (Professionals & Pinnacle Fixed Income Clients)","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"10.75%","notes":"Minimum (Salaried/Professionals only)"},
  {"bank":"DFCC","product":"Home Loan","type":"Fixed","tenureLabel":"Housing Loans - Fixed (Professionals & Pinnacle Fixed Income Clients)","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"14.00%","notes":"Maximum (Salaried/Professionals only)"},
  {"bank":"DFCC","product":"Home Loan","type":"Floating","tenureLabel":"Housing Loans - Variable","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"AWPR + 3%","rateWithoutSalary":"AWPR + 3%","notes":"Minimum"},
  {"bank":"DFCC","product":"Home Loan","type":"Floating","tenureLabel":"Housing Loans - Variable","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"AWPR + 5%","rateWithoutSalary":"AWPR + 5%","notes":"Maximum"},
  {"bank":"DFCC","product":"Personal Loan","type":"Floating","tenureLabel":"Personal Loans - Variable (Professionals / Salaried & Others)","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"AWPR + 3%","rateWithoutSalary":"AWPR + 3%","notes":"Minimum"},
  {"bank":"DFCC","product":"Personal Loan","type":"Floating","tenureLabel":"Personal Loans - Variable (Professionals / Salaried & Others)","source":"https://www.dfcc.lk/interest-rates/lending-rates/","updatedAt":"2025-10-25T08:07:45.751Z","rateWithSalary":"AWPR + 4.5%","rateWithoutSalary":"AWPR + 4.5%","notes":"Maximum"}
];

// Minimal tariff JSON to exercise slab logic and legal computations
const tariffJson = [
  // Processing Fee - Home Loan / LAP slabs
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Processing Fee', description: 'Up to 3,000,000', amount: 'LKR 20,000' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Processing Fee', description: '3,000,001–10,000,000', amount: 'LKR 30,000' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Processing Fee', description: '10,000,001–30,000,000', amount: 'LKR 35,000' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Processing Fee', description: '30,000,001–50,000,000', amount: 'LKR 40,000' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Processing Fee', description: '50,000,001–100,000,000', amount: 'LKR 50,000' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Processing Fee', description: 'Over 100,000,000', amount: 'LKR 75,000' },

  // Processing Fee - Personal Loan
  { bank: 'DFCC Bank', product: 'Personal Loan', feeType: 'Processing Fee', description: 'Up to 500,000', amount: 'LKR 7,500' },
  { bank: 'DFCC Bank', product: 'Personal Loan', feeType: 'Processing Fee', description: '500,001–2,000,000', amount: 'LKR 10,000' },
  { bank: 'DFCC Bank', product: 'Personal Loan', feeType: 'Processing Fee', description: '2,000,001–5,000,000', amount: 'LKR 15,000' },
  { bank: 'DFCC Bank', product: 'Personal Loan', feeType: 'Processing Fee', description: '5,000,001–50,000,000', amount: 'LKR 30,000' },
  { bank: 'DFCC Bank', product: 'Personal Loan', feeType: 'Processing Fee', description: 'Over 50,000,000', amount: 'LKR 75,000' },

  // Processing Fee - Education Loan
  { bank: 'DFCC Bank', product: 'Education Loan', feeType: 'Processing Fee', description: 'Up to 500,000', amount: 'LKR 7,500' },
  { bank: 'DFCC Bank', product: 'Education Loan', feeType: 'Processing Fee', description: '500,001–2,000,000', amount: 'LKR 10,000' },
  { bank: 'DFCC Bank', product: 'Education Loan', feeType: 'Processing Fee', description: '2,000,001–5,000,000', amount: 'LKR 15,000' },
  { bank: 'DFCC Bank', product: 'Education Loan', feeType: 'Processing Fee', description: '5,000,001–10,000,000', amount: 'LKR 30,000' },
  { bank: 'DFCC Bank', product: 'Education Loan', feeType: 'Processing Fee', description: 'Over 10,000,000', amount: 'LKR 75,000' },

  // Legal - Title Report
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Title Report', description: 'Up to 3,000,000', amount: '6,000 + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Title Report', description: '3,000,001–25,000,000', amount: '10,000 + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Title Report', description: 'Over 25,000,000', amount: '15,000 + VAT' },

  // Legal - Mortgage Bond (percentages with minima/cap)
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Mortgage Bond', description: 'Up to 1,000,000', amount: '10,000 + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Mortgage Bond', description: '1,000,001–5,000,000', amount: '0.75% + VAT minimum of Rs 15,000/- + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Mortgage Bond', description: '5,000,001–10,000,000', amount: '0.6% + VAT minimum of Rs 40,000/- + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Mortgage Bond', description: '10,000,001–20,000,000', amount: '0.7% + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Mortgage Bond', description: '20,000,001–50,000,000', amount: '0.5% + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Mortgage Bond', description: '50,000,001–100,000,000', amount: '0.3% + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Mortgage Bond', description: '100,000,001 and above', amount: '0.2% + VAT cap 450,000' },

  // Legal - Guarantees
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Personal/Corporate Guarantees', description: 'Up to 1,000,000', amount: '5,000 + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Personal/Corporate Guarantees', description: '1,000,001–10,000,000', amount: '10,000 + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Personal/Corporate Guarantees', description: '10,000,001–50,000,000', amount: '15,000 + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Personal/Corporate Guarantees', description: '50,000,001 and above', amount: '20,000 + VAT' },

  // Other Charges
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Other Charges', description: 'Mortgage Release/Discharge', amount: 'Rs 5,000 + VAT' },
  { bank: 'DFCC Bank', product: 'Home Loan', feeType: 'Legal Fees - Other Charges', description: 'Site inspection per km', amount: 'Rs 150 per km + VAT' },
];

function baseInputs(partial: Partial<DFCCInputs>): DFCCInputs {
  return {
    bank: 'DFCC',
    product: 'Home Loans',
    amount: 8_000_000,
    tenureYears: 15,
    includeTariffs: true,
    rateType: 'Any',
    salaryRelationship: 'None',
    customerCategory: 'None',
    ...partial,
  };
}

describe('DFCC - Rates & Tariffs', () => {
  it('HL Fixed (Normal) + processing', () => {
    const res = dfccCalculator.calculate(baseInputs({ rateType: 'Fixed' }), ratesJson as any[], tariffJson as any[]);
    expect(res.rates[0]).toMatchObject({ label: 'Fixed - Normal', minAPR: '11.00%', maxAPR: '16.00%' });
    expect(res.processing.amountLKR).toBe(30000);
  });

  it('HL Fixed (Pro & Pinnacle) when professional', () => {
    const res = dfccCalculator.calculate(baseInputs({ rateType: 'Fixed', isProfessional: true }), ratesJson as any[], tariffJson as any[]);
    expect(res.rates.find(r => r.label.includes('Professionals'))).toMatchObject({ minAPR: '10.75%', maxAPR: '14.00%' });
    expect(res.notes).toContain('Professionals & Pinnacle applied');
  });

  it('HL Fixed (Pro & Pinnacle) when VIP customer', () => {
    const res = dfccCalculator.calculate(baseInputs({ rateType: 'Fixed', customerCategory: 'VIP' }), ratesJson as any[], tariffJson as any[]);
    expect(res.rates).toHaveLength(1); // Should ONLY return Pro/Pinnacle, not Normal
    expect(res.rates[0].label).toBe('Fixed - Professionals & Pinnacle');
    expect(res.rates[0].minAPR).toBe('10.75%');
    expect(res.rates[0].maxAPR).toBe('14.00%');
    expect(res.notes).toContain('Professionals & Pinnacle applied');
  });

  it('HL Fixed (Normal) when non-VIP customer', () => {
    const res = dfccCalculator.calculate(baseInputs({ rateType: 'Fixed', customerCategory: 'None', isProfessional: false }), ratesJson as any[], tariffJson as any[]);
    expect(res.rates).toHaveLength(1); // Should ONLY return Normal
    expect(res.rates[0].label).toBe('Fixed - Normal');
    expect(res.rates[0].minAPR).toBe('11.00%');
    expect(res.rates[0].maxAPR).toBe('16.00%');
    expect(res.notes).toBeUndefined(); // No Pro/Pinnacle note
  });

  it('HL Variable shows AWPR margins', () => {
    const res = dfccCalculator.calculate(baseInputs({ rateType: 'Variable', includeTariffs: false }), ratesJson as any[], tariffJson as any[]);
    expect(res.rates).toHaveLength(1);
    expect(res.rates[0].label).toBe('Variable');
    expect(res.rates[0].minAPR).toBe('AWPR + 3%');
    expect(res.rates[0].maxAPR).toBe('AWPR + 5%');
  });

  it('PL Variable + Processing', () => {
    const res = dfccCalculator.calculate(baseInputs({ product: 'Personal Loans', amount: 1_800_000, rateType: 'Variable' }), ratesJson as any[], tariffJson as any[]);
    expect(res.rates[0].label).toBe('Variable');
    expect(res.rates[0].minAPR).toBe('AWPR + 3%');
    expect(res.rates[0].maxAPR).toBe('AWPR + 4.5%');
    expect(res.processing.amountLKR).toBe(10000);
  });

  it('Education Loan Processing', () => {
    const res = dfccCalculator.calculate(baseInputs({ product: 'Education Loans', amount: 6_000_000 }), ratesJson as any[], tariffJson as any[]);
    expect(res.processing.amountLKR).toBe(30000);
  });

  it('Mortgage Bond Calculation with cap not hit', () => {
    const res = dfccCalculator.calculate(baseInputs({ amount: 120_000_000, propertyValue: 115_000_000 }), ratesJson as any[], tariffJson as any[]);
    const bond = (res.legal || []).find(l => l.label === 'Mortgage Bond');
    expect(bond).toBeDefined();
    expect(bond!.amountLKR).toBe(230000);
    expect(bond!.formula).toMatch(/0.2%/);
  });

  it('Mortgage Bond for 10M loan (upper bound of slab)', () => {
    const res = dfccCalculator.calculate(baseInputs({ amount: 10_000_000, propertyValue: 10_000_000 }), ratesJson as any[], tariffJson as any[]);
    const bond = (res.legal || []).find(l => l.label === 'Mortgage Bond');
    expect(bond).toBeDefined();
    expect(bond!.formula).toMatch(/\.6%/);
    expect(bond!.amountLKR).toBe(60000); // 0.6% of 10M = 60,000 (above minimum of 40,000)
  });
});
