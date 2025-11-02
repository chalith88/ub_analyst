// Integration Tests - Seylan Bank Complete Offer Generation
import { describe, it, expect } from "vitest";
import {
  calculateTariff,
  selectBestRate,
  generateOffer,
  type RateSelectionInputs,
} from "./tariff-calculator";

describe("Seylan Bank - Integration: Complete Offer Generation", () => {
  describe("generateOffer() - Home Loan scenarios", () => {
    it("Complete HL offer: 10M loan, 10y, Assignment >=700k, WITH credit+IB", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 10_000_000,
        propertyValue: 12_000_000,
        tenureYears: 10,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };

      const offer = generateOffer(inputs);

      // Verify tariff
      expect(offer.tariff).toBeDefined();
      expect(offer.tariff.subtotalProcessing).toBe(50_000); // 0.5% of 10M
      expect(offer.tariff.grandTotalCashOutflow).toBeGreaterThan(0);

      // Verify rate
      expect(offer.rate).toBeDefined();
      expect(offer.rate!.bestRatePct).toBe(11.75); // 10y, >=700k, WITH
      expect(offer.rate!.rows[0].basis).toContain("Assignment with Salary >= 700k");
      expect(offer.rate!.note).toContain("repricing");
    });

    it("HL offer with condominium and construction inspections", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 15_000_000,
        propertyValue: 20_000_000,
        tenureYears: 5,
        salaryRelationship: "Assignment",
        salaryBand: "150k-699k",
        usesCreditAndInternet: false,
        isCondominium: true,
        constructionInspectionCount: 3,
      };

      const offer = generateOffer(inputs);

      // Tariff includes condominium title report (10k) and 3 construction inspections (6k)
      const titleRow = offer.tariff.rows.find((r) => r.key === "title_report");
      expect(titleRow?.amount).toBe(10_000); // Condominium

      const constructionRow = offer.tariff.rows.find(
        (r) => r.key === "inspection_construction"
      );
      expect(constructionRow?.amount).toBe(6_000); // 3 × 2,000

      // Rate for 5y, 150k-699k, WITHOUT
      expect(offer.rate!.bestRatePct).toBe(11.75);
    });

    it("HL offer without salary relationship (Others category)", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 8_000_000,
        propertyValue: 10_000_000,
        tenureYears: 10,
        salaryRelationship: "None",
        usesCreditAndInternet: false,
      };

      const offer = generateOffer(inputs);

      // Processing: 0.5% of 8M = 40k
      expect(offer.tariff.subtotalProcessing).toBe(40_000);

      // Worst rate: Others, WITHOUT
      expect(offer.rate!.bestRatePct).toBe(13.75);
      expect(offer.rate!.rows[0].basis).toContain("Others");
    });
  });

  describe("generateOffer() - LAP scenarios", () => {
    it("Complete LAP offer: 20M loan, 2y, Assignment >=700k", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "LAP",
        loanAmount: 20_000_000,
        propertyValue: 30_000_000,
        tenureYears: 2,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };

      const offer = generateOffer(inputs);

      // Processing: 0.5% of 20M = 100k
      expect(offer.tariff.subtotalProcessing).toBe(100_000);

      // Mortgage bond: 50k + 0.5% of 15M = 50k + 75k = 125k
      const bondRow = offer.tariff.rows.find((r) => r.key === "mortgage_bond");
      expect(bondRow?.amount).toBe(125_000);

      // Rate: 2y, >=700k, WITH
      expect(offer.rate!.bestRatePct).toBe(10.5);
    });

    it("LAP with large loan amount (mortgage bond tier 3)", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "LAP",
        loanAmount: 40_000_000,
        propertyValue: 50_000_000,
        tenureYears: 10,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };

      const offer = generateOffer(inputs);

      // Processing: 0.5% of 40M = 200k (at max)
      expect(offer.tariff.subtotalProcessing).toBe(200_000);

      // Mortgage bond: 150k + 0.25% of 15M = 150k + 37.5k = 187,500
      const bondRow = offer.tariff.rows.find((r) => r.key === "mortgage_bond");
      expect(bondRow?.amount).toBe(187_500);

      // Rate: 10y, >=700k, WITH
      expect(offer.rate!.bestRatePct).toBe(11.75);
    });
  });

  describe("generateOffer() - Personal Loan scenarios", () => {
    it("Complete PL offer: Normal speed, Tier1", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "PersonalLoan",
        loanAmount: 3_000_000,
        tenureYears: 5,
        personalSpeed: "Normal",
        personalLoanTier: "Tier1",
        usesCreditAndInternet: true,
      };

      const offer = generateOffer(inputs);

      // Processing: 10,000 (Normal, 1M-3M slab - 3M is at boundary)
      expect(offer.tariff.subtotalProcessing).toBe(10_000);
      expect(offer.tariff.subtotalLegal).toBe(0); // No legal for PL
      expect(offer.tariff.subtotalValuation).toBe(0); // No valuation for PL

      // Rate: 5y, Tier1, WITH
      expect(offer.rate!.bestRatePct).toBe(12.5);
    });

    it("PL FastTrack with high amount", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "PersonalLoan",
        loanAmount: 12_000_000,
        tenureYears: 5,
        personalSpeed: "FastTrack",
        personalLoanTier: "Tier2",
        usesCreditAndInternet: false,
      };

      const offer = generateOffer(inputs);

      // Processing: 0.5% of 12M = 60k, capped at 50k
      expect(offer.tariff.subtotalProcessing).toBe(50_000);

      // Rate: 5y, Tier2, WITHOUT
      expect(offer.rate!.bestRatePct).toBe(14.0);
    });

    it("PL defaults to Tier3 when not specified", () => {
      const inputs: RateSelectionInputs = {
        bank: "Seylan",
        product: "PersonalLoan",
        loanAmount: 2_000_000,
        tenureYears: 5,
        usesCreditAndInternet: true,
      };

      const offer = generateOffer(inputs);

      // Rate defaults to Tier3
      expect(offer.rate!.bestRatePct).toBe(13.5);
      expect(offer.rate!.rows[0].basis).toContain("Tier 3");
    });
  });

  describe("Direct API calls - calculateTariff() and selectBestRate()", () => {
    it("calculateTariff() works independently for Seylan HL", () => {
      const tariff = calculateTariff({
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 5_000_000,
        propertyValue: 6_000_000,
      });

      expect(tariff.subtotalProcessing).toBe(25_000); // 0.5% of 5M
      expect(tariff.grandTotalCashOutflow).toBeGreaterThan(0);
    });

    it("selectBestRate() works independently for Seylan HL", () => {
      const rate = selectBestRate({
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 5_000_000,
        tenureYears: 5,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      });

      expect(rate.bestRatePct).toBe(11.25);
      expect(rate.rows).toHaveLength(1);
      expect(rate.source).toBeTruthy();
    });

    it("calculateTariff() for Seylan LAP without optional fields", () => {
      const tariff = calculateTariff({
        bank: "Seylan",
        product: "LAP",
        loanAmount: 10_000_000,
        // No propertyValue - should still work
      });

      expect(tariff.subtotalProcessing).toBe(50_000);
      expect(tariff.subtotalValuation).toBe(0); // No valuation without propertyValue
    });

    it("selectBestRate() for Seylan PL with defaults", () => {
      const rate = selectBestRate({
        bank: "Seylan",
        product: "PersonalLoan",
        loanAmount: 1_500_000,
        tenureYears: 1,
        // Defaults: Tier3, usesCreditAndInternet=false
      });

      expect(rate.bestRatePct).toBeGreaterThan(0);
    });
  });

  describe("Tenure mapping in rate selection", () => {
    it("Tenure 3 years → ceil to 5 year bucket", () => {
      const rate = selectBestRate({
        bank: "Seylan",
        product: "HousingLoan", // Uses HousingLoan, internally maps to HomeLoan for Seylan
        loanAmount: 10_000_000,
        tenureYears: 3,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      });

      expect(rate.bestRatePct).toBe(11.25); // Uses 5y bucket
      expect(rate.rows[0].basis).toContain("5 Years"); // May be "5 Years" or "05 Years"
    });

    it("Tenure 15 years → use 10 year bucket (max)", () => {
      const rate = selectBestRate({
        bank: "Seylan",
        product: "LAP",
        loanAmount: 20_000_000,
        tenureYears: 15,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      });

      expect(rate.bestRatePct).toBe(11.75); // Uses 10y bucket
    });
  });

  describe("Backward compatibility - Union Bank and HNB", () => {
    it("Union Bank tariff still works (no rate selection)", () => {
      const offer = generateOffer({
        bank: "UnionBank",
        product: "HousingLoan",
        loanAmount: 5_000_000,
        propertyValue: 6_000_000,
      });

      expect(offer.tariff).toBeDefined();
      expect(offer.rate).toBeUndefined(); // Union Bank doesn't have rate selection yet
    });

    it("HNB tariff still works (no rate selection)", () => {
      const offer = generateOffer({
        bank: "HNB",
        product: "PersonalLoan",
        loanAmount: 500_000,
      });

      expect(offer.tariff).toBeDefined();
      expect(offer.rate).toBeUndefined(); // HNB doesn't have rate selection yet
    });

    it("Default bank is Union Bank", () => {
      const offer = generateOffer({
        // No bank specified
        product: "PersonalLoan",
        loanAmount: 1_000_000,
      });

      expect(offer.tariff).toBeDefined();
      expect(offer.rate).toBeUndefined(); // Union Bank default
    });
  });

  describe("Error handling", () => {
    it("selectBestRate() throws error for Union Bank (not implemented)", () => {
      expect(() =>
        selectBestRate({
          bank: "UnionBank",
          product: "HousingLoan",
          loanAmount: 5_000_000,
          tenureYears: 10,
        })
      ).toThrow("Rate selection not implemented");
    });

    it("generateOffer() handles rate selection failure gracefully", () => {
      // This should not throw - returns tariff even if rate fails
      const offer = generateOffer({
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 10_000_000,
        // Missing tenureYears will cause rate selection to use default
      });

      expect(offer.tariff).toBeDefined();
    });
  });

  describe("Real-world scenarios", () => {
    it("Scenario 1: First-time home buyer, moderate income", () => {
      const offer = generateOffer({
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 8_000_000,
        propertyValue: 10_000_000,
        tenureYears: 10,
        salaryRelationship: "Assignment",
        salaryBand: "150k-699k",
        usesCreditAndInternet: true,
        isCondominium: false,
      });

      expect(offer.tariff.grandTotalCashOutflow).toBeGreaterThan(0);
      expect(offer.rate!.bestRatePct).toBe(12.0); // 10y, 150k-699k, WITH
    });

    it("Scenario 2: High-income professional, premium rate", () => {
      const offer = generateOffer({
        bank: "Seylan",
        product: "HousingLoan",
        loanAmount: 25_000_000,
        propertyValue: 35_000_000,
        tenureYears: 5,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
        isCondominium: true,
        constructionInspectionCount: 4,
      });

      // Best possible rate
      expect(offer.rate!.bestRatePct).toBe(11.25);

      // Full tariff with all fees
      expect(offer.tariff.subtotalProcessing).toBe(125_000); // 0.5% of 25M
      expect(offer.tariff.subtotalLegal).toBeGreaterThan(150_000); // Bond + title + inspections
    });

    it("Scenario 3: Business loan against property", () => {
      const offer = generateOffer({
        bank: "Seylan",
        product: "LAP",
        loanAmount: 30_000_000,
        propertyValue: 40_000_000,
        tenureYears: 5,
        salaryRelationship: "None",
        usesCreditAndInternet: false,
      });

      // Higher rate due to no salary relationship
      expect(offer.rate!.bestRatePct).toBe(12.75); // 5y, Others, WITHOUT
      expect(offer.tariff.subtotalProcessing).toBe(150_000); // 0.5% of 30M
    });

    it("Scenario 4: Personal loan for professional", () => {
      const offer = generateOffer({
        bank: "Seylan",
        product: "PersonalLoan",
        loanAmount: 5_000_000,
        tenureYears: 5,
        personalSpeed: "FastTrack",
        personalLoanTier: "Tier1",
        usesCreditAndInternet: true,
      });

      expect(offer.tariff.subtotalProcessing).toBe(25_000); // FastTrack, 3M-5M
      expect(offer.rate!.bestRatePct).toBe(12.5); // Tier1, WITH
      expect(offer.tariff.grandTotalCashOutflow).toBe(25_000); // PL has no other fees
    });
  });
});
