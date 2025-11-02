// NSB tariffs calculator tests
import { describe, it, expect } from "vitest";
import { calculateNSBTariffs } from './tariffs';
import type { TariffPayload } from './tariffs';

// Mock payload based on NSB tariff structure
const mockPayload: TariffPayload = {
  bank: "NSB",
  rows: [
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Processing Fees",
      description: "Upto Rs. 2,500,000",
      amount: "Actual Cost",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan", 
      feeType: "Processing Fees",
      description: "Above Rs. 2,500,000",
      amount: "0.5% of the loan amount",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Processing Fees - Government Housing Loan",
      amount: "Rs. 7,500/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Processing Fees - Express",
      description: "4 days",
      amount: "Rs. 50,000/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Processing Fees - Express",
      description: "10 days",
      amount: "Rs. 20,000/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Personal Loan",
      feeType: "Processing Fees",
      description: "Upto Rs. 1 Mn",
      amount: "Rs. 5,000/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Personal Loan",
      feeType: "Processing Fees", 
      description: "1,000,001 to 3 Mn",
      amount: "Rs. 8,500/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Personal Loan",
      feeType: "Processing Fees",
      description: "Above Rs. 3,000,001",
      amount: "Rs. 10,000/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "CRIB report",
      amount: "Rs. 250/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Deed of Release",
      description: "upto Rs. 1 Mn",
      amount: "Rs. 4,500/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Deed of Release",
      description: "above Rs. 1 Mn",
      amount: "Rs. 9,000/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Early Settlement Charges",
      amount: "5.0%",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    }
  ]
};

describe('NSB Tariffs Calculator', () => {
  it('HL, 2.4M, express 10d', () => {
    const result = calculateNSBTariffs(
      { bank: "NSB", product: "Home Loans", amount: 2_400_000, includeTariffs: true, enableExpress: true, expressDays: 10 },
      mockPayload
    );

    expect(result.processing).toMatchObject({
      formula: expect.stringContaining("Actual Cost")
    });
    
    expect(result.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "CRIB report (Retail)", amountLKR: 250 }),
        expect.objectContaining({ label: "Express Service (HL) – 10 days", amountLKR: 20000 })
      ])
    );
  });

  it('HL, 6M → 0.5%', () => {
    const result = calculateNSBTariffs(
      { bank: "NSB", product: "Home Loans", amount: 6_000_000, includeTariffs: true },
      mockPayload
    );

    expect(result.processing).toMatchObject({ 
      amountLKR: 30000 
    });
  });

  it('PL, 2.4M, +1 extra CRIB', () => {
    const result = calculateNSBTariffs(
      { bank: "NSB", product: "Personal Loans", amount: 2_400_000, includeTariffs: true, extraCribParties: 1 },
      mockPayload
    );

    expect(result.processing).toMatchObject({ 
      amountLKR: 8500 
    });
    
    expect(result.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Additional CRIB (beyond bundle)", amountLKR: 250 })
      ])
    );
  });

  it('Government housing loan', () => {
    const result = calculateNSBTariffs(
      { bank: "NSB", product: "Home Loans", amount: 2_000_000, includeTariffs: true, isGovtHousing: true },
      mockPayload
    );

    expect(result.processing).toMatchObject({
      label: "Processing Fee (Govt. Housing)",
      amountLKR: 7500
    });
  });

  it('Express 4 days', () => {
    const result = calculateNSBTariffs(
      { bank: "NSB", product: "Home Loans", amount: 2_000_000, includeTariffs: true, enableExpress: true, expressDays: 4 },
      mockPayload
    );

    expect(result.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Express Service (HL) – 4 days", amountLKR: 50000 })
      ])
    );
  });

  it('Early settlement note', () => {
    const result = calculateNSBTariffs(
      { bank: "NSB", product: "Home Loans", amount: 2_000_000, includeTariffs: true },
      mockPayload
    );

    expect(result.notes).toContain("Early settlement charge: 5% (not included upfront)");
  });

  it('No tariffs when includeTariffs is false', () => {
    const result = calculateNSBTariffs(
      { bank: "NSB", product: "Home Loans", amount: 2_000_000, includeTariffs: false },
      mockPayload
    );

    expect(result).toEqual({});
  });
});