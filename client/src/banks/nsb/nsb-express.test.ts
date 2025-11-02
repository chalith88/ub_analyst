// Test for NSB Express Days functionality
import { describe, it, expect } from "vitest";
import { calculateNSBTariffs } from './tariffs';
import type { TariffPayload } from './tariffs';

// Mock payload with express fees
const mockPayload: TariffPayload = {
  bank: "NSB",
  rows: [
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
      product: "Home Loan",
      feeType: "CRIB report",
      amount: "Rs. 250/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    }
  ]
};

describe('NSB Express Days Functionality', () => {
  it('should correctly calculate 4-day express fee', () => {
    const result = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 2_000_000, 
        includeTariffs: true, 
        enableExpress: true, 
        expressDays: 4 
      },
      mockPayload
    );

    expect(result.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ 
          label: "Express Service (HL) – 4 days", 
          amountLKR: 50000 
        })
      ])
    );
  });

  it('should correctly calculate 10-day express fee', () => {
    const result = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 2_000_000, 
        includeTariffs: true, 
        enableExpress: true, 
        expressDays: 10 
      },
      mockPayload
    );

    expect(result.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ 
          label: "Express Service (HL) – 10 days", 
          amountLKR: 20000 
        })
      ])
    );
  });

  it('should default to correct fallback fees when OCR fails', () => {
    // Test with empty payload to trigger fallback values
    const emptyPayload: TariffPayload = { bank: "NSB", rows: [] };
    
    const result4days = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 2_000_000, 
        includeTariffs: true, 
        enableExpress: true, 
        expressDays: 4 
      },
      emptyPayload
    );

    const result10days = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 2_000_000, 
        includeTariffs: true, 
        enableExpress: true, 
        expressDays: 10 
      },
      emptyPayload
    );

    // Should use fallback values when parsing fails
    expect(result4days.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ 
          label: "Express Service (HL) – 4 days", 
          amountLKR: 50000 // Fallback value
        })
      ])
    );

    expect(result10days.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ 
          label: "Express Service (HL) – 10 days", 
          amountLKR: 20000 // Fallback value
        })
      ])
    );
  });

  it('should not include express fees when express is disabled', () => {
    const result = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 2_000_000, 
        includeTariffs: true, 
        enableExpress: false 
      },
      mockPayload
    );

    // Should not have any express service fees
    const expressFees = result.otherFees?.filter(fee => 
      fee.label.includes("Express Service")
    ) || [];
    
    expect(expressFees).toHaveLength(0);
  });
});