# Copilot Instructions for Bank Scraper Project

A dual-workspace TypeScript project that scrapes Sri Lankan bank interest rates and fees using Playwright/PDF parsing, with a React client for visualization. **Not** a monorepo—two independent package.json roots with different module systems.

## Architecture & Critical Workflows

### Backend (`src/`, root package.json)
- **Module system**: CommonJS (`"type": "commonjs"`)
- **Entry point**: `src/server.ts` (Express API on port 3000)
- **Execution**: Use `ts-node -T` for all scripts (bypasses type checking)
- **Scrapers**: `src/scrapers/*.ts` — each bank has 2 files: `{bank}.ts` (rates) + `{bank}-tariff.ts` (fees)

```powershell
# Backend commands (root directory)
npm run dev                 # Start Express server
npm run playwright-install  # Install Chromium once
npm run test:tariff         # Run tariff normalization
```

### Frontend (`client/`, client/package.json)
- **Module system**: ES modules (`"type": "module"`)
- **Stack**: React 19 + Vite + TailwindCSS 4 + Framer Motion
- **Proxy**: Vite proxies `/scrape/*` and `/api/*` to `http://localhost:3000`
- **Main file**: `client/src/App.tsx` (~6000 lines) — bank comparisons, charts, tariff data

```powershell
# Frontend commands (client directory)
cd client
npm run dev                 # Vite dev server on :5173
npm test                    # Unit tests (Vitest)
npm run test:watch          # TDD mode
npm run test:e2e            # E2E tests (Playwright)
```

## Project-Specific Patterns

### Scraper Development
1. **Playwright scrapers**: Export `async function scrape{Bank}(opts?: { show?: boolean; slow?: number })` 
   - Use `acceptAnyCookie(page)` from `src/utils/dom.ts` to dismiss popups
   - Query params: `?show=true` (visible browser), `?slow=200` (delay), `?save=true` (write to output/)

2. **PDF/OCR scrapers** (Sampath, Peoples): 
   - Extract via pdfjs → group by Y-coordinate → dump to `output/{bank}-tariff-ocr-lines.txt` for debugging
   - Parse line arrays with regex patterns

3. **Text normalization** (`src/utils/text.ts`):
   - `normalizeAwpr(cell)` → standardize "AWPR + X%" format
   - `expandTenureYears(label)` → parse "4-5 Years" → `[4, 5]`

### Type System
- **Backend** (`src/types.ts`): `RateRow` with flexible product strings
- **Frontend** (`client/src/types.ts`): Stricter `ProductKey = "HL" | "PL" | "LAP" | "EL"`, `TariffRow`
- **Rate data**: Use legacy HNB field names (`rateWithSalary`, `rateWithoutSalary`) across all banks
- **Tenure handling**: Always provide both `tenureLabel` (original) AND `tenureYears` (normalized)

### Tariff Calculator System
Multi-bank fee computation with router pattern:
- Main router: `client/src/tariff-calculator.ts` (Union Bank + router, 600+ lines)
- Bank-specific: `client/src/tariff-{bank}.ts` files
- **Workflow**: Modify constants → update tests → run `npm run test:watch` → check `App.tsx` integration

## API Routes & Integration

**Server routes** (`src/server.ts`):
- Individual: `/scrape/{bank}` and `/scrape/{bank}-tariff`
- Aggregators: `/scrape/all` (parallel), `/scrape/tariffs-all` (sequential, merges by `(bank, product, feeType)`)
- News: `/api/news` (RSS feeds with 10min cache)

**Client fetches**: Use relative paths (`/scrape/hnb`) — Vite proxy handles routing

## Common Pitfalls
1. **Module mismatch**: Root=CommonJS, client=ES modules. Never mix.
2. **TypeScript execution**: Use `ts-node -T` (not `tsc`) for backend scripts
3. **Playwright timeouts**: Use `timeout: 45000` for initial navigation, `waitForTimeout(400)` after DOM changes
4. **Tenure parsing**: `"Above 10 Years"` = 11-25 (exclusive), `"10 years and above"` = 10-25 (inclusive)
5. **Error handling**: Always wrap scrapers in try-catch, return empty array on failure
6. **Tariff tests**: Run `npm test` in `client/` before committing changes

## Key Files
- `src/server.ts` — API routes, news aggregation, tariff merging
- `client/src/App.tsx` — Main UI (6K lines), bank comparisons, charts
- `client/src/tariff-calculator.ts` — Multi-bank fee router
- `src/utils/text.ts` — Text normalization utilities
- `client/src/TARIFF_README.md` — Detailed tariff documentation
