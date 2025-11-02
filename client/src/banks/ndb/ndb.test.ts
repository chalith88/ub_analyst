// NDB Bank Unit Tests
import { describe, it, expect } from "vitest";
import { calculateTariff, plEarlySettlementPct } from "./tariff";
import { selectBestRate } from "./rates";

describe("NDB Bank - Personal Loan Processing Fees", () => {
  const PL = { bank: "NDB" as const, product: "PersonalLoan" as const, tenureYears: 5 };

  describe("Standard Channel", () => {
    it("PL Standard 150k → 5,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 150_000, plChannel: "Standard" });
      expect(r.subtotalProcessing).toBe(5_000);
      expect(r.rows.find((x) => x.key === "processing")!.amount).toBe(5_000);
    });

    it("PL Standard 700k → 7,500", () => {
      const r = calculateTariff({ ...PL, loanAmount: 700_000, plChannel: "Standard" });
      expect(r.subtotalProcessing).toBe(7_500);
    });

    it("PL Standard 1.5m → 9,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 1_500_000, plChannel: "Standard" });
      expect(r.subtotalProcessing).toBe(9_000);
    });

    it("PL Standard 2.2m → 10,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 2_200_000, plChannel: "Standard" });
      expect(r.subtotalProcessing).toBe(10_000);
    });

    it("PL Standard 8m → 20,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 8_000_000, plChannel: "Standard" });
      expect(r.subtotalProcessing).toBe(20_000);
    });

    it("PL Standard 12m → 25,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 12_000_000, plChannel: "Standard" });
      expect(r.subtotalProcessing).toBe(25_000);
    });
  });

  describe("FastTrack Channel", () => {
    it("PL FastTrack 400k → 10,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 400_000, plChannel: "FastTrack" });
      expect(r.subtotalProcessing).toBe(10_000);
    });

    it("PL FastTrack 1.5m → 11,500", () => {
      const r = calculateTariff({ ...PL, loanAmount: 1_500_000, plChannel: "FastTrack" });
      expect(r.subtotalProcessing).toBe(11_500);
    });

    it("PL FastTrack 3m → 12,500", () => {
      const r = calculateTariff({ ...PL, loanAmount: 3_000_000, plChannel: "FastTrack" });
      expect(r.subtotalProcessing).toBe(12_500);
    });

    it("PL FastTrack 8m → 22,500", () => {
      const r = calculateTariff({ ...PL, loanAmount: 8_000_000, plChannel: "FastTrack" });
      expect(r.subtotalProcessing).toBe(22_500);
    });

    it("PL FastTrack 12m → 27,500", () => {
      const r = calculateTariff({ ...PL, loanAmount: 12_000_000, plChannel: "FastTrack" });
      expect(r.subtotalProcessing).toBe(27_500);
    });
  });

  describe("MortgagedBack Channel", () => {
    it("PL MortgagedBack 600k → 7,500", () => {
      const r = calculateTariff({ ...PL, loanAmount: 600_000, plChannel: "MortgagedBack" });
      expect(r.subtotalProcessing).toBe(7_500);
    });

    it("PL MortgagedBack 1.5m → 9,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 1_500_000, plChannel: "MortgagedBack" });
      expect(r.subtotalProcessing).toBe(9_000);
    });

    it("PL MortgagedBack 4m → 10,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 4_000_000, plChannel: "MortgagedBack" });
      expect(r.subtotalProcessing).toBe(10_000);
    });

    it("PL MortgagedBack 8m → 20,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 8_000_000, plChannel: "MortgagedBack" });
      expect(r.subtotalProcessing).toBe(20_000);
    });

    it("PL MortgagedBack 12m → 25,000", () => {
      const r = calculateTariff({ ...PL, loanAmount: 12_000_000, plChannel: "MortgagedBack" });
      expect(r.subtotalProcessing).toBe(25_000);
    });
  });

  describe("Early Settlement Percentages", () => {
    it("Doctors get 2.5%", () => {
      expect(plEarlySettlementPct({ ...PL, loanAmount: 1_000_000, isProfessional: true })).toBe(2.5);
    });

    it("Others get 5%", () => {
      expect(plEarlySettlementPct({ ...PL, loanAmount: 1_000_000, isProfessional: false })).toBe(5);
    });
  });
});

describe("NDB Bank - Home Loan Processing Fees", () => {
  const HL = { bank: "NDB" as const, product: "HomeLoan" as const, tenureYears: 15 };

  it("HL processing 1m → 20k (2%)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 1_000_000, bondType: "Primary" });
    expect(r.rows.find((x) => x.key === "processing")!.amount).toBe(20_000);
  });

  it("HL processing 3m → 55k (capped)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 3_000_000, bondType: "Primary" });
    expect(r.rows.find((x) => x.key === "processing")!.amount).toBe(55_000);
  });

  it("HL processing 10m → 55k (capped)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 10_000_000, bondType: "Primary" });
    expect(r.rows.find((x) => x.key === "processing")!.amount).toBe(55_000);
  });
});

describe("NDB Bank - Home Loan Primary Bond Fees", () => {
  const HL = { bank: "NDB" as const, product: "HomeLoan" as const, tenureYears: 15 };

  it("Primary bond 300k → 5,000 (1.5% min 5k)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 300_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(5_000);
  });

  it("Primary bond 500k → 7,500 (1.5% = 7.5k)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 500_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(7_500);
  });

  it("Primary bond 800k → 8,000 (1% min 7.5k)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 800_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(8_000);
  });

  it("Primary bond 2m → 15,000 (0.75%)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 2_000_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(15_000);
  });

  it("Primary bond 10m → 75,000 (0.75%)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 10_000_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(75_000);
  });

  it("Primary bond 35m → 237,500 (187.5k + 0.5% of 10m)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 35_000_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(237_500);
  });

  it("Primary bond 60m → 342,500 (312.5k + 0.3% of 10m, capped 450k)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 60_000_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(342_500);
  });

  it("Primary bond 200m → 450,000 (capped)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 200_000_000, bondType: "Primary" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(450_000);
  });
});

describe("NDB Bank - Home Loan Further Bond Fees", () => {
  const HL = { bank: "NDB" as const, product: "HomeLoan" as const, tenureYears: 15 };

  it("Further bond 300k → 5,000", () => {
    const r = calculateTariff({ ...HL, loanAmount: 300_000, bondType: "Further" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(5_000);
  });

  it("Further bond 800k → 7,100 (5k + 0.7% of 300k)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 800_000, bondType: "Further" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(7_100);
  });

  it("Further bond 3m → 18,500 (8.5k + 0.5% of 2m)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 3_000_000, bondType: "Further" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(18_500);
  });

  it("Further bond 15m → 68,500 (28.5k + 0.4% of 10m)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 15_000_000, bondType: "Further" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(68_500);
  });

  it("Further bond 100m → 183,500 (capped)", () => {
    const r = calculateTariff({ ...HL, loanAmount: 100_000_000, bondType: "Further" });
    const bond = r.rows.find((x) => x.key === "bond")!.amount;
    expect(bond).toBe(183_500);
  });
});

describe("NDB Bank - Home Loan Ancillary Legal Fees", () => {
  const HL = { bank: "NDB" as const, product: "HomeLoan" as const, tenureYears: 15, loanAmount: 5_000_000, bondType: "Primary" as const };

  it("Tripartite condo adds 30k", () => {
    const r = calculateTariff({ ...HL, addTripartiteCondo: true });
    expect(r.rows.find((x) => x.key === "tripartite")!.amount).toBe(30_000);
    expect(r.subtotalLegal).toBeGreaterThan(30_000);
  });

  it("Transfer approval adds 10k", () => {
    const r = calculateTariff({ ...HL, addTransferApproval: true });
    expect(r.rows.find((x) => x.key === "transfer_approval")!.amount).toBe(10_000);
  });

  it("Release adds 15k", () => {
    const r = calculateTariff({ ...HL, addRelease: true });
    expect(r.rows.find((x) => x.key === "release")!.amount).toBe(15_000);
  });

  it("Part release adds 5k", () => {
    const r = calculateTariff({ ...HL, addPartRelease: true });
    expect(r.rows.find((x) => x.key === "part_release")!.amount).toBe(5_000);
  });

  it("Other deeds adds 7.5k", () => {
    const r = calculateTariff({ ...HL, addOtherDeeds: true });
    expect(r.rows.find((x) => x.key === "other_deeds")!.amount).toBe(7_500);
  });

  it("Special agreement (valid range 5k-50k)", () => {
    const r = calculateTariff({ ...HL, specialAgreementAmount: 20_000 });
    expect(r.rows.find((x) => x.key === "special_agreement")!.amount).toBe(20_000);
  });

  it("Special agreement below 5k is ignored", () => {
    const r = calculateTariff({ ...HL, specialAgreementAmount: 3_000 });
    expect(r.rows.find((x) => x.key === "special_agreement")).toBeUndefined();
  });

  it("Special agreement above 50k is ignored", () => {
    const r = calculateTariff({ ...HL, specialAgreementAmount: 60_000 });
    expect(r.rows.find((x) => x.key === "special_agreement")).toBeUndefined();
  });

  it("All ancillaries together", () => {
    const r = calculateTariff({
      ...HL,
      addTripartiteCondo: true,
      addTransferApproval: true,
      addRelease: true,
      addPartRelease: true,
      addOtherDeeds: true,
      specialAgreementAmount: 15_000,
    });
    const ancillaryTotal = 30_000 + 10_000 + 15_000 + 5_000 + 7_500 + 15_000;
    expect(r.subtotalLegal).toBeGreaterThanOrEqual(ancillaryTotal);
  });
});

describe("NDB Bank - Rate Selection (Home Loan)", () => {
  it("HL min floating (default preferMin)", () => {
    const r = selectBestRate({ bank: "NDB", product: "HomeLoan", loanAmount: 20_000_000, tenureYears: 20 });
    expect(r.bestRatePct).toBeGreaterThan(0);
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
    expect(r.source).toBe("ndb.json");
  });

  it("HL max floating (preferMin=false)", () => {
    const r = selectBestRate({ bank: "NDB", product: "HomeLoan", loanAmount: 20_000_000, tenureYears: 20, preferMinFloating: false });
    expect(r.bestRatePct).toBeGreaterThan(0);
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("NDB Bank - Rate Selection (Personal Loan)", () => {
  it("PL doctors rate", () => {
    const doc = selectBestRate({ bank: "NDB", product: "PersonalLoan", loanAmount: 3_000_000, tenureYears: 5, isProfessional: true });
    expect(doc.bestRatePct).toBeGreaterThan(0);
    expect(doc.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("PL general rate", () => {
    const gen = selectBestRate({ bank: "NDB", product: "PersonalLoan", loanAmount: 3_000_000, tenureYears: 5, isProfessional: false });
    expect(gen.bestRatePct).toBeGreaterThan(0);
    // Should only show general row when not a professional
    expect(gen.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("PL doctors vs general: doctors rate is lower or equal", () => {
    const doc = selectBestRate({ bank: "NDB", product: "PersonalLoan", loanAmount: 3_000_000, tenureYears: 5, isProfessional: true });
    const gen = selectBestRate({ bank: "NDB", product: "PersonalLoan", loanAmount: 3_000_000, tenureYears: 5, isProfessional: false });
    expect(doc.bestRatePct).toBeLessThanOrEqual(gen.bestRatePct);
  });
});

describe("NDB Bank - Rate Selection (Education Loan)", () => {
  it("Education loan fixed rate", () => {
    const r = selectBestRate({ bank: "NDB", product: "EducationLoan", loanAmount: 2_000_000, tenureYears: 5 });
    expect(r.bestRatePct).toBeGreaterThan(0);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    expect(r.source).toBe("ndb.json");
  });
});

describe("NDB Bank - Full Tariff Calculations", () => {
  it("PL Standard 2.2m total", () => {
    const r = calculateTariff({ bank: "NDB", product: "PersonalLoan", loanAmount: 2_200_000, tenureYears: 5, plChannel: "Standard" });
    expect(r.subtotalProcessing).toBe(10_000);
    expect(r.subtotalLegal).toBe(0);
    expect(r.grandTotalDueAtDisbursement).toBe(10_000);
  });

  it("HL 10m Primary bond total", () => {
    const r = calculateTariff({ bank: "NDB", product: "HomeLoan", loanAmount: 10_000_000, tenureYears: 15, bondType: "Primary" });
    expect(r.subtotalProcessing).toBe(55_000);
    expect(r.subtotalLegal).toBe(75_000);
    expect(r.grandTotalDueAtDisbursement).toBe(130_000);
  });

  it("HL 60m Primary bond with ancillaries", () => {
    const r = calculateTariff({
      bank: "NDB",
      product: "HomeLoan",
      loanAmount: 60_000_000,
      tenureYears: 20,
      bondType: "Primary",
      addTripartiteCondo: true,
      specialAgreementAmount: 25_000,
    });
    expect(r.subtotalProcessing).toBe(55_000);
    const bondBase = 342_500;
    const ancillary = 30_000 + 25_000;
    expect(r.subtotalLegal).toBe(bondBase + ancillary);
    expect(r.grandTotalDueAtDisbursement).toBe(55_000 + bondBase + ancillary);
  });
});
