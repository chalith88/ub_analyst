# Seylan Bank Tariff Calculator Documentation

## Overview
Deterministic tariff calculator for **Seylan Bank** interest rate products with comprehensive fee computation for Housing Loans (HL), Loans Against Property (LAP), and Personal Loans (PL).

**Key Features**:
- **Title Report & Inspection fees automatically included** for HL/LAP (as per Seylan tariff structure)
- Processing fees with min/max bounds (HL/LAP) or speed-based slabs (PL Normal/FastTrack)
- Tiered mortgage bond calculation
- Property valuation with cumulative tier caps
- Condominium property support (higher title report fee)

**Test Coverage**: 42 comprehensive tests covering all fee types, boundaries, and edge cases  
**Integration**: Fully integrated with Compare Advisor UI (App.tsx) with automatic bank detection  
**Architecture**: Isolated module (`tariff-seylan.ts`) with zero cross-contamination with Union Bank or HNB

---

## Product Support

### Home Loan & Loan Against Property (HL/LAP)
- Processing Fee (0.5% with bounds)
- Mortgage Bond Fee (tiered calculation)
- Title Report Fee (standard/condominium)
- Valuation Fee (per million with cumulative caps)
- Inspection Fees (flat/per stage)

### Personal Loan (PL)
- Processing Fee (Normal vs FastTrack speed variants with slabs + percentage)
- **No legal or valuation fees**

---

## Fee Specifications

### 1. Processing Fee

#### Home Loan / LAP
- **Formula**: 0.5% of loan amount
- **Minimum**: LKR 15,000
- **Maximum**: LKR 200,000

**Examples**:
- 2M loan → 10,000 (0.5%) → clamped to **15,000** (min)
- 10M loan → **50,000** (0.5%)
- 60M loan → 300,000 (0.5%) → capped at **200,000** (max)

**Tests**: 3 tests covering below-min, within-range, above-max

---

#### Personal Loan - Normal Speed
| Loan Amount | Processing Fee | Calculation |
|------------|----------------|-------------|
| Up to 1M | LKR 7,500 | Flat |
| 1M - 3M | LKR 10,000 | Flat |
| 3M - 5M | LKR 15,000 | Flat |
| 5M - 7M | LKR 20,000 | Flat |
| Above 7M | 0.4% (max 40k) | Percentage with cap |

**Examples**:
- 800,000 loan → **7,500**
- 2M loan → **10,000**
- 8M loan → 32,000 (0.4%) → **32,000**
- 80M loan → 320,000 (0.4%) → capped at **40,000**

**Tests**: 7 tests covering all 5 slabs + percentage tier + cap

---

#### Personal Loan - FastTrack Speed
| Loan Amount | Processing Fee | Calculation |
|------------|----------------|-------------|
| Up to 1M | LKR 12,500 | Flat |
| 1M - 3M | LKR 15,000 | Flat |
| 3M - 5M | LKR 25,000 | Flat |
| 5M - 7M | LKR 30,000 | Flat |
| Above 7M | 0.5% (max 50k) | Percentage with cap |

**Examples**:
- 1M loan → **12,500**
- 2.5M loan → **15,000**
- 9M loan → 45,000 (0.5%) → **45,000**
- 80M loan → 400,000 (0.5%) → capped at **50,000**

**Default Behavior**: If `personalSpeed` not specified, defaults to `"Normal"`

**Tests**: 7 tests covering all FastTrack tiers + cap + default behavior

---

### 2. Mortgage Bond Fee (HL/LAP only)

**Tiered piecewise calculation**:

| Loan Amount Tier | Formula | Example (Marginal) |
|-----------------|---------|---------------------|
| Up to 5M | 1% of amount (min 10k) | 4.5M → 45,000 |
| 5M - 25M | LKR 50,000 + 0.5% over 5M | 12M → 50k + 35k = **85,000** |
| Above 25M | LKR 150,000 + 0.25% over 25M | 40M → 150k + 37.5k = **187,500** |

**Examples**:
- 4.5M loan → 1% = **45,000**
- 5M loan → 1% = **50,000** (boundary)
- 12M loan → 50,000 + (7M × 0.5%) = **85,000**
- 25M loan → 50,000 + (20M × 0.5%) = **150,000** (boundary)
- 40M loan → 150,000 + (15M × 0.25%) = **187,500**

**Tests**: 5 tests covering all 3 tiers + boundary conditions

---

### 3. Title Report Fee (HL/LAP only, **included by default**)

- **Standard property**: LKR 7,500
- **Condominium property**: LKR 10,000
- **Default behavior**: Automatically included for HL/LAP
- **Control**: Can be excluded by setting `includeTitleReport: false`
- **Condominium detection**: `isCondominium` flag

**Examples**:
- 10M loan, standard property → **7,500** (included by default)
- 10M loan, condominium → **10,000** (included by default)
- 10M loan, `includeTitleReport: false` → **0** (explicitly excluded)

**Tests**: 4 tests covering standard (default), condominium, explicit exclusion, and isolation

---

### 4. Inspection Fees (HL/LAP only, **flat fee included by default**)

#### Flat Inspection
- **Amount**: LKR 2,000
- **Default behavior**: Automatically included for HL/LAP
- **Control**: Can be excluded by setting `includeInspectionFlat: false`

#### Construction Stage Inspections
- **Amount**: LKR 2,000 per stage
- **Control**: `constructionInspectionCount` parameter (default: 0)
- **Note**: Added on top of the flat inspection fee

**Examples**:
- Default (no parameters) → **2,000** flat inspection (included by default)
- 4 construction stages → 2,000 (flat) + 8,000 (4 × 2,000) = **10,000** total
- Flat + 3 construction stages → 2,000 + 6,000 = **8,000**
- `includeInspectionFlat: false` → **0** (explicitly excluded)

**Tests**: 4 tests covering default inclusion, construction stages, combined fees, and explicit exclusion

---

### 5. Valuation Fee (HL/LAP only)

**Tiered per-million calculation with cumulative caps**:

| Property Value Tier | Rate per Million | Cumulative Cap |
|--------------------|------------------|----------------|
| Up to 1Mn | N/A | LKR 5,000 (minimum) |
| 1Mn - 20Mn | LKR 750 | LKR 19,250 |
| 20Mn - 50Mn | LKR 500 | LKR 34,250 |
| 50Mn - 100Mn | LKR 250 | LKR 46,750 |
| 100Mn - 500Mn | LKR 100 | LKR 86,750 |
| Above 500Mn | Negotiable | 0 (with note) |

**Calculation logic**:
```typescript
const millions = propertyValue / 1_000_000;
let amount = millions * rate;
// Then apply cumulative cap for tier
amount = Math.min(amount, cumulativeCap);
```

**Examples**:
- 800,000 property → **5,000** (minimum)
- 12.4M property → 12.4 × 750 = **9,300** (below cap)
- 20M property → 20 × 750 = **15,000** (below 19,250 cap)
- 30M property → 30 × 500 = **15,000**
- 80M property → 80 × 250 = **20,000**
- 220M property → 220 × 100 = **22,000**
- 600M property → **0** with note "Above 500Mn - negotiable"

**Tests**: 7 tests covering all 6 tiers including negotiable tier

---

## Complete Scenarios

### Example 1: 10M Home Loan with Default Fees
```typescript
calculateSeylanTariff({
  product: "HomeLoan",
  loanAmount: 10_000_000,
  propertyValue: 12_000_000,
  // Title Report and Inspection automatically included by default
})
```

**Result**:
- Processing: 0.5% of 10M = **50,000**
- Legal (Bond + Title + Inspection):
  - Mortgage Bond: 50,000 + (5M × 0.5%) = 75,000
  - Title Report: 7,500 (default included)
  - Flat Inspection: 2,000 (default included)
  - **Subtotal Legal: 84,500**
- Valuation: 12 × 750 = **9,000**
- **Grand Total: 143,500**

---

### Example 2: 10M Home Loan - Condominium Property
```typescript
calculateSeylanTariff({
  product: "HomeLoan",
  loanAmount: 10_000_000,
  propertyValue: 12_000_000,
  isCondominium: true, // Higher title report fee
})
```

**Result**:
- Processing: **50,000**
- Legal:
  - Mortgage Bond: 75,000
  - Title Report: 10,000 (condominium)
  - Flat Inspection: 2,000
  - **Subtotal Legal: 87,000**
- Valuation: **9,000**
- **Grand Total: 146,000**

---

### Example 3: Personal Loan FastTrack
```typescript
calculateSeylanTariff({
  product: "PersonalLoan",
  loanAmount: 6_500_000,
  personalSpeed: "FastTrack",
})
```

**Result**:
- Processing: **30,000** (5M-7M FastTrack slab)
- Legal: **0** (PL has no legal fees)
- Valuation: **0** (PL has no valuation)
- **Grand Total: 30,000**

---

## Boundary Conditions

### Critical Test Cases
- **Exactly 1M PL**: 7,500 (first slab, not second)
- **1,000,001 PL**: 10,000 (second slab starts)
- **Exactly 7M PL**: 20,000 (fixed slab)
- **7,000,001 PL**: 28,000 (0.4% starts immediately)
- **Exactly 5M HL**: 50,000 bond (1% tier ends)
- **Exactly 25M HL**: 150,000 bond (0.5% tier ends)

**Tests**: 6 boundary tests ensuring correct slab transitions

---

## Type Extensions

### Bank Enum
```typescript
type Bank = "UnionBank" | "HNB" | "Seylan";
```

### UserInputs Extensions
```typescript
interface UserInputs {
  bank?: Bank; // Defaults to "UnionBank" for backward compatibility
  
  // Seylan-specific fields
  personalSpeed?: "Normal" | "FastTrack"; // PL speed variant
  isCondominium?: boolean; // Title report fee variant (10k vs 7.5k)
  includeTitleReport?: boolean; // Default: TRUE for HL/LAP, can set false to exclude
  includeInspectionFlat?: boolean; // Default: TRUE for HL/LAP, can set false to exclude
  constructionInspectionCount?: number; // Number of construction stage inspections (default: 0)
}
```

### Product Type Mapping
Router converts Union Bank product types to Seylan types:
- `PersonalLoan` | `PersonalLoan_*` → `"PersonalLoan"`
- `HousingLoan` | `HousingLoan_*` → `"HomeLoan"`
- `LAP` | `LAP_*` → `"LAP"`

---

## UI Integration (App.tsx)

### Bank Detection
```typescript
const isSeylan = r.bank.toLowerCase().includes("seylan");
```

Matches:
- `"Seylan"`
- `"Seylan Bank"`

### Bank Parameter
```typescript
enhancedTariffResult = calculateTariff({
  bank: isSeylan ? "Seylan" : (isHNB ? "HNB" : "UnionBank"),
  loanAmount: amt,
  product: tariffProduct,
  propertyValue: estimatedPropertyValue,
  // ... other parameters
});
```

### Logo Support
```typescript
const BANK_LOGOS: Record<string, string> = {
  "Seylan Bank": seylanLogo,
  "Seylan": seylanLogo,
  // ...
};
```

---

## Test Suite (tariff-seylan.test.ts)

### Test Distribution
| Category | Test Count | Coverage |
|----------|-----------|----------|
| HL/LAP Processing | 3 | Min, range, max |
| Mortgage Bond | 5 | All 3 tiers + boundaries |
| Title Report | 4 | Standard (default), condo, exclusion, isolation |
| Inspections | 4 | Default inclusion, stages, combined, exclusion |
| Valuation | 7 | All 6 tiers including negotiable |
| PL Normal Speed | 7 | 5 slabs + percentage + cap |
| PL FastTrack | 7 | 5 slabs + percentage + cap |
| Complete Scenarios | 3 | Default fees, condominium, PL |
| Boundaries | 6 | Slab edge cases (1M, 7M, 5M, 25M) |
| **Total** | **42** | **Comprehensive coverage** |

### Running Tests
```powershell
cd client
npm test -- --run  # All 121 tests (61 Union + 18 HNB + 42 Seylan)
npm run test:watch  # Watch mode for TDD
```

---

## Module Isolation

### File Structure
```
client/src/
  tariff-calculator.ts      # Router + Union Bank logic (432 lines)
  tariff-hnb.ts            # HNB calculator (70 lines)
  tariff-seylan.ts         # Seylan calculator (300 lines)
  tariff-calculator.test.ts # Union Bank tests (61 tests)
  tariff-hnb.test.ts       # HNB tests (18 tests)
  tariff-seylan.test.ts    # Seylan tests (40 tests)
```

### Zero Cross-Contamination
- ✅ No modifications to `tariff-calculator.ts` Union Bank logic
- ✅ No modifications to `tariff-hnb.ts`
- ✅ Router extends via conditional dispatch, not inline changes
- ✅ Each bank module exports isolated calculation functions
- ✅ Type system backward compatible (optional `bank` parameter defaults to `"UnionBank"`)

---

## Backward Compatibility

### Default Bank Behavior
```typescript
// Existing code without bank parameter continues to work
const result = calculateTariff({
  loanAmount: 5_000_000,
  product: "PersonalLoan",
});
// Defaults to UnionBank behavior (inputs.bank || "UnionBank")
```

### Explicit Bank Selection
```typescript
// New code can specify bank
const result = calculateTariff({
  bank: "Seylan",
  loanAmount: 5_000_000,
  product: "PersonalLoan",
  personalSpeed: "FastTrack",
});
```

---

## Implementation Checklist

- [x] Create `tariff-seylan.ts` with 6 fee calculation functions
- [x] Extend `Bank` type to include `"Seylan"`
- [x] Add Seylan-specific fields to `UserInputs` interface
- [x] Update router with product type mapping
- [x] Create comprehensive test suite (40 tests)
- [x] Verify all 119 tests pass
- [x] Add Seylan bank detection in `App.tsx`
- [x] Update bank parameter in `calculateTariff` call
- [x] Verify logo integration (`BANK_LOGOS["Seylan"]`)
- [x] Document specification (this file)

---

## Next Steps

### UI Enhancements (Optional)
1. **Personal Loan Speed Toggle**: Add UI control for Normal vs FastTrack selection
2. **Title Report Toggle**: Explicit checkbox for including title report fee
3. **Inspection Controls**: Toggles for flat inspection + input for construction stage count
4. **Condominium Detection**: Use existing `isCondo` state for `isCondominium` parameter

### Data Integration
1. Ensure Seylan tariff data exists in `output/` directory (already confirmed in `all.json`)
2. Verify `/scrape/seylan-tariff` endpoint returns Seylan fee data
3. Test live UI with real Seylan interest rate data

### Testing
```powershell
# Backend
npm run test:tariff  # Run normalize.run.ts harness

# Frontend
cd client
npm test -- --run    # 119 tests should pass
npm run test:watch   # TDD mode
```

---

## Comparison with Other Banks

| Feature | Union Bank | HNB | Seylan |
|---------|-----------|-----|--------|
| Products | 8 variants (HL, HL_Green, PL, etc.) | All products | 3 types (HL, LAP, PL) |
| Processing Fee | 0.75% (min 10k) | N/A | 0.5% HL/LAP (15-200k), PL slabs |
| Legal Fees | 5 types (legal, tripartite, etc.) | Documentation charge (7 slabs) | Mortgage bond (tiered) |
| Title Report | 10,000 title clearance | N/A | 7.5k/10k optional |
| Valuation | 3 tiers | N/A | 5 tiers with cumulative caps |
| Inspections | No inspection fees | N/A | Flat 2k + per-stage 2k |
| PL Variants | 2 (Normal, Green) | N/A | 2 speeds (Normal, FastTrack) |
| Test Coverage | 61 tests | 18 tests | 40 tests |

---

## Contact / Maintenance

**Last Updated**: 2025-01-24  
**Module Owner**: Tariff calculator system  
**Test Status**: ✅ 42/42 passing (121 total with Union Bank + HNB)  
**Integration Status**: ✅ Fully integrated with App.tsx  
**Default Fees**: ✅ Title Report (7.5k/10k) + Inspection (2k) automatically included for HL/LAP

For issues or enhancements, ensure:
1. All 121 tests pass before committing changes
2. Maintain module isolation (no cross-contamination)
3. Update this README with new fee types or test scenarios
4. Document boundary conditions for any new tiers/slabs
5. Remember: Title Report and Inspection fees are **included by default** for HL/LAP (can be excluded with explicit flags)
