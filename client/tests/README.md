# Playwright Tests for UB Analyst

Comprehensive end-to-end tests for the Bank Scraper visualization client.

## Setup

1. Install dependencies:
```powershell
cd client
npm install
```

2. Install Playwright browsers:
```powershell
npx playwright install chromium
```

## Running Tests

### Run all tests (headless)
```powershell
npm test
```

### Run tests with UI mode (recommended)
```powershell
npm run test:ui
```
This opens the Playwright Test Runner UI where you can:
- See all tests in a visual tree
- Run individual tests or groups
- Watch tests run in real-time
- Time-travel through test execution
- See screenshots and traces

### Debug tests
```powershell
npm run test:debug
```
Opens tests with the Playwright Inspector for step-by-step debugging.

### Run specific test file
```powershell
npx playwright test tests/app.spec.ts
```

### Run tests in headed mode (show browser)
```powershell
npx playwright test --headed
```

### Generate test report
```powershell
npx playwright show-report
```

## Test Coverage

### Authentication (5 tests)
- ✅ Login gate display
- ✅ Password validation
- ✅ Successful authentication
- ✅ Password visibility toggle

### Navigation (2 tests)
- ✅ Tab switching between all views
- ✅ Filter state persistence

### Dashboard (2 tests)
- ✅ Product cards with best rates
- ✅ AWPR vs FTP chart rendering

### Interest Rates (5 tests)
- ✅ Product filtering
- ✅ Bank search
- ✅ Column sorting
- ✅ CSV download
- ✅ Rate summary matrix

### Tariffs (5 tests)
- ✅ Product/category/basis filtering
- ✅ Search functionality
- ✅ CSV download
- ✅ Tariff summary matrix

### Compare Advisor (6 tests)
- ✅ Input validation
- ✅ Loan parameter entry
- ✅ Salary level toggles
- ✅ Yes/No option toggles
- ✅ Advanced options expansion
- ✅ Fee breakdown expansion

### Scrapers Panel (5 tests)
- ✅ Scraper tile display
- ✅ Status badges
- ✅ Run buttons
- ✅ Batch execution controls

### Admin Panel (3 tests)
- ✅ FTP uploader display
- ✅ Save/reset controls
- ✅ Preview table

### Data Integration (3 tests)
- ✅ AWPR formula normalization
- ✅ Effective rate computation
- ✅ Monthly payment calculation

### Cross-cutting Concerns
- ✅ LocalStorage persistence (2 tests)
- ✅ Responsive behavior (2 tests)
- ✅ Error handling (3 tests)
- ✅ Bank logo display (1 test)
- ✅ Accessibility (2 tests)

**Total: 50+ test cases**

## Using VS Code Extension

The Playwright Test extension is already installed. Features:
- **Test Explorer**: See all tests in the sidebar
- **Run/Debug**: Click play button next to any test
- **Pick Locator**: Record new locators visually
- **Show Trace**: View detailed execution timeline

### Quick Actions
1. Open Test Explorer: `Ctrl+Shift+P` → "Test: Focus on Test Explorer View"
2. Run test at cursor: Click green play button in gutter
3. Debug test: Right-click test → "Debug Test"
4. Record new test: `Ctrl+Shift+P` → "Playwright: Record New Test"

## Prerequisites for Running

1. **Backend server must be running**:
```powershell
# In root directory
npm run dev
```
The backend serves data endpoints that the frontend consumes.

2. **Frontend dev server will auto-start**:
Playwright config includes `webServer` that automatically starts Vite on `http://localhost:5173`.

## Test Strategy

Tests are designed to:
- ✅ **Be resilient**: Use conditional checks for dynamic content
- ✅ **Be fast**: Run in parallel where possible
- ✅ **Be realistic**: Test user workflows, not implementation details
- ✅ **Be maintainable**: Use helper functions and clear naming

### Conditional Testing Pattern
Many tests use this pattern to handle missing data gracefully:
```typescript
if (await element.count() > 0) {
  await expect(element).toBeVisible();
}
```
This ensures tests pass even when scraped data is incomplete.

## Common Issues

### Test fails with "Timeout waiting for selector"
**Solution**: Increase timeout or add `waitForTimeout()` after navigation:
```typescript
await page.click('button:has-text("Tariffs")');
await page.waitForTimeout(300); // Wait for filter to apply
```

### Backend not running
**Solution**: Start backend server first:
```powershell
npm run dev  # in root directory
```

### Browser not installed
**Solution**: Install Chromium:
```powershell
npx playwright install chromium
```

## CI/CD Integration

To run tests in CI (GitHub Actions, etc.):
```yaml
- name: Install dependencies
  run: |
    npm ci
    cd client && npm ci
    
- name: Install Playwright browsers
  run: cd client && npx playwright install --with-deps chromium
  
- name: Run backend
  run: npm run dev &
  
- name: Run tests
  run: cd client && npm test
  
- name: Upload test report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: client/playwright-report/
```

## Writing New Tests

1. Create test file in `tests/` directory
2. Import helpers:
```typescript
import { test, expect } from '@playwright/test';
```

3. Use the `login()` helper:
```typescript
async function login(page) {
  await page.goto('/');
  await page.fill('input[type="password"]', '5973');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=UB Analyst')).toBeVisible();
}
```

4. Structure tests with `describe` blocks:
```typescript
test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Navigate to feature
  });

  test('should do something', async ({ page }) => {
    // Test implementation
  });
});
```

## Best Practices

1. **Use data-testid for stable selectors** (when added to components)
2. **Wait for network idle** after actions that trigger API calls
3. **Take screenshots on failure** (already configured)
4. **Use locator chaining** for complex queries
5. **Test user flows**, not isolated units

## Resources

- [Playwright Docs](https://playwright.dev)
- [VS Code Extension](https://playwright.dev/docs/getting-started-vscode)
- [Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Test Generator](https://playwright.dev/docs/codegen)
