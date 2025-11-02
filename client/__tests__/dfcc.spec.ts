// DFCC Bank acceptance tests
import { dfccCalculator } from '../src/banks/dfcc';

describe('DFCC Bank Calculator', () => {
  const ratesJson = require('../../output/dfcc.json');
  const tariffJson = require('../../output/dfcc-tariff.json');

  it('HL Fixed (Normal)', () => {
    const result = dfccCalculator.calculate({
      bank: 'DFCC',
      product: 'Home Loans',
      rateType: 'Fixed',
      amount: 8_000_000,
      tenureYears: 15,
      includeTariffs: true,
      salaryRelationship: 'None',
      customerCategory: 'None',
    }, ratesJson, tariffJson);
    expect(result.rates[0]).toMatchObject({ label: 'Fixed - Normal', minAPR: expect.any(String), maxAPR: expect.any(String) });
    expect(result.processing.amountLKR).toBe(30000);
  });

  it('HL Fixed (Pro & Pinnacle)', () => {
    const result = dfccCalculator.calculate({
      bank: 'DFCC',
      product: 'Home Loans',
      rateType: 'Fixed',
      amount: 8_000_000,
      tenureYears: 15,
      includeTariffs: true,
      salaryRelationship: 'None',
      customerCategory: 'None',
      isProfessional: true,
    }, ratesJson, tariffJson);
    expect(result.rates[1]).toMatchObject({ label: 'Fixed - Professionals & Pinnacle', minAPR: expect.any(String), maxAPR: expect.any(String) });
    expect(result.notes).toContain('Professionals & Pinnacle applied');
  });

  it('HL Variable', () => {
    const result = dfccCalculator.calculate({
      bank: 'DFCC',
      product: 'Home Loans',
      rateType: 'Variable',
      amount: 8_000_000,
      tenureYears: 15,
      includeTariffs: false,
      salaryRelationship: 'None',
      customerCategory: 'None',
    }, ratesJson, tariffJson);
    expect(result.rates[0].label).toBe('Variable');
    expect(result.rates[0].minAPR).toMatch(/AWPR/);
  });

  it('PL Variable + Processing', () => {
    const result = dfccCalculator.calculate({
      bank: 'DFCC',
      product: 'Personal Loans',
      rateType: 'Variable',
      amount: 1_800_000,
      tenureYears: 5,
      includeTariffs: true,
      salaryRelationship: 'None',
      customerCategory: 'None',
    }, ratesJson, tariffJson);
    expect(result.rates[0].label).toBe('Variable');
    expect(result.processing.amountLKR).toBe(10000);
  });

  it('Education Loan Processing', () => {
    const result = dfccCalculator.calculate({
      bank: 'DFCC',
      product: 'Education Loans',
      rateType: 'Any',
      amount: 6_000_000,
      tenureYears: 5,
      includeTariffs: true,
      salaryRelationship: 'None',
      customerCategory: 'None',
    }, ratesJson, tariffJson);
    expect(result.processing.amountLKR).toBe(30000);
  });

  it('Mortgage Bond Calculation', () => {
    const result = dfccCalculator.calculate({
      bank: 'DFCC',
      product: 'Home Loans',
      rateType: 'Any',
      amount: 120_000_000,
      propertyValue: 115_000_000,
      tenureYears: 20,
      includeTariffs: true,
      salaryRelationship: 'None',
      customerCategory: 'None',
    }, ratesJson, tariffJson);
    const bond = (result.legal || []).find(l => l.label === 'Mortgage Bond');
    expect(bond).toBeDefined();
    expect(bond.amountLKR).toBeGreaterThan(0);
    expect(bond.formula).toMatch(/0.2%/);
  });
});
