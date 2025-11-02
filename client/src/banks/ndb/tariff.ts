// NDB Bank Tariff Calculator
// Local types (mirroring prompt)
export interface UserInputs {
  bank: string;
  product: "HomeLoan" | "PersonalLoan" | "EducationLoan";
  loanAmount: number;
  tenureYears: number;
  isProfessional?: boolean;
  plChannel?: "Standard" | "FastTrack" | "MortgagedBack";
  bondType?: "Primary" | "Further";
  addTripartiteCondo?: boolean;
  addTransferApproval?: boolean;
  addRelease?: boolean;
  addPartRelease?: boolean;
  addOtherDeeds?: boolean;
  specialAgreementAmount?: number;
  preferMinFloating?: boolean;
}

export interface FeeRow {
  key: string;
  label: string;
  amount: number;
  basis?: string;
  note?: string;
}

export interface TariffResult {
  rows: FeeRow[];
  subtotalProcessing: number;
  subtotalLegal: number;
  subtotalValuation: number;
  applicationFeePaidUpfront: number;
  grandTotalDueAtDisbursement: number;
  grandTotalCashOutflow: number;
}

// Helper functions
const pct = (n: number, p: number) => Math.round(n * p);
const clamp = (n: number, lo?: number, hi?: number) => Math.min(hi ?? n, Math.max(lo ?? n, n));

// Utility for PL early settlement fee
export function plEarlySettlementPct(inputs: UserInputs): number {
  return inputs.isProfessional ? 2.5 : 5;
}

export function calculateTariff(inputs: UserInputs): TariffResult {
  const rows: FeeRow[] = [];
  let subtotalProcessing = 0;
  let subtotalLegal = 0;
  let subtotalValuation = 0;
  let applicationFeePaidUpfront = 0;

  // --- Personal Loan Processing Fee ---
  if (inputs.product === "PersonalLoan") {
    const amt = inputs.loanAmount;
    const ch = inputs.plChannel || "Standard";
    let fee = 0;
    if (ch === "Standard") {
      if (amt >= 100_000 && amt < 500_000) fee = 5_000;
      else if (amt < 1_000_000) fee = 7_500;
      else if (amt < 2_000_000) fee = 9_000;
      else if (amt <= 6_000_000) fee = 10_000;
      else if (amt <= 10_000_000) fee = 20_000;
      else fee = 25_000;
    } else if (ch === "FastTrack") {
      if (amt >= 100_000 && amt < 1_000_000) fee = 10_000;
      else if (amt < 2_000_000) fee = 11_500;
      else if (amt <= 6_000_000) fee = 12_500;
      else if (amt <= 10_000_000) fee = 22_500;
      else fee = 27_500;
    } else if (ch === "MortgagedBack") {
      if (amt >= 100_000 && amt < 1_000_000) fee = 7_500;
      else if (amt < 2_000_000) fee = 9_000;
      else if (amt <= 6_000_000) fee = 10_000;
      else if (amt <= 10_000_000) fee = 20_000;
      else fee = 25_000;
    }
    rows.push({ key: "processing", label: `Processing Fee (${ch})`, amount: fee, basis: "flat" });
    subtotalProcessing += fee;
  }

  // --- Home Loan Processing Fee ---
  if (inputs.product === "HomeLoan") {
    const amt = inputs.loanAmount;
    let fee = pct(amt, 0.02);
    fee = clamp(fee, undefined, 55_000);
    rows.push({ key: "processing", label: "Processing Fee (2% capped 55k)", amount: fee, basis: "percent" });
    subtotalProcessing += fee;
  }

  // --- Home Loan Legal/Bond Fees ---
  if (inputs.product === "HomeLoan") {
    const amt = inputs.loanAmount;
    const bondType = inputs.bondType || "Primary";
    let bond = 0;
    if (bondType === "Primary") {
      if (amt <= 500_000) {
        bond = pct(amt, 0.015);
        if (bond < 5_000) bond = 5_000;
      } else if (amt <= 1_000_000) {
        bond = pct(amt, 0.01);
        if (bond < 7_500) bond = 7_500;
      } else if (amt <= 25_000_000) {
        bond = pct(amt, 0.0075);
        if (bond < 10_000) bond = 10_000;
      } else if (amt <= 50_000_000) {
        bond = 187_500 + pct(amt - 25_000_000, 0.005);
      } else {
        bond = 312_500 + pct(amt - 50_000_000, 0.003);
        if (bond > 450_000) bond = 450_000;
      }
    } else {
      // Further Bond
      if (amt <= 500_000) {
        bond = 5_000;
      } else if (amt <= 1_000_000) {
        bond = 5_000 + pct(amt - 500_000, 0.007);
      } else if (amt <= 5_000_000) {
        bond = 8_500 + pct(amt - 1_000_000, 0.005);
      } else if (amt <= 25_000_000) {
        bond = 28_500 + pct(amt - 5_000_000, 0.004);
      } else {
        bond = 108_500 + pct(amt - 25_000_000, 0.003);
        if (bond > 183_500) bond = 183_500;
      }
    }
    rows.push({ key: "bond", label: `${bondType} Bond Legal Fee`, amount: bond, basis: "percent" });
    subtotalLegal += bond;
  }

  // --- Ancillary legal items ---
  if (inputs.product === "HomeLoan") {
    if (inputs.addTripartiteCondo) {
      rows.push({ key: "tripartite", label: "Tripartite Agreement (Condo)", amount: 30_000 });
      subtotalLegal += 30_000;
    }
    if (inputs.addTransferApproval) {
      rows.push({ key: "transfer_approval", label: "Approving Transfer Deeds", amount: 10_000 });
      subtotalLegal += 10_000;
    }
    if (inputs.addRelease) {
      rows.push({ key: "release", label: "Release (Lost Bond)", amount: 15_000 });
      subtotalLegal += 15_000;
    }
    if (inputs.addPartRelease) {
      rows.push({ key: "part_release", label: "Part Release (per lot)", amount: 5_000 });
      subtotalLegal += 5_000;
    }
    if (inputs.addOtherDeeds) {
      rows.push({ key: "other_deeds", label: "All Other Deeds", amount: 7_500 });
      subtotalLegal += 7_500;
    }
    if (inputs.specialAgreementAmount && inputs.specialAgreementAmount >= 5_000 && inputs.specialAgreementAmount <= 50_000) {
      rows.push({ key: "special_agreement", label: "Special Agreement", amount: inputs.specialAgreementAmount });
      subtotalLegal += inputs.specialAgreementAmount;
    }
  }

  // --- Totals ---
  const grandTotalDueAtDisbursement = subtotalProcessing + subtotalLegal;
  const grandTotalCashOutflow = grandTotalDueAtDisbursement; // No valuation or other fees

  return {
    rows,
    subtotalProcessing,
    subtotalLegal,
    subtotalValuation: 0,
    applicationFeePaidUpfront: 0,
    grandTotalDueAtDisbursement,
    grandTotalCashOutflow,
  };
}
