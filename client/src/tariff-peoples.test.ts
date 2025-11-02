// client/src/tariff-peoples.test.ts
import { describe, it, expect } from "vitest";
import { computePeoplesTariffs, calculatePeoplesTariff } from "./tariff-peoples";
import { calculateTariff } from "./tariff-calculator";
import type { UserInputs } from "./tariff-calculator";

describe("People's Bank Tariff Calculator", () => {
  describe("computePeoplesTariffs", () => {
    it("should calculate legal fees for loans ≤ 1,000,000 at 1.25%", () => {
      const result = computePeoplesTariffs(800_000);
      
      // 800,000 * 1.25% = 10,000 + 4,500 (title > 500k) + 1,000 + 1,500 = 17,000
      expect(result.subtotalLegal).toBe(17_000);
      expect(result.grandTotalDueAtDisbursement).toBe(17_000);
      
      // Verify breakdown includes correct percentage
      const legalFeeRow = result.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow?.label).toContain("1.25%");
      expect(legalFeeRow?.amount).toBe(10_000); // 800,000 * 1.25% = 10,000
    });

    it("should calculate legal fees for loans 1,000,001 – 25,000,000 at 1.00%", () => {
      const result = computePeoplesTariffs(18_000_000);
      
      // 18,000,000 * 1% = 180,000 + 4,500 (title > 500k) + 1,000 + 1,500 = 187,000
      expect(result.subtotalLegal).toBe(187_000);
      
      const legalFeeRow = result.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow?.label).toContain("1%");
      expect(legalFeeRow?.amount).toBe(180_000);
    });

    it("should calculate legal fees for loans 25,000,001 – 50,000,000 at 0.80%", () => {
      const result = computePeoplesTariffs(30_000_000);
      
      // 30,000,000 * 0.80% = 240,000 + 4,500 + 1,000 + 1,500 = 247,000
      expect(result.subtotalLegal).toBe(247_000);
      
      const legalFeeRow = result.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow?.label).toContain("0.8%");
      expect(legalFeeRow?.amount).toBe(240_000);
    });

    it("should calculate legal fees for loans 50,000,001 – 75,000,000 at 0.75%", () => {
      const result = computePeoplesTariffs(60_000_000);
      
      // 60,000,000 * 0.75% = 450,000 + 4,500 + 1,000 + 1,500 = 457,000
      expect(result.subtotalLegal).toBe(457_000);
      
      const legalFeeRow = result.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow?.label).toContain("0.75%");
      expect(legalFeeRow?.amount).toBe(450_000);
    });

    it("should calculate legal fees for loans 75,000,001 – 100,000,000 at 0.50%", () => {
      const result = computePeoplesTariffs(85_000_000);
      
      // 85,000,000 * 0.50% = 425,000 + 4,500 + 1,000 + 1,500 = 432,000
      expect(result.subtotalLegal).toBe(432_000);
      
      const legalFeeRow = result.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow?.label).toContain("0.5%");
      expect(legalFeeRow?.amount).toBe(425_000);
    });

    it("should calculate legal fees for loans > 100,000,000 at 0.25%", () => {
      const result = computePeoplesTariffs(120_000_000);
      
      // 120,000,000 * 0.25% = 300,000 + 4,500 + 1,000 + 1,500 = 307,000
      expect(result.subtotalLegal).toBe(307_000);
      
      const legalFeeRow = result.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow?.label).toContain("0.25%");
      expect(legalFeeRow?.amount).toBe(300_000);
    });

    it("should include lower examination fee for loans ≤ 500,000", () => {
      const result = computePeoplesTariffs(400_000);
      
      // Should include 2,500 examination fee, not 4,500
      const titleFeeRow = result.rows.find(r => r.label.includes("≤ 500K"));
      expect(titleFeeRow?.amount).toBe(2_500);
      
      // Should not include higher examination fee
      const higherTitleFeeRow = result.rows.find(r => r.label.includes("> 500K"));
      expect(higherTitleFeeRow).toBeUndefined();
    });

    it("should include higher examination fee for loans > 500,000", () => {
      const result = computePeoplesTariffs(600_000);
      
      // Should include 4,500 examination fee, not 2,500
      const titleFeeRow = result.rows.find(r => r.label.includes("> 500K"));
      expect(titleFeeRow?.amount).toBe(4_500);
      
      // Should not include lower examination fee
      const lowerTitleFeeRow = result.rows.find(r => r.label.includes("≤ 500K"));
      expect(lowerTitleFeeRow).toBeUndefined();
    });

    it("should always include Land Registry Extract fees", () => {
      const result = computePeoplesTariffs(1_000_000);
      
      const registryFeeRow = result.rows.find(r => r.label.includes("Land Registry Extract (per extract)"));
      expect(registryFeeRow?.amount).toBe(1_000);
      
      const additionalRegistryFeeRow = result.rows.find(r => r.label.includes("Additional Registry Extract"));
      expect(additionalRegistryFeeRow?.amount).toBe(1_500);
    });

    it("should round total to nearest 10 LKR", () => {
      const result = computePeoplesTariffs(333_333);
      
      // 333,333 * 1.25% = 4,166.66 + 2,500 + 1,000 + 1,500 = 9,166.66
      // Rounded to nearest 10 = 9,170
      expect(result.subtotalLegal).toBe(9_170);
      expect(result.grandTotalDueAtDisbursement).toBe(9_170);
    });

    it("should have zero processing and valuation fees", () => {
      const result = computePeoplesTariffs(1_000_000);
      
      expect(result.subtotalProcessing).toBe(0);
      expect(result.subtotalValuation).toBe(0);
      expect(result.applicationFeePaidUpfront).toBe(0);
    });
  });

  describe("calculatePeoplesTariff", () => {
    it("should work with Housing Loan product", () => {
      const inputs: UserInputs = {
        bank: "PeoplesBank",
        loanAmount: 5_000_000,
        product: "HousingLoan"
      };
      
      const result = calculatePeoplesTariff(inputs);
      
      // 5,000,000 * 1% = 50,000 + 4,500 + 1,000 + 1,500 = 57,000
      expect(result.subtotalLegal).toBe(57_000);
    });

    it("should work with Personal Loan product", () => {
      const inputs: UserInputs = {
        bank: "PeoplesBank",
        loanAmount: 2_000_000,
        product: "PersonalLoan"
      };
      
      const result = calculatePeoplesTariff(inputs);
      
      // Personal Loans exclude legal fees
      expect(result.subtotalLegal).toBe(0);
      expect(result.grandTotalDueAtDisbursement).toBe(0);
      expect(result.rows).toEqual([]);
    });

    it("should exclude legal fees for Personal Loan variants", () => {
      const inputs: UserInputs = {
        bank: "PeoplesBank",
        loanAmount: 3_000_000,
        product: "PersonalLoan_Green"
      };
      
      const result = calculatePeoplesTariff(inputs);
      
      // Personal Loan variants also exclude legal fees
      expect(result.subtotalLegal).toBe(0);
      expect(result.grandTotalDueAtDisbursement).toBe(0);
      expect(result.rows).toEqual([]);
    });

    it("should work with LAP product", () => {
      const inputs: UserInputs = {
        bank: "PeoplesBank",
        loanAmount: 15_000_000,
        product: "LAP"
      };
      
      const result = calculatePeoplesTariff(inputs);
      
      // 15,000,000 * 1% = 150,000 + 4,500 + 1,000 + 1,500 = 157,000
      expect(result.subtotalLegal).toBe(157_000);
    });

    it("should work through the main calculateTariff router", () => {
      const inputs: UserInputs = {
        bank: "PeoplesBank",
        loanAmount: 10_000_000,
        product: "HousingLoan"
      };
      
      // Test through the main router
      const result = calculateTariff(inputs);
      
      // 10,000,000 * 1% = 100,000 + 4,500 + 1,000 + 1,500 = 107,000
      expect(result.subtotalLegal).toBe(107_000);
      expect(result.grandTotalDueAtDisbursement).toBe(107_000);
      
      // Should have the expected number of fee rows
      expect(result.rows.length).toBeGreaterThan(0);
      
      // Should have the legal percentage fee row
      const legalFeeRow = result.rows.find((r: any) => r.key === "legal_percentage");
      expect(legalFeeRow?.label).toContain("1%");
      expect(legalFeeRow?.amount).toBe(100_000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle exact tier boundaries correctly", () => {
      // Test exact boundary at 1,000,000 (should use 1.25%)
      const result1M = computePeoplesTariffs(1_000_000);
      const legalFeeRow1M = result1M.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow1M?.label).toContain("1.25%");
      
      // Test just above boundary at 1,000,001 (should use 1.00%)
      const result1MPlus1 = computePeoplesTariffs(1_000_001);
      const legalFeeRow1MPlus1 = result1MPlus1.rows.find(r => r.key === "legal_percentage");
      expect(legalFeeRow1MPlus1?.label).toContain("1%");
    });

    it("should handle very small loan amounts", () => {
      const result = computePeoplesTariffs(100_000);
      
      // 100,000 * 1.25% = 1,250 + 2,500 + 1,000 + 1,500 = 6,250
      expect(result.subtotalLegal).toBe(6_250);
    });

    it("should handle very large loan amounts", () => {
      const result = computePeoplesTariffs(500_000_000);
      
      // 500,000,000 * 0.25% = 1,250,000 + 4,500 + 1,000 + 1,500 = 1,257,000
      expect(result.subtotalLegal).toBe(1_257_000);
    });
  });
});