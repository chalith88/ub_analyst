// NDB Bank Rate Selector
// Local types (mirroring prompt)
export interface UserInputs {
  bank: string;
  product: "HomeLoan" | "PersonalLoan" | "EducationLoan";
  loanAmount: number;
  tenureYears: number;
  isProfessional?: boolean;
  // Use same shape as global RateSelectionInputs where relevant
  salaryRelationship?: "Assignment" | "Remittance" | "None";
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

export interface RateRow {
  key: string;
  label: string;
  ratePct: number;
  basis?: string;
}

export interface RateResult {
  rows: RateRow[];
  bestRatePct: number;
  source: string;
}

// Simulated static data (replace with import from data/ndb.json in real build)
// Use min/max per product to support salary-based selection
const NDB_RATES = {
  homeLoan: { min: 9.90, max: 12.25 },
  personalLoan: {
    general: { min: 12.95, max: 12.95 },
    doctors: { min: 11.95, max: 11.95 },
  },
  educationLoan: { min: 12.50, max: 12.50 },
};

export function selectBestRate(inputs: UserInputs): RateResult {
  if (inputs.product === "HomeLoan") {
    // HL: min/max floating
    const min = NDB_RATES.homeLoan.min;
    const max = NDB_RATES.homeLoan.max;
    // If no salary relationship, use max rates per requirement
    const preferMin = inputs.salaryRelationship === "None"
      ? false
      : (inputs.preferMinFloating !== false);
    return {
      rows: [
        { key: "min", label: "NDB • Home Loan • min", ratePct: min },
        { key: "max", label: "NDB • Home Loan • max", ratePct: max },
      ],
      bestRatePct: preferMin ? min : max,
      source: "ndb.json",
    };
  }
  if (inputs.product === "PersonalLoan") {
    // PL: general vs doctors with salary-based min/max
    const isDoc = !!inputs.isProfessional;
    const useMax = inputs.salaryRelationship === "None";
    const general = useMax ? NDB_RATES.personalLoan.general.max : NDB_RATES.personalLoan.general.min;
    const doctors = useMax ? NDB_RATES.personalLoan.doctors.max : NDB_RATES.personalLoan.doctors.min;
    const suffix = useMax ? "Max rate" : "Min rate";
    const rows: RateRow[] = [
      { key: "candidate", label: `NDB • Personal Loan • general • ${suffix}` , ratePct: general },
    ];
    // Only show doctors special rate when user is a professional
    if (isDoc) {
  rows.push({ key: "candidate", label: `NDB • Personal Loan • doctors • ${suffix}` , ratePct: doctors });
    }
    return {
      rows,
      bestRatePct: isDoc ? doctors : general,
      source: "ndb.json",
    };
  }
  if (inputs.product === "EducationLoan") {
    // Education: min/max equal, but respect salary-based selection for consistency
    const useMax = inputs.salaryRelationship === "None";
    const rate = useMax ? NDB_RATES.educationLoan.max : NDB_RATES.educationLoan.min;
    const suffix = useMax ? "Max rate" : "Min rate";
    return {
      rows: [
        { key: "candidate", label: `NDB • Education Loan • ${suffix}` , ratePct: rate },
      ],
      bestRatePct: rate,
      source: "ndb.json",
    };
  }
  throw new Error("NDB: Unknown product");
}
