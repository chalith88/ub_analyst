# Union Bank Tariff Calculator

Deterministic, unit-tested calculations for upfront costs and fees for Retail Loans & Advances using the Union Bank tariff (22-Sep-2025).

## Overview

This module computes processing fees, legal fees, valuation fees, and other charges for:
- **Personal Loans** (standard & green channel)
- **Housing Loans** (standard, employed abroad, green channel)
- **Loan Against Property (LAP)** (standard, employed abroad, green channel)

## Usage

```typescript
import { calculateTariff } from './tariff-calculator';

const result = calculateTariff({
  loanAmount: 10_000_000,
  product: "HousingLoan",
  propertyValue: 12_000_000,
  usePanelLawyer: false,
  tripartite: "Standard",
  includeTitleClearance: true,
  deductApplicationFeeAtDisbursement: true,
});

console.log(result.grandTotalCashOutflow); // Total customer pays
console.log(result.rows); // Itemized breakdown
```

## API

### `calculateTariff(inputs: UserInputs): TariffResult`

**Inputs:**
```typescript
interface UserInputs {
  loanAmount: number;           // LKR (integer)
  product: Product;             // Loan product type
  propertyValue?: number;       // For legal/valuation (Housing/LAP only)
  usePanelLawyer?: boolean;     // Use panel lawyer fee table
  tripartite?: "None" | "Standard" | "HomeLoanPlus";
  includeTitleClearance?: boolean; // Add 10k title clearance
  deductApplicationFeeAtDisbursement?: boolean; // Default: true
}
```

**Output:**
```typescript
interface TariffResult {
  rows: FeeRow[];                       // Itemized fees
  subtotalProcessing: number;           // Processing fee (net)
  subtotalLegal: number;                // Legal + title + tripartite
  subtotalValuation: number;            // Property valuation
  applicationFeePaidUpfront: number;    // 10k upfront (Housing/LAP)
  grandTotalDueAtDisbursement: number;  // Due when loan disburses
  grandTotalCashOutflow: number;        // Total customer pays
}
```

## Fee Rules

### Processing Fees

**Personal Loan (12.01):**
- < 1M → LKR 8,500
- 1–4.99M → LKR 11,000
- ≥ 5M → LKR 12,500

**Personal Loan Green (12.02):**
- < 1M → LKR 11,000
- 1–4.99M → LKR 13,500
- ≥ 5M → LKR 15,000

**Housing Loan (12.04/12.05/12.06):**
- Standard: 0.40% (min 25k, max 100k)
- Employed Abroad: 0.75% (min 35k, max 150k)
- Green Channel: 0.50% (min 25k, max 100k)

**LAP (12.07/12.08/12.09):**
- Standard: 0.50% (min 25k, max 100k)
- Employed Abroad: 0.75% (min 35k, max 150k)
- Green Channel: 0.60% (min 25k, max 100k)

### Application Fee (12.03)
- LKR 10,000 upfront for Housing/LAP only
- Non-refundable, but deducted from processing fee at disbursement
- Net processing = max(0, gross processing - 10,000)

### Legal Fees (12.11)

**Standard Legal:**
- < 5M → 0.75% (min 15k)
- 5–10M → 0.70% (min 37.5k)
- ≥ 10M → 0.35% (min 70k, max 175k)

**Panel Lawyer:**
- 0.5–1M → 1.00% (min 7.5k)
- 1–5M → 0.75% (min 10k)
- > 5M → 0.60% (min 30k, max 50k)

**Additional:**
- Title Clearance (12.12): LKR 10,000 (optional)
- Tripartite Standard (12.13a): LKR 25,000
- Tripartite Home Loan+ (12.13b): LKR 50,000

### Valuation Fees (13.00)
- < 500k → LKR 1,250 fixed
- 500k–1M → 0.25%
- 1–10M → 0.10%
- 10–20M → 0.06%
- 20–50M → 0.05%
- 50–100M → 0.025%
- 100–500M → 0.01%
- > 500M → Negotiable

## Testing

Run the full test suite (61 tests):

```bash
npm test
```

Watch mode during development:

```bash
npm run test:watch
```

UI mode (visual test runner):

```bash
npm run test:ui
```

Coverage report:

```bash
npm run test:coverage
```

## Test Coverage

- ✅ All fee tier boundaries
- ✅ Min/max clamping logic
- ✅ Application fee netting
- ✅ Panel lawyer vs standard legal
- ✅ Tripartite options
- ✅ Title clearance toggle
- ✅ Product type routing
- ✅ Edge cases (zero, negative, large amounts)
- ✅ Integration scenarios (full fee breakdown)

## Implementation Notes

1. **Pure functions** - No side effects, deterministic outputs
2. **Rounding** - All amounts rounded to nearest LKR integer
3. **Validation** - Negative/zero inputs return empty results
4. **Immutability** - Input objects never mutated
5. **Type safety** - Full TypeScript coverage

## Integration with UI

The calculator is designed to be called from the "Compare Advisor" Generate button:

```typescript
// In App.tsx or CompareAdvisor component
const handleGenerate = () => {
  const tariffResult = calculateTariff({
    loanAmount: userLoanAmount,
    product: selectedProduct,
    propertyValue: userPropertyValue,
    usePanelLawyer: usePanelLawyerToggle,
    tripartite: tripartiteSelection,
    includeTitleClearance: titleClearanceToggle,
  });

  // Display tariffResult.rows in expandable breakdown
  // Show totals in comparison table
};
```

## Future Enhancements

- [ ] Add stamp duty calculation (4% of loan amount)
- [ ] Support multiple property valuations (for LAP)
- [ ] Export to PDF/Excel
- [ ] Historical tariff versions (date-based)
- [ ] Currency conversion for remittances
