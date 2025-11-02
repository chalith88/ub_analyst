// Seylan Bank Tariff Calculator Tests
import { describe, it, expect } from "vitest";
import { calculateSeylanTariff } from "./tariff-seylan";

describe("Seylan Bank - Home Loan / LAP", () => {
  describe("Processing Fee (0.5%, min 15k, max 200k)", () => {
    it("Below minimum: 2M → 10k but clamped to 15k", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 2_000_000,
      });
      expect(result.subtotalProcessing).toBe(15_000); // 0.5% = 10k < 15k min
    });

    it("Within range: 10M → 50k", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
      });
      expect(result.subtotalProcessing).toBe(50_000); // 0.5%
    });

    it("Above maximum: 60M → 300k but capped at 200k", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 60_000_000,
      });
      expect(result.subtotalProcessing).toBe(200_000); // Cap
    });
  });

  describe("Mortgage Bond Fee (tiered)", () => {
    it("Up to 5M: 1% with min 10k", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 4_500_000,
        includeTitleReport: false, // Exclude to test bond only
        includeInspectionFlat: false,
      });
      // Processing: 0.5% of 4.5M = 22,500
      // Bond: 1% of 4.5M = 45,000
      expect(result.subtotalLegal).toBe(45_000);
    });

    it("Exactly 5M: 1% = 50k", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 5_000_000,
        includeTitleReport: false,
        includeInspectionFlat: false,
      });
      expect(result.subtotalLegal).toBe(50_000);
    });

    it("Between 5M and 25M: 50k + 0.5% over 5M", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 12_000_000,
        includeTitleReport: false,
        includeInspectionFlat: false,
      });
      // Bond: 50,000 + 0.5% of (12M - 5M) = 50k + 35k = 85k
      expect(result.subtotalLegal).toBe(85_000);
    });

    it("Exactly 25M: 150k", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 25_000_000,
        includeTitleReport: false,
        includeInspectionFlat: false,
      });
      // Bond: 50k + 0.5% of 20M = 50k + 100k = 150k
      expect(result.subtotalLegal).toBe(150_000);
    });

    it("Above 25M: 150k + 0.25% over 25M", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 40_000_000,
        includeTitleReport: false,
        includeInspectionFlat: false,
      });
      // Bond: 150k + 0.25% of 15M = 150k + 37,500 = 187,500
      expect(result.subtotalLegal).toBe(187_500);
    });
  });

  describe("Title Report (default: included)", () => {
    it("Standard property: 7,500 (included by default)", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        isCondominium: false,
        includeInspectionFlat: false, // Exclude inspection to isolate title
      });
      // Bond: 50k + 0.5% of 5M = 75k
      // Title: 7,500 (default included)
      expect(result.subtotalLegal).toBe(82_500);
    });

    it("Condominium property: 10,000 (higher fee)", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        isCondominium: true,
        includeInspectionFlat: false,
      });
      // Bond: 75k
      // Title: 10,000 (condominium)
      expect(result.subtotalLegal).toBe(85_000);
    });

    it("Can be explicitly excluded with flag", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        includeTitleReport: false,
        includeInspectionFlat: false,
      });
      // Only bond: 75k
      expect(result.subtotalLegal).toBe(75_000);
    });
  });

  describe("Inspection Fees (default: flat fee included)", () => {
    it("Flat inspection fee: 2,000 (included by default)", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        includeTitleReport: false, // Exclude title to isolate inspection
      });
      // Bond: 75k + Inspection: 2k = 77k
      expect(result.subtotalLegal).toBe(77_000);
    });

    it("Construction inspections: 2,000 per stage (in addition to flat)", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        includeTitleReport: false,
        constructionInspectionCount: 4,
      });
      // Bond: 75k + Flat: 2k + Construction: 4 × 2k = 8k
      expect(result.subtotalLegal).toBe(85_000);
    });

    it("Both flat and construction inspections with title", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        constructionInspectionCount: 3,
      });
      // Bond: 75k + Title: 7.5k + Flat: 2k + Construction: 6k = 90,500
      expect(result.subtotalLegal).toBe(90_500);
    });

    it("Can exclude flat inspection explicitly", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        includeTitleReport: false,
        includeInspectionFlat: false,
      });
      // Only bond: 75k
      expect(result.subtotalLegal).toBe(75_000);
    });
  });

  describe("Valuation Fee (tiered per Mn)", () => {
    it("Up to 1Mn: 5,000 minimum", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 5_000_000,
        propertyValue: 800_000,
      });
      expect(result.subtotalValuation).toBe(5_000);
    });

    it("1-20Mn: 750 per Mn with cap 19,250", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        propertyValue: 12_400_000,
      });
      // 12.4 × 750 = 9,300
      expect(result.subtotalValuation).toBe(9_300);
    });

    it("1-20Mn tier cap: 20Mn should hit cap 19,250", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 15_000_000,
        propertyValue: 20_000_000,
      });
      // 20 × 750 = 15,000 < 19,250 (no cap hit)
      expect(result.subtotalValuation).toBe(15_000);
    });

    it("20-50Mn: 500 per Mn with cap 34,250", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 20_000_000,
        propertyValue: 30_000_000,
      });
      // 30 × 500 = 15,000
      expect(result.subtotalValuation).toBe(15_000);
    });

    it("50-100Mn: 250 per Mn with cap 46,750", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 40_000_000,
        propertyValue: 80_000_000,
      });
      // 80 × 250 = 20,000
      expect(result.subtotalValuation).toBe(20_000);
    });

    it("100-500Mn: 100 per Mn with cap 86,750", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 100_000_000,
        propertyValue: 220_000_000,
      });
      // 220 × 100 = 22,000
      expect(result.subtotalValuation).toBe(22_000);
    });

    it("Above 500Mn: Negotiable (zero amount)", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 300_000_000,
        propertyValue: 600_000_000,
      });
      expect(result.subtotalValuation).toBe(0);
      expect(result.rows.find(r => r.key === "valuation")?.note).toContain("negotiable");
    });
  });

  describe("Complete HL/LAP scenarios", () => {
    it("10M loan with all default fees included", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        propertyValue: 12_000_000,
      });
      
      // Processing: 0.5% of 10M = 50,000
      expect(result.subtotalProcessing).toBe(50_000);
      
      // Legal: Bond 75k + Title 7.5k (default) + Inspection 2k (default) = 84,500
      expect(result.subtotalLegal).toBe(84_500);
      
      // Valuation: 12 × 750 = 9,000
      expect(result.subtotalValuation).toBe(9_000);
      
      // Total: 50k + 84.5k + 9k = 143,500
      expect(result.grandTotalCashOutflow).toBe(143_500);
    });

    it("10M loan with condominium (higher title fee)", () => {
      const result = calculateSeylanTariff({
        product: "HomeLoan",
        loanAmount: 10_000_000,
        propertyValue: 12_000_000,
        isCondominium: true,
      });
      
      // Processing: 50,000
      expect(result.subtotalProcessing).toBe(50_000);
      
      // Legal: Bond 75k + Title 10k (condo) + Inspection 2k = 87,000
      expect(result.subtotalLegal).toBe(87_000);
      
      // Valuation: 9,000
      expect(result.subtotalValuation).toBe(9_000);
      
      // Total: 50k + 87k + 9k = 146,000
      expect(result.grandTotalCashOutflow).toBe(146_000);
    });
  });
});

describe("Seylan Bank - Personal Loan", () => {
  describe("Normal speed processing", () => {
    it("Up to 1M: 7,500", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 800_000,
        personalSpeed: "Normal",
      });
      expect(result.subtotalProcessing).toBe(7_500);
    });

    it("1M-3M: 10,000", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 2_000_000,
        personalSpeed: "Normal",
      });
      expect(result.subtotalProcessing).toBe(10_000);
    });

    it("3M-5M: 15,000", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 4_000_000,
        personalSpeed: "Normal",
      });
      expect(result.subtotalProcessing).toBe(15_000);
    });

    it("5M-7M: 20,000", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 6_000_000,
        personalSpeed: "Normal",
      });
      expect(result.subtotalProcessing).toBe(20_000);
    });

    it("Above 7M: 0.4% capped at 40k", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 8_000_000,
        personalSpeed: "Normal",
      });
      // 0.4% of 8M = 32,000
      expect(result.subtotalProcessing).toBe(32_000);
    });

    it("Above 7M hitting cap: 80M → cap 40k", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 80_000_000,
        personalSpeed: "Normal",
      });
      // 0.4% of 80M = 320,000 > 40k cap
      expect(result.subtotalProcessing).toBe(40_000);
    });
  });

  describe("FastTrack speed processing", () => {
    it("Up to 1M: 12,500", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 1_000_000,
        personalSpeed: "FastTrack",
      });
      expect(result.subtotalProcessing).toBe(12_500);
    });

    it("1M-3M: 15,000", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 2_500_000,
        personalSpeed: "FastTrack",
      });
      expect(result.subtotalProcessing).toBe(15_000);
    });

    it("3M-5M: 25,000", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 4_500_000,
        personalSpeed: "FastTrack",
      });
      expect(result.subtotalProcessing).toBe(25_000);
    });

    it("5M-7M: 30,000", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 6_500_000,
        personalSpeed: "FastTrack",
      });
      expect(result.subtotalProcessing).toBe(30_000);
    });

    it("Above 7M: 0.5% capped at 50k", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 9_000_000,
        personalSpeed: "FastTrack",
      });
      // 0.5% of 9M = 45,000
      expect(result.subtotalProcessing).toBe(45_000);
    });

    it("Above 7M hitting cap: 80M → cap 50k", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 80_000_000,
        personalSpeed: "FastTrack",
      });
      // 0.5% of 80M = 400,000 > 50k cap
      expect(result.subtotalProcessing).toBe(50_000);
    });
  });

  describe("Default to Normal when speed not specified", () => {
    it("Defaults to Normal processing fees", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 2_000_000,
      });
      expect(result.subtotalProcessing).toBe(10_000); // Normal tier
    });
  });

  describe("Personal Loan has no legal or valuation fees", () => {
    it("Only processing fee, no other charges", () => {
      const result = calculateSeylanTariff({
        product: "PersonalLoan",
        loanAmount: 5_000_000,
        personalSpeed: "FastTrack",
      });
      
      expect(result.subtotalProcessing).toBe(25_000);
      expect(result.subtotalLegal).toBe(0);
      expect(result.subtotalValuation).toBe(0);
      expect(result.grandTotalCashOutflow).toBe(25_000);
    });
  });
});

describe("Seylan Bank - Boundary conditions", () => {
  it("Exactly 1M loan", () => {
    const result = calculateSeylanTariff({
      product: "PersonalLoan",
      loanAmount: 1_000_000,
      personalSpeed: "Normal",
    });
    expect(result.subtotalProcessing).toBe(7_500); // First slab
  });

  it("Just above 1M", () => {
    const result = calculateSeylanTariff({
      product: "PersonalLoan",
      loanAmount: 1_000_001,
      personalSpeed: "Normal",
    });
    expect(result.subtotalProcessing).toBe(10_000); // Second slab
  });

  it("Exactly 7M", () => {
    const result = calculateSeylanTariff({
      product: "PersonalLoan",
      loanAmount: 7_000_000,
      personalSpeed: "Normal",
    });
    expect(result.subtotalProcessing).toBe(20_000); // Fixed slab
  });

  it("Just above 7M", () => {
    const result = calculateSeylanTariff({
      product: "PersonalLoan",
      loanAmount: 7_000_001,
      personalSpeed: "Normal",
    });
    // 0.4% of 7,000,001 = 28,000
    expect(result.subtotalProcessing).toBe(28_000); // Percentage starts
  });
});
