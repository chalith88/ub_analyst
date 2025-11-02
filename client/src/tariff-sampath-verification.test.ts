// Verification tests matching the screenshots exactly
import { describe, it, expect } from "vitest";
import { calculateSampathTariff } from "./tariff-sampath";

describe("Sampath Tariff - Screenshot Verification", () => {
  it("should match screenshot: 8M Home Loan", () => {
    const result = calculateSampathTariff({
      product: "HomeLoan",
      loanAmount: 8_000_000,
    });

    // Processing: Rs. 5,000,001 - 10,000,000 → Rs. 25,000
    expect(result.subtotalProcessing).toBe(25_000);
    
    // Legal: Rs 5,000,001 - 10,000,000 → 0.50% = Rs. 40,000
    expect(result.subtotalLegal).toBe(40_000);
    
    // Total: Rs. 65,000
    expect(result.grandTotalDueAtDisbursement).toBe(65_000);
  });

  it("should match screenshot: 500K Personal Loan", () => {
    const result = calculateSampathTariff({
      product: "PersonalLoan",
      loanAmount: 500_000,
    });

    // Processing: Up to Rs. 500,000 → Rs. 5,000
    expect(result.subtotalProcessing).toBe(5_000);
    
    // No legal for PL
    expect(result.subtotalLegal).toBe(0);
    
    // Total: Rs. 5,000
    expect(result.grandTotalDueAtDisbursement).toBe(5_000);
  });

  it("should match screenshot: 2M LAP with mortgage handling", () => {
    const result = calculateSampathTariff({
      product: "LAP",
      loanAmount: 2_000_000,
      includeMortgageHandling: true,
    });

    // Processing: Rs. 1,000,001 - 5,000,000 → Rs. 20,000
    expect(result.subtotalProcessing).toBe(20_000);
    
    // Legal: Rs 1,000,001 - 5,000,000 → 0.75% = Rs. 15,000
    // Plus mortgage handling: Rs. 5,000
    expect(result.subtotalLegal).toBe(20_000); // 15,000 + 5,000
    
    // Total: Rs. 40,000
    expect(result.grandTotalDueAtDisbursement).toBe(40_000);
    
    // Verify mortgage handling row exists
    const mortgageRow = result.rows.find(r => r.key === "mortgage_handling");
    expect(mortgageRow).toBeDefined();
    expect(mortgageRow?.amount).toBe(5_000);
  });

  it("should match screenshot: 12M Home Loan (above 10M threshold)", () => {
    const result = calculateSampathTariff({
      product: "HomeLoan",
      loanAmount: 12_000_000,
    });

    // Processing: Above 10.0 Mn → 0.25% = Rs. 30,000
    expect(result.subtotalProcessing).toBe(30_000);
    
    // Legal: Over Rs 10,000,001 → 0.25% = Rs. 30,000
    expect(result.subtotalLegal).toBe(30_000);
    
    // Total: Rs. 60,000
    expect(result.grandTotalDueAtDisbursement).toBe(60_000);
  });

  it("should have correct row labels matching screenshot terminology", () => {
    const result = calculateSampathTariff({
      product: "HomeLoan",
      loanAmount: 5_000_000,
      includeMortgageHandling: true,
    });

    const processingRow = result.rows.find(r => r.key === "processing");
    expect(processingRow?.label).toContain("Processing");
    expect(processingRow?.label).toContain("Advances");
    
    const legalRow = result.rows.find(r => r.key === "legal_bond");
    expect(legalRow?.label).toContain("Legal Charges");
    expect(legalRow?.label).toContain("Bond");
    
    const mortgageRow = result.rows.find(r => r.key === "mortgage_handling");
    expect(mortgageRow?.label).toContain("Mortgage Handling");
  });
});
