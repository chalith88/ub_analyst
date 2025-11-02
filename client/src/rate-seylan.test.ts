// Seylan Bank Rate Selector Tests
import { describe, it, expect } from "vitest";
import { selectBestRate } from "./rate-seylan";
import type { RateInputs } from "./types-seylan";
import { SeylanRateNotFoundError } from "./types-seylan";

describe("Seylan Bank - Rate Selection", () => {
  describe("Home Loan - Tenure Mapping", () => {
    it("Exact match: 1 year", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 1,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(9.0); // From JSON: 01 Year, >=700k, with credit+IB
      expect(result.rows[0].basis).toContain("01 Year");
    });

    it("Exact match: 2 years", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 2,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(10.5); // 02 Years
    });

    it("Exact match: 5 years", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 5,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.25); // 05 Years
    });

    it("Exact match: 10 years", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.75); // 10 Years
    });

    it("Ceil to next bucket: 3 years → use 5 year bucket", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 3,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.25); // Uses 5 year bucket
    });

    it("Ceil to next bucket: 7 years → use 10 year bucket", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 7,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.75); // Uses 10 year bucket
    });

    it("Beyond max: 15 years → use 10 year bucket", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 15,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.75); // Uses 10 year bucket (max)
    });
  });

  describe("Home Loan - Salary Bands with Assignment", () => {
    it("Assignment with Salary >= 700k, WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.75);
      expect(result.rows[0].basis).toContain("Assignment with Salary >= 700k");
      expect(result.rows[0].basis).toContain("With Credit Card & Internet Banking");
    });

    it("Assignment with Salary >= 700k, WITHOUT credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(12.25); // Higher rate without credit+IB
      expect(result.rows[0].basis).toContain("Without Credit Card & Internet Banking");
    });

    it("Assignment with Salary 150k-699k, WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "Assignment",
        salaryBand: "150k-699k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(12.0); // "Below 700k" band
      expect(result.rows[0].basis).toContain("Assignment with Salary 150k-699k");
    });

    it("Assignment with Salary 150k-699k, WITHOUT credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "Assignment",
        salaryBand: "150k-699k",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(12.5);
    });

    it("Assignment with Other band → fallback to Others", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "Assignment",
        salaryBand: "Other",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.0); // "Without salary" with credit+IB
      expect(result.rows[0].basis).toContain("Others");
    });
  });

  describe("Home Loan - No Assignment/Remittance", () => {
    it("No salary relationship, WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "None",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.0); // "Without salary" with credit+IB
      expect(result.rows[0].basis).toContain("Others");
    });

    it("No salary relationship, WITHOUT credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "None",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.75); // Highest rate
    });

    it("Remittance (not Assignment) → use Others", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "Remittance",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.0); // Falls to Others
    });
  });

  describe("LAP - Same logic as Home Loan", () => {
    it("LAP with Assignment >= 700k, WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "LAP",
        tenureYears: 10,
        loanAmount: 15_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.75);
      expect(result.rows[0].label).toContain("LAP");
    });

    it("LAP 5 years, 150k-699k band", () => {
      const inputs: RateInputs = {
        product: "LAP",
        tenureYears: 5,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: "150k-699k",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(11.75); // 5y, below 700k, without
    });
  });

  describe("Personal Loan - Tier Selection", () => {
    it("Tier 1 (Professionals >= 300k), WITH credit+IB, 5 years", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 5,
        loanAmount: 3_000_000,
        personalLoanTier: "Tier1",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(12.5); // From JSON: 05 Years, Tier1, With
      expect(result.rows[0].basis).toContain("Tier 1");
      expect(result.rows[0].basis).toContain("With Credit Card & Internet Banking");
    });

    it("Tier 1, WITHOUT credit+IB", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 5,
        loanAmount: 3_000_000,
        personalLoanTier: "Tier1",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.5); // Higher without credit+IB
    });

    it("Tier 2 (200k-299k), WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 5,
        loanAmount: 3_000_000,
        personalLoanTier: "Tier2",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.0); // Tier2 with
      expect(result.rows[0].basis).toContain("Tier 2");
    });

    it("Tier 2, WITHOUT credit+IB", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 5,
        loanAmount: 3_000_000,
        personalLoanTier: "Tier2",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(14.0);
    });

    it("Tier 3 (CAT A/B >= 200k), WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 5,
        loanAmount: 3_000_000,
        personalLoanTier: "Tier3",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.5); // Tier3 with
      expect(result.rows[0].basis).toContain("Tier 3");
    });

    it("Tier 3, WITHOUT credit+IB", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 5,
        loanAmount: 3_000_000,
        personalLoanTier: "Tier3",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(14.5);
    });

    it("Default to Tier3 when not specified", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 5,
        loanAmount: 3_000_000,
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.5); // Defaults to Tier3
    });

    it("Personal Loan tenure mapping: 3 years → exact 3-year bucket", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 3,
        loanAmount: 2_000_000,
        personalLoanTier: "Tier1",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(12.0); // Uses 3 year bucket per PL table
    });

    it("Personal Loan 1 year", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 1,
        loanAmount: 1_000_000,
        personalLoanTier: "Tier1",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(10.5); // 01 Year, Tier1, With
    });
  });

  describe("Rate Result Structure", () => {
    it("Contains source and repricing note", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.source).toBeTruthy();
      expect(result.note).toContain("repricing");
      expect(result.note).toContain("1%");
    });

    it("Rate row has proper structure", () => {
      const inputs: RateInputs = {
        product: "LAP",
        tenureYears: 5,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].key).toBe("best_rate");
      expect(result.rows[0].label).toContain("Seylan");
      expect(result.rows[0].ratePct).toBe(result.bestRatePct);
      expect(result.rows[0].basis).toBeTruthy();
    });
  });

  describe("Error Handling", () => {
    it("Throws SeylanRateNotFoundError for invalid product", () => {
      const inputs: RateInputs = {
        product: "InvalidProduct" as any,
        tenureYears: 5,
        loanAmount: 10_000_000,
      };
      
      expect(() => selectBestRate(inputs)).toThrow(SeylanRateNotFoundError);
    });

    it("Error contains context information", () => {
      const inputs: RateInputs = {
        product: "InvalidProduct" as any,
        tenureYears: 5,
        loanAmount: 10_000_000,
      };
      
      try {
        selectBestRate(inputs);
        expect.fail("Should have thrown error");
      } catch (err) {
        expect(err).toBeInstanceOf(SeylanRateNotFoundError);
        const error = err as SeylanRateNotFoundError;
        expect(error.context.product).toBe("InvalidProduct");
      }
    });
  });

  describe("Edge Cases and Defaults", () => {
    it("Defaults salaryRelationship to None", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 10_000_000,
        // No salaryRelationship specified
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.0); // Others category
    });

    it("Defaults salaryBand to Other", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        // No salaryBand specified
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.0); // Falls to Others
    });

    it("Defaults usesCreditAndInternet to false", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 10_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        // No usesCreditAndInternet specified
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(12.25); // Without credit+IB rate
    });
  });

  describe("Complete Scenarios", () => {
    it("Best rate scenario: HL, 1y, Assignment >=700k, WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 1,
        loanAmount: 20_000_000,
        salaryRelationship: "Assignment",
        salaryBand: ">=700k",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(9.0); // Lowest rate
    });

    it("Worst rate scenario: HL, 10y, No relationship, WITHOUT credit+IB", () => {
      const inputs: RateInputs = {
        product: "HomeLoan",
        tenureYears: 10,
        loanAmount: 20_000_000,
        salaryRelationship: "None",
        usesCreditAndInternet: false,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(13.75); // Highest rate
    });

    it("Personal Loan best rate: Tier1, WITH credit+IB", () => {
      const inputs: RateInputs = {
        product: "PersonalLoan",
        tenureYears: 1,
        loanAmount: 1_500_000,
        personalLoanTier: "Tier1",
        usesCreditAndInternet: true,
      };
      
      const result = selectBestRate(inputs);
      expect(result.bestRatePct).toBe(10.5); // Best PL rate
    });
  });
});
