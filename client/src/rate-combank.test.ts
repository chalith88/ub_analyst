// Commercial Bank Rate Selector Tests
import { describe, it, expect } from "vitest";
import { selectBestRate } from "./rate-combank";

describe("Commercial Bank - Home Loan Rate Selection", () => {
  it("selects Standard tier 3y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 3,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(11.0, 5);
    expect(result.rows[0].label).toContain("Standard");
    expect(result.rows[0].label).toContain("3 Years");
  });

  it("selects Standard tier 5y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 5,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(12.5, 5);
  });

  it("selects Standard tier 10y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 10,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(13.5, 5);
  });

  it("selects Standard tier 15y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 15,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(14.5, 5);
  });

  it("selects Premium tier 3y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 3,
      tier: "Premium",
    });

    expect(result.bestRatePct).toBeCloseTo(10.5, 5);
    expect(result.rows[0].label).toContain("Premium");
  });

  it("selects Premium tier 10y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 10,
      tier: "Premium",
    });

    expect(result.bestRatePct).toBeCloseTo(13.0, 5);
  });

  it("selects Platinum tier 3y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 3,
      tier: "Platinum",
    });

    expect(result.bestRatePct).toBeCloseTo(10.0, 5);
    expect(result.rows[0].label).toContain("Platinum");
  });

  it("selects Platinum tier 10y rate", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 10,
      tier: "Platinum",
    });

    expect(result.bestRatePct).toBeCloseTo(12.5, 5);
  });

  it("maps tenure 4y to 5y bucket", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 4,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(12.5, 5); // Same as 5y
  });

  it("maps tenure 7y to 10y bucket", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 7,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(13.5, 5); // Same as 10y
  });

  it("maps tenure 12y to 15y bucket", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 12,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(14.5, 5); // Same as 15y
  });

  it("returns floating rate AWPR+3% for tenure > 15y", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 18,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBe(0); // Without AWPR, returns 0
    expect(result.rows[0].basis).toContain("AWPR");
  });

  it("normalizes AWPR+3% formula when AWPR is provided", () => {
    const awpr = 10.5; // Example AWPR rate
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 20,
      tier: "Premium",
      awpr,
    });

    expect(result.bestRatePct).toBeCloseTo(13.5, 5); // 10.5 + 3 = 13.5
    expect(result.rows[0].basis).toContain("AWPR");
  });

  it("defaults to Standard tier when not specified", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 5,
    });

    expect(result.bestRatePct).toBeCloseTo(12.5, 5);
  });

  it("uses Standard tier when tier is undefined", () => {
    const result = selectBestRate({
      product: "HomeLoan",
      tenureYears: 10,
      tier: undefined,
    });

    expect(result.bestRatePct).toBeCloseTo(13.5, 5); // Standard 10y rate
  });
});

describe("Commercial Bank - Personal Loan Rate Selection", () => {
  it("selects Standard tier 1y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 1,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(12.0, 5);
    expect(result.rows[0].label).toContain("Personal Loan");
  });

  it("selects Standard tier 2y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 2,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(12.5, 5);
  });

  it("selects Standard tier 3y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 3,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(13.0, 5);
  });

  it("selects Standard tier 4-5y rate for 4y tenure", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 4,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(13.5, 5);
    expect(result.rows[0].label).toContain("4-5 Years");
  });

  it("selects Standard tier 4-5y rate for 5y tenure", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 5,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(13.5, 5);
  });

  it("selects Standard tier 7y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 7,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(15.0, 5);
  });

  it("maps tenure 6y to 7y bucket", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 6,
      tier: "Standard",
    });

    expect(result.bestRatePct).toBeCloseTo(15.0, 5); // Same as 7y
  });

  it("selects Premium tier 1y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 1,
      tier: "Premium",
    });

    expect(result.bestRatePct).toBeCloseTo(11.5, 5);
  });

  it("selects Premium tier 7y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 7,
      tier: "Premium",
    });

    expect(result.bestRatePct).toBeCloseTo(14.5, 5);
  });

  it("selects Platinum tier 1y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 1,
      tier: "Platinum",
    });

    expect(result.bestRatePct).toBeCloseTo(11.0, 5);
  });

  it("selects Platinum tier 7y rate", () => {
    const result = selectBestRate({
      product: "PersonalLoan",
      tenureYears: 7,
      tier: "Platinum",
    });

    expect(result.bestRatePct).toBeCloseTo(14.0, 5);
  });
});

describe("Commercial Bank - Education Loan Rate Selection", () => {
  it("selects rate for Personal Guarantors up to 3 years", () => {
    const result = selectBestRate({
      product: "EducationLoan",
      tenureYears: 3,
      guarantorType: "Personal",
    });

    expect(result.bestRatePct).toBeCloseTo(11.5, 5);
    expect(result.rows[0].label).toContain("Personal");
    expect(result.rows[0].label).toContain("Up to 3 Years");
  });

  it("selects rate for Personal Guarantors 4-5 years", () => {
    const result = selectBestRate({
      product: "EducationLoan",
      tenureYears: 5,
      guarantorType: "Personal",
    });

    expect(result.bestRatePct).toBeCloseTo(12.0, 5);
    expect(result.rows[0].label).toContain("4 - 5 Years");
  });

  it("selects rate for Property Mortgage up to 3 years", () => {
    const result = selectBestRate({
      product: "EducationLoan",
      tenureYears: 3,
      guarantorType: "PropertyMortgage",
    });

    expect(result.bestRatePct).toBeCloseTo(11.0, 5);
    expect(result.rows[0].label).toContain("PropertyMortgage");
  });

  it("selects rate for Property Mortgage 5 years", () => {
    const result = selectBestRate({
      product: "EducationLoan",
      tenureYears: 5,
      guarantorType: "PropertyMortgage",
    });

    expect(result.bestRatePct).toBeCloseTo(11.5, 5);
  });

  it("selects rate for Property Mortgage 7 years", () => {
    const result = selectBestRate({
      product: "EducationLoan",
      tenureYears: 7,
      guarantorType: "PropertyMortgage",
    });

    expect(result.bestRatePct).toBeCloseTo(13.0, 5);
  });

  it("throws error when guarantorType missing", () => {
    expect(() =>
      selectBestRate({
        product: "EducationLoan",
        tenureYears: 5,
      })
    ).toThrow("guarantorType");
  });
});

describe("Commercial Bank - LAP Fallback Behavior", () => {
  it("throws error when LAP table missing and fallback disabled", () => {
    // Note: This test assumes combank.json doesn't have LAP product
    // If LAP exists in JSON, this test will fail and should be removed
    expect(() =>
      selectBestRate({
        product: "LAP",
        tenureYears: 10,
        tier: "Standard",
        allowLapUseHomeRates: false,
      })
    ).toThrow("LAP table missing");
  });

  it("uses Home Loan rates when LAP table missing and fallback enabled", () => {
    const result = selectBestRate({
      product: "LAP",
      tenureYears: 10,
      tier: "Standard",
      allowLapUseHomeRates: true,
    });

    expect(result.bestRatePct).toBeCloseTo(13.5, 5); // Same as HL Standard 10y
    expect(result.rows[0].label).toContain("LAP mapped to HL");
  });
});
