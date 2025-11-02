// Test to verify NSB ancillary fees exclusion
import { describe, it, expect } from "vitest";
import { calculateNSBTariffs } from './tariffs';
import type { TariffPayload } from './tariffs';

// Mock payload with all ancillary fees
const mockPayloadWithAncillaries: TariffPayload = {
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
      feeType: "Deed of Postponement",
      amount: "Rs. 2,500/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    },
    {
      bank: "NSB",
      product: "Home Loan",
      feeType: "Cancellation of Mortgage bond",
      description: "lost by client",
      amount: "Rs. 3,000/ -",
      source: "NSB PDF",
      updatedAt: "2025-10-28"
    }
  ]
};

describe('NSB Ancillary Fees Exclusion', () => {
  it('should exclude optional ancillary fees from upfront calculation', () => {
    const result = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 2_000_000, 
        includeTariffs: true 
      },
      mockPayloadWithAncillaries
    );

    // Should NOT include these optional fees
    const excludedFees = [
      "Deed of Release (≤ 1M)",
      "Deed of Release (> 1M)",
      "Deed of Postponement"
    ];

    excludedFees.forEach(excludedFee => {
      const hasExcludedFee = result.otherFees?.some(fee => 
        fee.label === excludedFee
      ) || false;
      
      expect(hasExcludedFee).toBe(false);
    });

    // Should still include mandatory fees
    expect(result.otherFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "CRIB report (Retail)", amountLKR: 250 }),
        expect.objectContaining({ label: "Cancellation of Mortgage Bond (lost by client)", amountLKR: 3000 })
      ])
    );
  });

  it('should have processing fee but not ancillary fees', () => {
    const result = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 1_500_000, 
        includeTariffs: true 
      },
      mockPayloadWithAncillaries
    );

    // Should have processing fee with actual cost formula
    expect(result.processing).toMatchObject({
      label: "Processing Fee",
      formula: "Actual Cost (≤ LKR 2.5M)"
    });

    // Count of other fees should be limited (CRIB + Cancellation only)
    expect(result.otherFees).toHaveLength(2);
  });

  it('should include only essential fees for basic home loan', () => {
    const basicPayload: TariffPayload = {
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
          feeType: "CRIB report",
          amount: "Rs. 250/ -",
          source: "NSB PDF",
          updatedAt: "2025-10-28"
        }
      ]
    };

    const result = calculateNSBTariffs(
      { 
        bank: "NSB", 
        product: "Home Loans", 
        amount: 1_500_000, 
        includeTariffs: true 
      },
      basicPayload
    );

    // Should have processing fee
    expect(result.processing).toBeDefined();
    
    // Should have only CRIB fee in otherFees
    expect(result.otherFees).toHaveLength(1);
    expect(result.otherFees?.[0]).toMatchObject({
      label: "CRIB report (Retail)",
      amountLKR: 250
    });
  });
});