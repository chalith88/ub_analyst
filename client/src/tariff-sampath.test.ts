// Sampath Bank Tariff Calculator Tests
import { describe, it, expect } from "vitest";
import {
  sampathProcessing,
  sampathLegalBond,
  calculateSampathTariff,
} from "./tariff-sampath";

describe("Sampath Processing / Advances Fee", () => {
  it("should return Rs. 5,000 for loans up to Rs. 500,000", () => {
    expect(sampathProcessing(100_000)).toBe(5_000);
    expect(sampathProcessing(500_000)).toBe(5_000);
  });

  it("should return Rs. 10,000 for loans Rs. 500,001 - 1,000,000", () => {
    expect(sampathProcessing(500_001)).toBe(10_000);
    expect(sampathProcessing(800_000)).toBe(10_000);
    expect(sampathProcessing(1_000_000)).toBe(10_000);
  });

  it("should return Rs. 20,000 for loans Rs. 1,000,001 - 5,000,000", () => {
    expect(sampathProcessing(1_000_001)).toBe(20_000);
    expect(sampathProcessing(2_000_000)).toBe(20_000);
    expect(sampathProcessing(5_000_000)).toBe(20_000);
  });

  it("should return Rs. 25,000 for loans Rs. 5,000,001 - 10,000,000", () => {
    expect(sampathProcessing(5_000_001)).toBe(25_000);
    expect(sampathProcessing(8_000_000)).toBe(25_000);
    expect(sampathProcessing(10_000_000)).toBe(25_000);
  });

  it("should return 0.25% for loans above Rs. 10,000,000", () => {
    expect(sampathProcessing(10_000_001)).toBe(25_000); // 0.25% of 10,000,001 = 25,000.0025 → 25,000
    expect(sampathProcessing(20_000_000)).toBe(50_000); // 0.25% of 20,000,000
    expect(sampathProcessing(40_000_000)).toBe(100_000); // 0.25% of 40,000,000
  });
});

describe("Sampath Legal Bond Charges", () => {
  it("should return 1.00% for bonds up to Rs. 1,000,000", () => {
    expect(sampathLegalBond(500_000)).toBe(5_000);
    expect(sampathLegalBond(1_000_000)).toBe(10_000);
  });

  it("should return 0.75% for bonds Rs. 1,000,001 - 5,000,000", () => {
    expect(sampathLegalBond(1_000_001)).toBe(7_500); // 0.75% of 1,000,001 = 7,500.0075 → rounds to 7,500
    expect(sampathLegalBond(2_000_000)).toBe(15_000);
    expect(sampathLegalBond(4_000_000)).toBe(30_000);
    expect(sampathLegalBond(5_000_000)).toBe(37_500);
  });

  it("should return 0.50% for bonds Rs. 5,000,001 - 10,000,000", () => {
    expect(sampathLegalBond(5_000_001)).toBe(25_000); // 0.50% of 5,000,001 = 25,000.005 → 25,000
    expect(sampathLegalBond(8_000_000)).toBe(40_000);
    expect(sampathLegalBond(10_000_000)).toBe(50_000);
  });

  it("should return 0.25% for bonds over Rs. 10,000,001", () => {
    expect(sampathLegalBond(10_000_001)).toBe(25_000); // 0.25% of 10,000,001 = 25,000.0025 → 25,000
    expect(sampathLegalBond(20_000_000)).toBe(50_000);
    expect(sampathLegalBond(40_000_000)).toBe(100_000);
  });
});

describe("Sampath TariffResult Integration", () => {
  it("should calculate Personal Loan tariff (processing only)", () => {
    const result = calculateSampathTariff({
      product: "PersonalLoan",
      loanAmount: 2_000_000,
    });

    expect(result.subtotalProcessing).toBe(20_000);
    expect(result.subtotalLegal).toBe(0); // No legal for PL
    expect(result.subtotalValuation).toBe(0);
    expect(result.grandTotalDueAtDisbursement).toBe(20_000);
    expect(result.grandTotalCashOutflow).toBe(20_000);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].key).toBe("processing");
  });

  it("should calculate Home Loan tariff with processing and legal bond", () => {
    const result = calculateSampathTariff({
      product: "HomeLoan",
      loanAmount: 8_000_000,
    });

    expect(result.subtotalProcessing).toBe(25_000); // Rs. 25,000 slab
    expect(result.subtotalLegal).toBe(40_000); // 0.50% of 8M
    expect(result.grandTotalDueAtDisbursement).toBe(65_000);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].key).toBe("processing");
    expect(result.rows[1].key).toBe("legal_bond");
  });

  it("should include mortgage handling fee when requested", () => {
    const result = calculateSampathTariff({
      product: "LAP",
      loanAmount: 12_000_000,
      includeMortgageHandling: true,
    });

    expect(result.subtotalProcessing).toBe(30_000); // 0.25% of 12M
    expect(result.subtotalLegal).toBe(35_000); // 0.25% of 12M (30k) + 5k handling
    expect(result.grandTotalDueAtDisbursement).toBe(65_000);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[2].key).toBe("mortgage_handling");
    expect(result.rows[2].amount).toBe(5_000);
  });

  it("should not include mortgage handling for Personal Loan even if requested", () => {
    const result = calculateSampathTariff({
      product: "PersonalLoan",
      loanAmount: 3_000_000,
      includeMortgageHandling: true, // Should be ignored for PL
    });

    expect(result.subtotalLegal).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows.find((r) => r.key === "mortgage_handling")).toBeUndefined();
  });

  it("should handle large loan amounts correctly", () => {
    const result = calculateSampathTariff({
      product: "HomeLoan",
      loanAmount: 50_000_000,
      includeMortgageHandling: true,
    });

    expect(result.subtotalProcessing).toBe(125_000); // 0.25% of 50M
    expect(result.subtotalLegal).toBe(130_000); // 0.25% of 50M (125k) + 5k handling
    expect(result.grandTotalDueAtDisbursement).toBe(255_000);
  });

  it("should structure fee rows correctly with labels and basis", () => {
    const result = calculateSampathTariff({
      product: "HomeLoan",
      loanAmount: 15_000_000,
      includeMortgageHandling: true,
    });

    expect(result.rows[0]).toMatchObject({
      key: "processing",
      label: "Processing / Advances Fee (Sampath)",
      amount: 37_500, // 0.25% of 15M
      basis: "0.25% of loan amount",
    });

    expect(result.rows[1]).toMatchObject({
      key: "legal_bond",
      label: "Legal Charges (Bond) — Bank Legal Officers",
      amount: 37_500, // 0.25% of 15M
      basis: "0.25% of bond value",
    });

    expect(result.rows[2]).toMatchObject({
      key: "mortgage_handling",
      label: "Mortgage Handling Fee (per property)",
      amount: 5_000,
      basis: "Fixed fee",
      note: "Excludes external agent costs",
    });
  });
});
