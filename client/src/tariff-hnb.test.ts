// HNB Tariff Calculator Tests
import { describe, it, expect } from "vitest";
import { hnbDocumentationCharge, calculateHnbTariff } from "./tariff-hnb";

describe("hnbDocumentationCharge", () => {
  describe("Fixed slabs", () => {
    it("Up to 1,000,000 → 10,000", () => {
      expect(hnbDocumentationCharge(500_000)).toBe(10_000);
      expect(hnbDocumentationCharge(1_000_000)).toBe(10_000);
    });

    it("1,000,001 to 5,000,000 → 20,000", () => {
      expect(hnbDocumentationCharge(1_000_001)).toBe(20_000);
      expect(hnbDocumentationCharge(2_500_000)).toBe(20_000);
      expect(hnbDocumentationCharge(5_000_000)).toBe(20_000);
    });

    it("5,000,001 to 10,000,000 → 30,000", () => {
      expect(hnbDocumentationCharge(5_000_001)).toBe(30_000);
      expect(hnbDocumentationCharge(7_000_000)).toBe(30_000);
      expect(hnbDocumentationCharge(10_000_000)).toBe(30_000);
    });

    it("10,000,001 to 25,000,000 → 50,000", () => {
      expect(hnbDocumentationCharge(10_000_001)).toBe(50_000);
      expect(hnbDocumentationCharge(12_000_000)).toBe(50_000);
      expect(hnbDocumentationCharge(25_000_000)).toBe(50_000);
    });

    it("25,000,001 to 50,000,000 → 75,000", () => {
      expect(hnbDocumentationCharge(25_000_001)).toBe(75_000);
      expect(hnbDocumentationCharge(40_000_000)).toBe(75_000);
      expect(hnbDocumentationCharge(50_000_000)).toBe(75_000);
    });
  });

  describe("Percentage slabs (0.2% with 400k cap)", () => {
    it("50,000,001 to 100,000,000 → 0.2% (below cap)", () => {
      // 0.2% of 60M = 120,000
      expect(hnbDocumentationCharge(60_000_000)).toBe(120_000);
      
      // 0.2% of 80M = 160,000
      expect(hnbDocumentationCharge(80_000_000)).toBe(160_000);
      
      // 0.2% of 100M = 200,000
      expect(hnbDocumentationCharge(100_000_000)).toBe(200_000);
    });

    it("Above 100,000,000 → 0.2% capped at 400,000", () => {
      // 0.2% of 200M = 400,000 (exactly at cap)
      expect(hnbDocumentationCharge(200_000_000)).toBe(400_000);
      
      // 0.2% of 500M = 1,000,000 → capped to 400,000
      expect(hnbDocumentationCharge(500_000_000)).toBe(400_000);
      
      // 0.2% of 1B = 2,000,000 → capped to 400,000
      expect(hnbDocumentationCharge(1_000_000_000)).toBe(400_000);
    });
  });

  describe("Boundary conditions", () => {
    it("Exact boundary: 1,000,000", () => {
      expect(hnbDocumentationCharge(1_000_000)).toBe(10_000);
    });

    it("Just above boundary: 1,000,001", () => {
      expect(hnbDocumentationCharge(1_000_001)).toBe(20_000);
    });

    it("Exact boundary: 50,000,000", () => {
      expect(hnbDocumentationCharge(50_000_000)).toBe(75_000);
    });

    it("Just above boundary: 50,000,001", () => {
      // 0.2% of 50,000,001 = 100,000.002 → rounds to 100,000
      expect(hnbDocumentationCharge(50_000_001)).toBe(100_000);
    });
  });

  describe("Edge cases", () => {
    it("Very small amount", () => {
      expect(hnbDocumentationCharge(100)).toBe(10_000);
    });

    it("Zero amount", () => {
      expect(hnbDocumentationCharge(0)).toBe(10_000);
    });
  });
});

describe("calculateHnbTariff", () => {
  it("Returns correct structure with documentation charge only", () => {
    const result = calculateHnbTariff(12_000_000);
    
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      key: "documentation_charges",
      label: "Documentation Charges (HNB)",
      amount: 50_000,
    });
    
    expect(result.subtotalProcessing).toBe(50_000);
    expect(result.subtotalLegal).toBe(0);
    expect(result.subtotalValuation).toBe(0);
    expect(result.applicationFeePaidUpfront).toBe(0);
    expect(result.grandTotalDueAtDisbursement).toBe(50_000);
    expect(result.grandTotalCashOutflow).toBe(50_000);
  });

  it("Documentation charge for 2M loan", () => {
    const result = calculateHnbTariff(2_000_000);
    expect(result.grandTotalCashOutflow).toBe(20_000);
  });

  it("Documentation charge for 100M loan", () => {
    const result = calculateHnbTariff(100_000_000);
    expect(result.grandTotalCashOutflow).toBe(200_000);
  });

  it("Documentation charge caps at 400k for large loans", () => {
    const result = calculateHnbTariff(1_000_000_000);
    expect(result.grandTotalCashOutflow).toBe(400_000);
  });

  it("Basis description matches slab", () => {
    const result1M = calculateHnbTariff(1_000_000);
    expect(result1M.rows[0].basis).toContain("Fixed slab");
    
    const result100M = calculateHnbTariff(100_000_000);
    expect(result100M.rows[0].basis).toContain("0.2%");
    
    const result500M = calculateHnbTariff(500_000_000);
    expect(result500M.rows[0].basis).toContain("capped at 400,000");
  });
});
