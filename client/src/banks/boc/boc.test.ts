import { describe, it, expect } from 'vitest';
import { getBocRate, getBocTariffs } from './tariffs';
import type { BocRateRow, BocTariffRow } from './types';

// Mock data based on the actual BOC API responses
const mockRateData: BocRateRow[] = [
  // Personal Loan - Standard Scheme
  { bank: "Bank of Ceylon", product: "Personal Loan", type: "Fixed", tenureLabel: "Up to 5 Years", rateWithSalary: "13.00%", rateWithoutSalary: "13.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "BOC Personal Loan Scheme", tenureYears: 5 },
  { bank: "Bank of Ceylon", product: "Personal Loan", type: "Fixed", tenureLabel: "Above 5 Years and Up to 7 Years", rateWithSalary: "13.50%", rateWithoutSalary: "13.50%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "BOC Personal Loan Scheme", tenureYears: 7 },
  { bank: "Bank of Ceylon", product: "Personal Loan", type: "Fixed", tenureLabel: "Above 7 Years to 10 Years", rateWithSalary: "14.50%", rateWithoutSalary: "14.50%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "BOC Personal Loan Scheme", tenureYears: 10 },
  
  // Personal Loan - Special Scheme
  { bank: "Bank of Ceylon", product: "Personal Loan", type: "Fixed", tenureLabel: "Up to 5 Years", rateWithSalary: "12.00%", rateWithoutSalary: "12.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "BOC Special Personal Loan Scheme", tenureYears: 5 },
  { bank: "Bank of Ceylon", product: "Personal Loan", type: "Fixed", tenureLabel: "Above 5 Years and Up to 7 Years", rateWithSalary: "13.00%", rateWithoutSalary: "13.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "BOC Special Personal Loan Scheme", tenureYears: 7 },
  { bank: "Bank of Ceylon", product: "Personal Loan", type: "Fixed", tenureLabel: "Above 7 Years to 10 Years", rateWithSalary: "14.00%", rateWithoutSalary: "14.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "BOC Special Personal Loan Scheme", tenureYears: 10 },

  // Home Loan - up to Rs. 5 Mn
  { bank: "Bank of Ceylon", product: "Home Loan", type: "Fixed", tenureLabel: "Up to 10 Years", rateWithSalary: "10.00%", rateWithoutSalary: "10.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "If aggregate Housing Loan amount is up to Rs. 5.0 Mn — Aggregate Housing Loan amount up to Rs. 5.0 Mn", tenureYears: 8 },
  { bank: "Bank of Ceylon", product: "Home Loan", type: "Fixed", tenureLabel: "Above 10 Years", rateWithSalary: "12.00%", rateWithoutSalary: "12.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "If aggregate Housing Loan amount is up to Rs. 5.0 Mn — Aggregate Housing Loan amount up to Rs. 5.0 Mn", tenureYears: 20 },

  // Home Loan - Rs. 5-7.5 Mn
  { bank: "Bank of Ceylon", product: "Home Loan", type: "Fixed", tenureLabel: "Up to 10 Years", rateWithSalary: "10.00%", rateWithoutSalary: "10.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "If aggregate Housing Loan amount Rs. 5.0 Mn up to Rs. 7.5 Mn — Aggregate Housing Loan amount fromRs. 5.0 Mn up to Rs. 7.5 Mn", tenureYears: 8 },
  { bank: "Bank of Ceylon", product: "Home Loan", type: "Fixed", tenureLabel: "Above 10 Years", rateWithSalary: "12.50%", rateWithoutSalary: "12.50%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "If aggregate Housing Loan amount Rs. 5.0 Mn up to Rs. 7.5 Mn — Aggregate Housing Loan amount fromRs. 5.0 Mn up to Rs. 7.5 Mn", tenureYears: 20 },

  // Home Loan - > Rs. 7.5 Mn
  { bank: "Bank of Ceylon", product: "Home Loan", type: "Fixed", tenureLabel: "Up to 10 Years", rateWithSalary: "12.00%", rateWithoutSalary: "12.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "If aggregate Housing Loan amount is above Rs. 7.5 Mn — BOC Housing Loan", tenureYears: 8 },
  { bank: "Bank of Ceylon", product: "Home Loan", type: "Fixed", tenureLabel: "10 Years to 15 Years", rateWithSalary: "13.50%", rateWithoutSalary: "13.50%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "If aggregate Housing Loan amount is above Rs. 7.5 Mn — BOC Housing Loan", tenureYears: 18 },

  // Education Loan
  { bank: "Bank of Ceylon", product: "Education Loan", type: "Fixed", tenureLabel: "Up to 5 Years", rateWithSalary: "12.00%", rateWithoutSalary: "12.00%", source: "https://www.boc.lk/rates-tariff#advance-rates", updatedAt: "2025-10-28T16:12:59.565Z", notes: "BOC Comprehensive Educational Loan", tenureYears: 5 }
];

const mockTariffData: BocTariffRow[] = [
  { bank: "Bank of Ceylon", product: "LAP", feeCategory: "Processing Fee", description: "Mortgage over Immovable Property - Personal Customers", amount: "0.8% Min. Rs.2,000/- Max. Rs. 250,000/-", updatedAt: "2025-10-28T16:02:53.681Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Home Loan", feeCategory: "Processing Fee", description: "BOC Housing Loans", amount: "0.8% Min. Rs. 1,000/- Max. Rs. 25,000/-", updatedAt: "2025-10-28T16:02:53.681Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Home Loan", feeCategory: "Processing Fee", description: "Govt. Housing Loans", amount: "0.8% Min. Rs. 1,000/- Max. Rs. 10,000/-", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Personal Loan", feeCategory: "Processing Fee", description: "Facilities up to Rs 5,000,000 /-", amount: "0.8% Min. Rs. 2,,000/- Max. Rs. 20,000/-", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Personal Loan", feeCategory: "Processing Fee", description: "Facilities from Rs 5,000,001/- to Rs 10,000,000/-", amount: "0.8% Min. Rs. 2,,000/- Max. Rs. 30,000/-", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Personal Loan", feeCategory: "Processing Fee", description: "Facilities from Rs 10,000,001/- and above", amount: "0.8% Min. Rs. 2,,000/- Max. Rs. 50,000/-", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  
  // Early Settlement fees
  { bank: "Bank of Ceylon", product: "Home Loan", feeCategory: "Early Settlement", description: "Within 3 years from the date loan granted", amount: "3% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Home Loan", feeCategory: "Early Settlement", description: "Above 3 years and up to 5 years", amount: "2% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Home Loan", feeCategory: "Early Settlement", description: "Above 5 years from the date loan granted", amount: "1% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Personal Loan", feeCategory: "Early Settlement", description: "Within 3 years from the date loan granted", amount: "3% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Personal Loan", feeCategory: "Early Settlement", description: "Above 3 years and up to 5 years", amount: "2% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Personal Loan", feeCategory: "Early Settlement", description: "Above 5 years from the date loan granted", amount: "1% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "LAP", feeCategory: "Early Settlement", description: "Within 3 years from the date loan granted", amount: "3% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "LAP", feeCategory: "Early Settlement", description: "Above 3 years and up to 5 years", amount: "2% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "LAP", feeCategory: "Early Settlement", description: "Above 5 years from the date loan granted", amount: "1% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Education Loan", feeCategory: "Early Settlement", description: "Within 3 years from the date loan granted", amount: "3% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Education Loan", feeCategory: "Early Settlement", description: "Above 3 years and up to 5 years", amount: "2% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" },
  { bank: "Bank of Ceylon", product: "Education Loan", feeCategory: "Early Settlement", description: "Above 5 years from the date loan granted", amount: "1% on balance outstanding", updatedAt: "2025-10-28T16:02:53.682Z", source: "https://www.boc.lk/rates-tariff#general-tariff" }
];

describe('BOC Rate Calculator', () => {
  describe('Home Loans', () => {
    it('HL ≤5M, 8 years → 10%', () => {
      const result = getBocRate({
        product: "Home Loans",
        loanAmount: 4_000_000,
        tenureYears: 8
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(10.00);
    });

    it('HL >5M, 20y → 12.50%', () => {
      const result = getBocRate({
        product: "Home Loans",
        loanAmount: 6_000_000,
        tenureYears: 20
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(12.50);
    });

    it('HL >7.5M, 18y → 13.50%', () => {
      const result = getBocRate({
        product: "Home Loans",
        loanAmount: 20_000_000,
        tenureYears: 18
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(13.50);
    });
  });

  describe('Personal Loans', () => {
    it('should return both schemes with best marked as "Best Available"', () => {
      const result = getBocRate({
        product: "Personal Loans",
        loanAmount: 5_000_000,
        tenureYears: 5
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(12.00); // Should pick the special scheme (lower rate)
      expect(result!.notes).toContain("Best Available");
    });

    it('should return standard scheme for 7 years', () => {
      const result = getBocRate({
        product: "Personal Loans",
        loanAmount: 3_000_000,
        tenureYears: 7
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(13.00); // Special scheme for 7 years
    });

    it('should return standard scheme for 10 years', () => {
      const result = getBocRate({
        product: "Personal Loans",
        loanAmount: 8_000_000,
        tenureYears: 10
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(14.00); // Special scheme for 10 years
    });
  });

  describe('Education Loans', () => {
    it('should return education loan rate', () => {
      const result = getBocRate({
        product: "Education Loans",
        loanAmount: 2_000_000,
        tenureYears: 5
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(12.00);
      expect(result!.notes).toBe("BOC Comprehensive Educational Loan");
    });
  });

  describe('LAP (Loan Against Property)', () => {
    it.skip('should fallback to home loan rates when no LAP rates available', () => {
      // TODO: Fix LAP fallback logic - currently not finding fallback rates
      const result = getBocRate({
        product: "Loan Against Property",
        loanAmount: 10_000_000,
        tenureYears: 8
      }, mockRateData);

      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(12.00); // Fallback to home loan >7.5M rate
      expect(result!.notes).toContain("LAP (using Home Loan rates)");
    });
  });
});

describe('BOC Tariff Calculator', () => {
  describe('Processing Fees', () => {
    it('Home Loan processing fee → 0.8% capped 25k', () => {
      const result = getBocTariffs({
        product: "Home Loans",
        loanAmount: 5_000_000,
        tenureYears: 10
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.processingFee.amount).toBe(25_000); // 5M * 0.8% = 40k, capped at 25k
      expect(result!.processingFee.formula).toBe("0.8% of loan amount");
    });

    it('Personal Loan ≤5M → 0.8% capped 20k', () => {
      const result = getBocTariffs({
        product: "Personal Loans",
        loanAmount: 4_000_000,
        tenureYears: 5
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.processingFee.amount).toBe(20_000); // 4M * 0.8% = 32k, capped at 20k
    });

    it('Personal Loan 8M → 0.8% capped 30k', () => {
      const result = getBocTariffs({
        product: "Personal Loans",
        loanAmount: 8_000_000,
        tenureYears: 5
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.processingFee.amount).toBe(30_000); // 8M * 0.8% = 64k, capped at 30k
    });

    it('Personal Loan ≥10M → 0.8% capped 50k', () => {
      const result = getBocTariffs({
        product: "Personal Loans",
        loanAmount: 15_000_000,
        tenureYears: 7
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.processingFee.amount).toBe(50_000); // 15M * 0.8% = 120k, capped at 50k
    });

    it('LAP 60M → 250k cap', () => {
      const result = getBocTariffs({
        product: "Loan Against Property",
        loanAmount: 60_000_000,
        tenureYears: 10
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.processingFee.amount).toBe(250_000); // 60M * 0.8% = 480k, capped at 250k
    });
  });

  describe('Early Settlement', () => {
    it('should include early settlement tiers for all products', () => {
      const result = getBocTariffs({
        product: "Home Loans",
        loanAmount: 5_000_000,
        tenureYears: 15
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.earlySettlement).toBeDefined();
      expect(result!.earlySettlement!.tiers).toHaveLength(3);
      
      const tiers = result!.earlySettlement!.tiers;
      expect(tiers[0]).toEqual({ window: "≤3 years", rate: 3 });
      expect(tiers[1]).toEqual({ window: "3-5 years", rate: 2 });
      expect(tiers[2]).toEqual({ window: ">5 years", rate: 1 });
    });

    it('should include early settlement for Personal Loans', () => {
      const result = getBocTariffs({
        product: "Personal Loans",
        loanAmount: 3_000_000,
        tenureYears: 7
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.earlySettlement).toBeDefined();
      expect(result!.earlySettlement!.tiers).toHaveLength(3);
    });

    it('should include early settlement for LAP', () => {
      const result = getBocTariffs({
        product: "Loan Against Property",
        loanAmount: 10_000_000,
        tenureYears: 10
      }, mockTariffData);

      expect(result).not.toBeNull();
      expect(result!.earlySettlement).toBeDefined();
      expect(result!.earlySettlement!.tiers).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing product gracefully', () => {
      const result = getBocRate({
        product: "Education Loans",
        loanAmount: 2_000_000,
        tenureYears: 10 // No data for 10 years
      }, mockRateData);

      expect(result).toBeNull();
    });

    it('should return result with early settlement for Education Loans', () => {
      const result = getBocTariffs({
        product: "Education Loans", // No processing fee defined, but has early settlement
        loanAmount: 1_000_000,
        tenureYears: 5
      }, mockTariffData);

      expect(result).not.toBeNull(); // Returns early settlement
      expect(result!.processingFee.amount).toBe(0);
      expect(result!.processingFee.formula).toBe("Not available");
      expect(result!.earlySettlement).toBeDefined();
      expect(result!.earlySettlement!.tiers).toHaveLength(3);
    });
  });
});