// Commercial Bank Tariff Calculator Tests
import { describe, it, expect } from "vitest";
import {
  combankProcessingHL,
  combankProcessingPL,
  calculateCombankTariff,
} from "./tariff-combank";

describe("Commercial Bank - Home Loan / LAP Processing Fee", () => {
  it("calculates Rs. 7,500 for loans up to Rs. 500,000", () => {
    expect(combankProcessingHL(300_000)).toBe(7_500);
    expect(combankProcessingHL(500_000)).toBe(7_500);
  });

  it("calculates Rs. 12,500 for loans Rs. 500,001 - 1,000,000", () => {
    expect(combankProcessingHL(500_001)).toBe(12_500);
    expect(combankProcessingHL(750_000)).toBe(12_500);
    expect(combankProcessingHL(1_000_000)).toBe(12_500);
  });

  it("calculates Rs. 22,500 for loans Rs. 1,000,001 - 5,000,000", () => {
    expect(combankProcessingHL(1_000_001)).toBe(22_500);
    expect(combankProcessingHL(3_000_000)).toBe(22_500);
    expect(combankProcessingHL(5_000_000)).toBe(22_500);
  });

  it("calculates Rs. 35,000 for loans Rs. 5,000,001 - 10,000,000", () => {
    expect(combankProcessingHL(5_000_001)).toBe(35_000);
    expect(combankProcessingHL(7_500_000)).toBe(35_000);
    expect(combankProcessingHL(10_000_000)).toBe(35_000);
  });

  it("calculates Rs. 45,000 for loans Rs. 10,000,001 - 25,000,000", () => {
    expect(combankProcessingHL(10_000_001)).toBe(45_000);
    expect(combankProcessingHL(12_000_000)).toBe(45_000);
    expect(combankProcessingHL(25_000_000)).toBe(45_000);
  });

  it("calculates Rs. 55,000 for loans Rs. 25,000,001 - 50,000,000", () => {
    expect(combankProcessingHL(25_000_001)).toBe(55_000);
    expect(combankProcessingHL(40_000_000)).toBe(55_000);
    expect(combankProcessingHL(50_000_000)).toBe(55_000);
  });

  it("calculates Rs. 80,000 for loans Rs. 50,000,001 - 100,000,000", () => {
    expect(combankProcessingHL(50_000_001)).toBe(80_000);
    expect(combankProcessingHL(75_000_000)).toBe(80_000);
    expect(combankProcessingHL(100_000_000)).toBe(80_000);
  });

  it("calculates 0.05% for loans Rs. 100,000,001 - 500,000,000", () => {
    expect(combankProcessingHL(100_000_001)).toBe(50_000); // 0.05% of 100M
    expect(combankProcessingHL(220_000_000)).toBe(110_000); // 0.05% of 220M
    expect(combankProcessingHL(500_000_000)).toBe(250_000); // 0.05% of 500M
  });

  it("calculates 0.06% for loans Rs. 500,000,001 - 1,000,000,000", () => {
    expect(combankProcessingHL(500_000_001)).toBe(300_000); // 0.06% of 500M
    expect(combankProcessingHL(750_000_000)).toBe(450_000); // 0.06% of 750M
    expect(combankProcessingHL(1_000_000_000)).toBe(600_000); // 0.06% of 1B
  });

  it("calculates 0.06% for loans over Rs. 1,000,000,000", () => {
    expect(combankProcessingHL(1_500_000_000)).toBe(900_000); // 0.06% of 1.5B
    expect(combankProcessingHL(2_000_000_000)).toBe(1_200_000); // 0.06% of 2B
  });
});

describe("Commercial Bank - Personal Loan Processing Fee", () => {
  it("calculates Rs. 7,000 for loans up to Rs. 500,000", () => {
    expect(combankProcessingPL(300_000)).toBe(7_000);
    expect(combankProcessingPL(500_000)).toBe(7_000);
  });

  it("calculates Rs. 10,000 for loans Rs. 500,001 - 1,000,000", () => {
    expect(combankProcessingPL(500_001)).toBe(10_000);
    expect(combankProcessingPL(750_000)).toBe(10_000);
    expect(combankProcessingPL(1_000_000)).toBe(10_000);
  });

  it("calculates Rs. 12,500 for loans Rs. 1,000,001 - 3,000,000", () => {
    expect(combankProcessingPL(1_000_001)).toBe(12_500);
    expect(combankProcessingPL(2_000_000)).toBe(12_500);
    expect(combankProcessingPL(3_000_000)).toBe(12_500);
  });

  it("calculates Rs. 17,500 for loans Rs. 3,000,001 - 5,000,000", () => {
    expect(combankProcessingPL(3_000_001)).toBe(17_500);
    expect(combankProcessingPL(4_000_000)).toBe(17_500);
    expect(combankProcessingPL(5_000_000)).toBe(17_500);
  });

  it("calculates Rs. 28,000 for loans Rs. 5,000,001 - 8,000,000", () => {
    expect(combankProcessingPL(5_000_001)).toBe(28_000);
    expect(combankProcessingPL(6_500_000)).toBe(28_000);
    expect(combankProcessingPL(8_000_000)).toBe(28_000);
  });

  it("calculates 0.60% for loans over Rs. 8,000,000", () => {
    expect(combankProcessingPL(8_000_001)).toBe(48_000); // 0.60% of 8M
    expect(combankProcessingPL(9_000_000)).toBe(54_000); // 0.60% of 9M
    expect(combankProcessingPL(10_000_000)).toBe(60_000); // 0.60% of 10M
  });

  it("calculates 0.40% with min Rs. 4,000 for TopUp loans", () => {
    expect(combankProcessingPL(500_000, "TopUp")).toBe(4_000); // 0.40% = 2,000, but min 4,000
    expect(combankProcessingPL(1_000_000, "TopUp")).toBe(4_000); // 0.40% = 4,000
    expect(combankProcessingPL(2_000_000, "TopUp")).toBe(8_000); // 0.40% = 8,000
    expect(combankProcessingPL(5_000_000, "TopUp")).toBe(20_000); // 0.40% = 20,000
  });
});

describe("Commercial Bank - Full Tariff Calculation", () => {
  it("calculates complete tariff for Home Loan Rs. 10M", () => {
    const result = calculateCombankTariff({
      product: "HomeLoan",
      loanAmount: 10_000_000,
    });

    expect(result.subtotalProcessing).toBe(35_000);
    expect(result.subtotalLegal).toBe(0);
    expect(result.subtotalValuation).toBe(0);
    expect(result.grandTotalDueAtDisbursement).toBe(35_000);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].label).toBe("Processing Fee (Home Loan)");
  });

  it("calculates complete tariff for LAP Rs. 50M", () => {
    const result = calculateCombankTariff({
      product: "LAP",
      loanAmount: 50_000_000,
    });

    expect(result.subtotalProcessing).toBe(55_000);
    expect(result.subtotalLegal).toBe(0);
    expect(result.grandTotalDueAtDisbursement).toBe(55_000);
    expect(result.rows[0].label).toBe("Processing Fee (LAP)");
  });

  it("calculates complete tariff for Personal Loan Rs. 3M", () => {
    const result = calculateCombankTariff({
      product: "PersonalLoan",
      loanAmount: 3_000_000,
    });

    expect(result.subtotalProcessing).toBe(12_500);
    expect(result.grandTotalDueAtDisbursement).toBe(12_500);
    expect(result.rows[0].label).toBe("Processing Fee (Personal Loan)");
  });

  it("calculates complete tariff for Personal Loan TopUp Rs. 5M", () => {
    const result = calculateCombankTariff({
      product: "PersonalLoan",
      loanAmount: 5_000_000,
      purpose: "TopUp",
    });

    expect(result.subtotalProcessing).toBe(20_000); // 0.40% of 5M
    expect(result.grandTotalDueAtDisbursement).toBe(20_000);
    expect(result.rows[0].basis).toContain("0.40%");
  });

  it("returns zero subtotals for legal and valuation", () => {
    const result = calculateCombankTariff({
      product: "HomeLoan",
      loanAmount: 1_000_000,
    });

    expect(result.subtotalLegal).toBe(0);
    expect(result.subtotalValuation).toBe(0);
    expect(result.applicationFeePaidUpfront).toBe(0);
  });
});
