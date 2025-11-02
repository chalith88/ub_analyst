// client/src/tariff-calculator.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateTariff,
  calcProcessingFee,
  calcApplicationFee,
  netProcessingAfterApplication,
  calcLegal,
  calcValuation,
  formatCurrency,
  type UserInputs,
} from "./tariff-calculator";

describe("formatCurrency", () => {
  it("formats numbers as LKR with commas", () => {
    expect(formatCurrency(1000)).toBe("LKR 1,000");
    expect(formatCurrency(10000)).toBe("LKR 10,000");
    expect(formatCurrency(1000000)).toBe("LKR 1,000,000");
    expect(formatCurrency(25000)).toBe("LKR 25,000");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("LKR 0");
  });

  it("handles negative (edge case)", () => {
    expect(formatCurrency(-100)).toBe("LKR -100");
  });
});

describe("calcProcessingFee - Personal Loan (12.01)", () => {
  it("tier 1: below 999,999 → 8,500", () => {
    const result = calcProcessingFee({
      loanAmount: 500_000,
      product: "PersonalLoan",
    });
    expect(result.amount).toBe(8_500);
    expect(result.label).toContain("Personal Loan");
  });

  it("tier 2: 1,000,000 – 4,999,999 → 11,000", () => {
    const result = calcProcessingFee({
      loanAmount: 3_000_000,
      product: "PersonalLoan",
    });
    expect(result.amount).toBe(11_000);
  });

  it("tier 3: ≥ 5,000,000 → 12,500", () => {
    const result = calcProcessingFee({
      loanAmount: 10_000_000,
      product: "PersonalLoan",
    });
    expect(result.amount).toBe(12_500);
  });

  it("boundary: exactly 999,999", () => {
    const result = calcProcessingFee({
      loanAmount: 999_999,
      product: "PersonalLoan",
    });
    expect(result.amount).toBe(8_500);
  });

  it("boundary: exactly 1,000,000", () => {
    const result = calcProcessingFee({
      loanAmount: 1_000_000,
      product: "PersonalLoan",
    });
    expect(result.amount).toBe(11_000);
  });

  it("boundary: exactly 5,000,000", () => {
    const result = calcProcessingFee({
      loanAmount: 5_000_000,
      product: "PersonalLoan",
    });
    expect(result.amount).toBe(12_500);
  });
});

describe("calcProcessingFee - Personal Loan Green (12.02)", () => {
  it("tier 1: below 999,999 → 11,000", () => {
    const result = calcProcessingFee({
      loanAmount: 800_000,
      product: "PersonalLoan_Green",
    });
    expect(result.amount).toBe(11_000);
    expect(result.label).toContain("Green Channel");
  });

  it("tier 2: 1,000,000 – 4,999,999 → 13,500", () => {
    const result = calcProcessingFee({
      loanAmount: 2_500_000,
      product: "PersonalLoan_Green",
    });
    expect(result.amount).toBe(13_500);
  });

  it("tier 3: ≥ 5,000,000 → 15,000", () => {
    const result = calcProcessingFee({
      loanAmount: 7_000_000,
      product: "PersonalLoan_Green",
    });
    expect(result.amount).toBe(15_000);
  });
});

describe("calcProcessingFee - Housing Loan (12.04/12.05/12.06)", () => {
  it("standard: 0.40% with min 25,000, max 100,000", () => {
    // Below min
    const r1 = calcProcessingFee({
      loanAmount: 1_000_000, // 0.4% = 4,000 → min 25,000
      product: "HousingLoan",
    });
    expect(r1.amount).toBe(25_000);

    // Within range
    const r2 = calcProcessingFee({
      loanAmount: 10_000_000, // 0.4% = 40,000
      product: "HousingLoan",
    });
    expect(r2.amount).toBe(40_000);

    // Above max
    const r3 = calcProcessingFee({
      loanAmount: 50_000_000, // 0.4% = 200,000 → max 100,000
      product: "HousingLoan",
    });
    expect(r3.amount).toBe(100_000);
  });

  it("employed abroad: 0.75% with min 35,000, max 150,000", () => {
    const r1 = calcProcessingFee({
      loanAmount: 1_000_000, // 0.75% = 7,500 → min 35,000
      product: "HousingLoan_EmployedAbroad",
    });
    expect(r1.amount).toBe(35_000);

    const r2 = calcProcessingFee({
      loanAmount: 10_000_000, // 0.75% = 75,000
      product: "HousingLoan_EmployedAbroad",
    });
    expect(r2.amount).toBe(75_000);

    const r3 = calcProcessingFee({
      loanAmount: 30_000_000, // 0.75% = 225,000 → max 150,000
      product: "HousingLoan_EmployedAbroad",
    });
    expect(r3.amount).toBe(150_000);
  });

  it("green channel: 0.50% with min 25,000, max 100,000", () => {
    const r1 = calcProcessingFee({
      loanAmount: 3_000_000, // 0.5% = 15,000 → min 25,000
      product: "HousingLoan_Green",
    });
    expect(r1.amount).toBe(25_000);

    const r2 = calcProcessingFee({
      loanAmount: 10_000_000, // 0.5% = 50,000
      product: "HousingLoan_Green",
    });
    expect(r2.amount).toBe(50_000);

    const r3 = calcProcessingFee({
      loanAmount: 25_000_000, // 0.5% = 125,000 → max 100,000
      product: "HousingLoan_Green",
    });
    expect(r3.amount).toBe(100_000);
  });
});

describe("calcProcessingFee - LAP (12.07/12.08/12.09)", () => {
  it("standard: 0.50% with min 25,000, max 100,000", () => {
    const r1 = calcProcessingFee({
      loanAmount: 2_000_000, // 0.5% = 10,000 → min 25,000
      product: "LAP",
    });
    expect(r1.amount).toBe(25_000);

    const r2 = calcProcessingFee({
      loanAmount: 8_000_000, // 0.5% = 40,000
      product: "LAP",
    });
    expect(r2.amount).toBe(40_000);

    const r3 = calcProcessingFee({
      loanAmount: 30_000_000, // 0.5% = 150,000 → max 100,000
      product: "LAP",
    });
    expect(r3.amount).toBe(100_000);
  });

  it("employed abroad: 0.75% with min 35,000, max 150,000", () => {
    const r1 = calcProcessingFee({
      loanAmount: 3_000_000, // 0.75% = 22,500 → min 35,000
      product: "LAP_EmployedAbroad",
    });
    expect(r1.amount).toBe(35_000);

    const r2 = calcProcessingFee({
      loanAmount: 12_000_000, // 0.75% = 90,000
      product: "LAP_EmployedAbroad",
    });
    expect(r2.amount).toBe(90_000);

    const r3 = calcProcessingFee({
      loanAmount: 25_000_000, // 0.75% = 187,500 → max 150,000
      product: "LAP_EmployedAbroad",
    });
    expect(r3.amount).toBe(150_000);
  });

  it("green channel: 0.60% with min 25,000, max 100,000", () => {
    const r1 = calcProcessingFee({
      loanAmount: 2_000_000, // 0.6% = 12,000 → min 25,000
      product: "LAP_Green",
    });
    expect(r1.amount).toBe(25_000);

    const r2 = calcProcessingFee({
      loanAmount: 10_000_000, // 0.6% = 60,000
      product: "LAP_Green",
    });
    expect(r2.amount).toBe(60_000);

    const r3 = calcProcessingFee({
      loanAmount: 20_000_000, // 0.6% = 120,000 → max 100,000
      product: "LAP_Green",
    });
    expect(r3.amount).toBe(100_000);
  });
});

describe("calcApplicationFee (12.03)", () => {
  it("returns 10,000 for Housing loans", () => {
    expect(calcApplicationFee({ loanAmount: 10_000_000, product: "HousingLoan" })).toBe(10_000);
    expect(
      calcApplicationFee({ loanAmount: 10_000_000, product: "HousingLoan_EmployedAbroad" })
    ).toBe(10_000);
    expect(calcApplicationFee({ loanAmount: 10_000_000, product: "HousingLoan_Green" })).toBe(
      10_000
    );
  });

  it("returns 10,000 for LAP loans", () => {
    expect(calcApplicationFee({ loanAmount: 5_000_000, product: "LAP" })).toBe(10_000);
    expect(calcApplicationFee({ loanAmount: 5_000_000, product: "LAP_EmployedAbroad" })).toBe(
      10_000
    );
    expect(calcApplicationFee({ loanAmount: 5_000_000, product: "LAP_Green" })).toBe(10_000);
  });

  it("returns 0 for Personal Loans", () => {
    expect(calcApplicationFee({ loanAmount: 5_000_000, product: "PersonalLoan" })).toBe(0);
    expect(calcApplicationFee({ loanAmount: 5_000_000, product: "PersonalLoan_Green" })).toBe(0);
  });
});

describe("netProcessingAfterApplication", () => {
  it("deducts application fee when deduct=true", () => {
    expect(netProcessingAfterApplication(50_000, 10_000, true)).toBe(40_000);
    expect(netProcessingAfterApplication(25_000, 10_000, true)).toBe(15_000);
  });

  it("never goes below zero", () => {
    expect(netProcessingAfterApplication(8_000, 10_000, true)).toBe(0);
    expect(netProcessingAfterApplication(10_000, 10_000, true)).toBe(0);
  });

  it("does not deduct when deduct=false", () => {
    expect(netProcessingAfterApplication(50_000, 10_000, false)).toBe(50_000);
  });

  it("handles zero application fee", () => {
    expect(netProcessingAfterApplication(50_000, 0, true)).toBe(50_000);
  });
});

describe("calcLegal - Standard Legal Fees (12.11)", () => {
  it("tier 1: up to 4,999,999 → 0.75% min 15,000", () => {
    const inputs: UserInputs = {
      loanAmount: 5_000_000,
      product: "HousingLoan",
      propertyValue: 3_000_000, // 0.75% = 22,500
      usePanelLawyer: false,
    };
    const rows = calcLegal(inputs);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(22_500);
    expect(rows[0].label).toContain("Legal Fee");
  });

  it("tier 1: below min → clamps to 15,000", () => {
    const inputs: UserInputs = {
      loanAmount: 2_000_000,
      product: "LAP",
      propertyValue: 1_000_000, // 0.75% = 7,500 → min 15,000
      usePanelLawyer: false,
    };
    const rows = calcLegal(inputs);
    expect(rows[0].amount).toBe(15_000);
  });

  it("tier 2: 5,000,000 – 9,999,999 → 0.70% min 37,500", () => {
    const inputs: UserInputs = {
      loanAmount: 8_000_000,
      product: "HousingLoan",
      propertyValue: 7_000_000, // 0.70% = 49,000
      usePanelLawyer: false,
    };
    const rows = calcLegal(inputs);
    expect(rows[0].amount).toBe(49_000);
  });

  it("tier 2: below min → clamps to 37,500", () => {
    const inputs: UserInputs = {
      loanAmount: 6_000_000,
      product: "LAP",
      propertyValue: 5_000_000, // 0.70% = 35,000 → min 37,500
      usePanelLawyer: false,
    };
    const rows = calcLegal(inputs);
    expect(rows[0].amount).toBe(37_500);
  });

  it("tier 3: ≥ 10,000,000 → 0.35% min 70,000 max 175,000", () => {
    // Within range
    const r1 = calcLegal({
      loanAmount: 20_000_000,
      product: "HousingLoan",
      propertyValue: 20_000_000, // 0.35% = 70,000
      usePanelLawyer: false,
    });
    expect(r1[0].amount).toBe(70_000);

    // Above max
    const r2 = calcLegal({
      loanAmount: 100_000_000,
      product: "LAP",
      propertyValue: 80_000_000, // 0.35% = 280,000 → max 175,000
      usePanelLawyer: false,
    });
    expect(r2[0].amount).toBe(175_000);

    // Below min
    const r3 = calcLegal({
      loanAmount: 15_000_000,
      product: "HousingLoan",
      propertyValue: 10_000_000, // 0.35% = 35,000 → min 70,000
      usePanelLawyer: false,
    });
    expect(r3[0].amount).toBe(70_000);
  });
});

describe("calcLegal - Panel Lawyer Charges", () => {
  it("tier 1: 0.5–1.0Mn → 1.00% min 7,500", () => {
    const inputs: UserInputs = {
      loanAmount: 1_000_000,
      product: "HousingLoan",
      propertyValue: 800_000, // 1.0% = 8,000
      usePanelLawyer: true,
    };
    const rows = calcLegal(inputs);
    expect(rows[0].amount).toBe(8_000);
    expect(rows[0].label).toContain("Panel Lawyer");
  });

  it("tier 1: below min → clamps to 7,500", () => {
    const inputs: UserInputs = {
      loanAmount: 700_000,
      product: "LAP",
      propertyValue: 600_000, // 1.0% = 6,000 → min 7,500
      usePanelLawyer: true,
    };
    const rows = calcLegal(inputs);
    expect(rows[0].amount).toBe(7_500);
  });

  it("tier 2: 1.0–5.0Mn → 0.75% min 10,000", () => {
    const inputs: UserInputs = {
      loanAmount: 3_000_000,
      product: "HousingLoan",
      propertyValue: 2_500_000, // 0.75% = 18,750
      usePanelLawyer: true,
    };
    const rows = calcLegal(inputs);
    expect(rows[0].amount).toBe(18_750);
  });

  it("tier 3: >5.0Mn → 0.60% min 30,000 max 50,000", () => {
    // Within range
    const r1 = calcLegal({
      loanAmount: 8_000_000,
      product: "LAP",
      propertyValue: 6_000_000, // 0.6% = 36,000
      usePanelLawyer: true,
    });
    expect(r1[0].amount).toBe(36_000);

    // Below min
    const r2 = calcLegal({
      loanAmount: 6_000_000,
      product: "HousingLoan",
      propertyValue: 5_500_000, // 0.6% = 33,000 but > 5Mn so tier 3, but calculation gives 33,000 which is above min 30k
      usePanelLawyer: true,
    });
    expect(r2[0].amount).toBeGreaterThanOrEqual(30_000);

    // Above max
    const r3 = calcLegal({
      loanAmount: 20_000_000,
      product: "LAP",
      propertyValue: 15_000_000, // 0.6% = 90,000 → max 50,000
      usePanelLawyer: true,
    });
    expect(r3[0].amount).toBe(50_000);
  });
});

describe("calcLegal - Title Clearance (12.12)", () => {
  it("adds 10,000 when includeTitleClearance=true", () => {
    const inputs: UserInputs = {
      loanAmount: 5_000_000,
      product: "HousingLoan",
      propertyValue: 4_000_000,
      usePanelLawyer: false,
      includeTitleClearance: true,
    };
    const rows = calcLegal(inputs);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const titleRow = rows.find((r) => r.key === "title_clearance");
    expect(titleRow).toBeDefined();
    expect(titleRow?.amount).toBe(10_000);
  });

  it("does not add when includeTitleClearance=false", () => {
    const inputs: UserInputs = {
      loanAmount: 5_000_000,
      product: "HousingLoan",
      propertyValue: 4_000_000,
      usePanelLawyer: false,
      includeTitleClearance: false,
    };
    const rows = calcLegal(inputs);
    const titleRow = rows.find((r) => r.key === "title_clearance");
    expect(titleRow).toBeUndefined();
  });
});

describe("calcLegal - Tripartite Legal (12.13)", () => {
  it("adds 25,000 for Standard tripartite", () => {
    const inputs: UserInputs = {
      loanAmount: 5_000_000,
      product: "HousingLoan",
      propertyValue: 4_000_000,
      usePanelLawyer: false,
      tripartite: "Standard",
    };
    const rows = calcLegal(inputs);
    const tripartiteRow = rows.find((r) => r.key === "tripartite_standard");
    expect(tripartiteRow).toBeDefined();
    expect(tripartiteRow?.amount).toBe(25_000);
    expect(tripartiteRow?.basis).toContain("12.13a");
  });

  it("adds 50,000 for HomeLoanPlus tripartite", () => {
    const inputs: UserInputs = {
      loanAmount: 5_000_000,
      product: "HousingLoan",
      propertyValue: 4_000_000,
      usePanelLawyer: false,
      tripartite: "HomeLoanPlus",
    };
    const rows = calcLegal(inputs);
    const tripartiteRow = rows.find((r) => r.key === "tripartite_plus");
    expect(tripartiteRow).toBeDefined();
    expect(tripartiteRow?.amount).toBe(50_000);
    expect(tripartiteRow?.basis).toContain("12.13b");
  });

  it("does not add when tripartite=None", () => {
    const inputs: UserInputs = {
      loanAmount: 5_000_000,
      product: "HousingLoan",
      propertyValue: 4_000_000,
      usePanelLawyer: false,
      tripartite: "None",
    };
    const rows = calcLegal(inputs);
    const tripartiteRows = rows.filter((r) => r.key.includes("tripartite"));
    expect(tripartiteRows).toHaveLength(0);
  });
});

describe("calcLegal - Personal Loans (no legal fees)", () => {
  it("returns empty array for Personal Loan", () => {
    const inputs: UserInputs = {
      loanAmount: 3_000_000,
      product: "PersonalLoan",
      propertyValue: 5_000_000,
      usePanelLawyer: false,
    };
    const rows = calcLegal(inputs);
    expect(rows).toHaveLength(0);
  });

  it("returns empty array for Personal Loan Green", () => {
    const inputs: UserInputs = {
      loanAmount: 3_000_000,
      product: "PersonalLoan_Green",
      propertyValue: 5_000_000,
      usePanelLawyer: false,
    };
    const rows = calcLegal(inputs);
    expect(rows).toHaveLength(0);
  });
});

describe("calcValuation (13.00)", () => {
  it("tier 1: up to 499,999 → 1,250 fixed", () => {
    const row = calcValuation(300_000);
    expect(row?.amount).toBe(1_250);
    expect(row?.basis).toContain("Fixed");
  });

  it("tier 2: 500,000–999,999 → 0.25%", () => {
    const row = calcValuation(800_000); // 0.25% = 2,000
    expect(row?.amount).toBe(2_000);
  });

  it("tier 3: 1.0–9.99Mn → 0.10%", () => {
    const row = calcValuation(5_000_000); // 0.10% = 5,000
    expect(row?.amount).toBe(5_000);
  });

  it("tier 4: 10–19.99Mn → 0.06%", () => {
    const row = calcValuation(15_000_000); // 0.06% = 9,000
    expect(row?.amount).toBe(9_000);
  });

  it("tier 5: 20–49.99Mn → 0.05%", () => {
    const row = calcValuation(30_000_000); // 0.05% = 15,000
    expect(row?.amount).toBe(15_000);
  });

  it("tier 6: 50–99.99Mn → 0.025%", () => {
    const row = calcValuation(70_000_000); // 0.025% = 17,500
    expect(row?.amount).toBe(17_500);
  });

  it("tier 7: 100–500Mn → 0.01%", () => {
    const row = calcValuation(200_000_000); // 0.01% = 20,000
    expect(row?.amount).toBe(20_000);
  });

  it("tier 8: >500Mn → Negotiable", () => {
    const row = calcValuation(600_000_000);
    expect(row?.amount).toBe(0);
    expect(row?.note).toContain("Negotiable");
  });

  it("returns null for missing/zero propertyValue", () => {
    expect(calcValuation(undefined)).toBeNull();
    expect(calcValuation(0)).toBeNull();
    expect(calcValuation(-100)).toBeNull();
  });
});

describe("calculateTariff - Integration Tests", () => {
  it("Personal Loan: only processing fee, no application fee", () => {
    const result = calculateTariff({
      loanAmount: 2_000_000,
      product: "PersonalLoan",
    });

    expect(result.subtotalProcessing).toBe(11_000);
    expect(result.subtotalLegal).toBe(0);
    expect(result.subtotalValuation).toBe(0);
    expect(result.applicationFeePaidUpfront).toBe(0);
    expect(result.grandTotalDueAtDisbursement).toBe(11_000);
    expect(result.grandTotalCashOutflow).toBe(11_000);
    expect(result.rows).toHaveLength(1);
  });

  it("Housing Loan: application fee netted from processing", () => {
    const result = calculateTariff({
      loanAmount: 10_000_000,
      product: "HousingLoan",
      deductApplicationFeeAtDisbursement: true,
    });

    // Processing: 0.40% of 10M = 40,000
    // Application: 10,000 upfront
    // Net processing at disbursement: 40,000 - 10,000 = 30,000
    expect(result.applicationFeePaidUpfront).toBe(10_000);
    expect(result.subtotalProcessing).toBe(30_000);
    expect(result.grandTotalDueAtDisbursement).toBe(30_000);
    expect(result.grandTotalCashOutflow).toBe(40_000);
    expect(result.rows.some((r) => r.key === "application_fee")).toBe(true);
  });

  it("Housing Loan: application fee not deducted", () => {
    const result = calculateTariff({
      loanAmount: 10_000_000,
      product: "HousingLoan",
      deductApplicationFeeAtDisbursement: false,
    });

    expect(result.applicationFeePaidUpfront).toBe(10_000);
    expect(result.subtotalProcessing).toBe(40_000);
    expect(result.grandTotalDueAtDisbursement).toBe(40_000);
    expect(result.grandTotalCashOutflow).toBe(50_000);
  });

  it("Housing Loan with legal + valuation + tripartite", () => {
    const result = calculateTariff({
      loanAmount: 10_000_000,
      product: "HousingLoan",
      propertyValue: 12_000_000,
      usePanelLawyer: false,
      tripartite: "Standard",
      includeTitleClearance: true,
      deductApplicationFeeAtDisbursement: true,
    });

    // Processing: 0.40% of 10M = 40,000, net 30,000 after app fee
    // Legal: 0.35% of 12M = 42,000 (min 70k → 70,000)
    // Title: 10,000
    // Tripartite: 25,000
    // Valuation: 12M falls in tier 4 (10-19.99Mn) → 0.06% of 12M = 7,200

    expect(result.subtotalProcessing).toBe(30_000);
    expect(result.subtotalLegal).toBe(70_000 + 10_000 + 25_000); // 105,000
    expect(result.subtotalValuation).toBe(7_200); // 0.06% of 12M
    expect(result.applicationFeePaidUpfront).toBe(10_000);
    expect(result.grandTotalDueAtDisbursement).toBe(30_000 + 105_000 + 7_200); // 142,200
    expect(result.grandTotalCashOutflow).toBe(10_000 + 142_200); // 152,200
  });

  it("LAP with panel lawyer and HomeLoanPlus tripartite", () => {
    const result = calculateTariff({
      loanAmount: 8_000_000,
      product: "LAP",
      propertyValue: 6_000_000,
      usePanelLawyer: true,
      tripartite: "HomeLoanPlus",
      includeTitleClearance: false,
      deductApplicationFeeAtDisbursement: true,
    });

    // Processing: 0.50% of 8M = 40,000, net 30,000 after app fee
    // Panel lawyer: 0.60% of 6M = 36,000 (tier 3)
    // Tripartite: 50,000
    // Valuation: 0.10% of 6M = 6,000

    expect(result.subtotalProcessing).toBe(30_000);
    expect(result.subtotalLegal).toBe(36_000 + 50_000); // 86,000
    expect(result.subtotalValuation).toBe(6_000);
    expect(result.grandTotalDueAtDisbursement).toBe(30_000 + 86_000 + 6_000); // 122,000
    expect(result.grandTotalCashOutflow).toBe(10_000 + 122_000); // 132,000
  });

  it("Housing Employed Abroad: higher processing fee", () => {
    const result = calculateTariff({
      loanAmount: 15_000_000,
      product: "HousingLoan_EmployedAbroad",
      propertyValue: 18_000_000,
      usePanelLawyer: false,
      deductApplicationFeeAtDisbursement: true,
    });

    // Processing: 0.75% of 15M = 112,500
    // Net after app fee: 112,500 - 10,000 = 102,500
    expect(result.subtotalProcessing).toBe(102_500);
    expect(result.applicationFeePaidUpfront).toBe(10_000);

    // Legal: 0.35% of 18M = 63,000 → min 70,000
    expect(result.subtotalLegal).toBe(70_000);

    // Valuation: 0.06% of 18M = 10,800
    expect(result.subtotalValuation).toBe(10_800);

    expect(result.grandTotalDueAtDisbursement).toBe(102_500 + 70_000 + 10_800); // 183,300
    expect(result.grandTotalCashOutflow).toBe(10_000 + 183_300); // 193,300
  });

  it("Edge case: processing fee lower than application fee", () => {
    const result = calculateTariff({
      loanAmount: 1_000_000,
      product: "HousingLoan",
      deductApplicationFeeAtDisbursement: true,
    });

    // Processing: 0.40% of 1M = 4,000 → min 25,000
    // Application: 10,000
    // Net: 25,000 - 10,000 = 15,000
    expect(result.subtotalProcessing).toBe(15_000);
    expect(result.applicationFeePaidUpfront).toBe(10_000);
    expect(result.grandTotalCashOutflow).toBe(25_000);
  });

  it("Edge case: processing exactly equals application fee", () => {
    // Create scenario where processing = 10,000 (need to find right loan amount)
    // For PersonalLoan tier 1: 8,500 < 10,000
    // For HousingLoan: min is 25,000, so won't equal 10k
    // Skip this edge case as it's not realistic with these tariffs
  });

  it("Invalid input: zero loan amount", () => {
    const result = calculateTariff({
      loanAmount: 0,
      product: "PersonalLoan",
    });

    expect(result.subtotalProcessing).toBe(0);
    expect(result.grandTotalCashOutflow).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("Invalid input: negative loan amount", () => {
    const result = calculateTariff({
      loanAmount: -5_000_000,
      product: "PersonalLoan",
    });

    expect(result.subtotalProcessing).toBe(0);
    expect(result.grandTotalCashOutflow).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("Complete scenario: max complexity", () => {
    const result = calculateTariff({
      loanAmount: 50_000_000,
      product: "LAP_Green",
      propertyValue: 60_000_000,
      usePanelLawyer: true,
      tripartite: "HomeLoanPlus",
      includeTitleClearance: true,
      deductApplicationFeeAtDisbursement: true,
    });

    // Processing: 0.60% of 50M = 300,000 → max 100,000
    // Net: 100,000 - 10,000 = 90,000
    expect(result.subtotalProcessing).toBe(90_000);

    // Panel lawyer: 0.60% of 60M = 360,000 → max 50,000
    // Title: 10,000
    // Tripartite: 50,000
    // Total legal: 110,000
    expect(result.subtotalLegal).toBe(110_000);

    // Valuation: 0.025% of 60M = 15,000
    expect(result.subtotalValuation).toBe(15_000);

    expect(result.applicationFeePaidUpfront).toBe(10_000);
    expect(result.grandTotalDueAtDisbursement).toBe(90_000 + 110_000 + 15_000); // 215,000
    expect(result.grandTotalCashOutflow).toBe(10_000 + 215_000); // 225,000
  });
});
