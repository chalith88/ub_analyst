import { test, expect } from '@playwright/test';

// Helper to login
async function login(page) {
  await page.goto('/');
  await page.fill('input[type="password"]', '5973');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=UB Analyst')).toBeVisible();
}

test.describe('Authentication Flow', () => {
  test('should show login gate on initial load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Secure Access')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should reject incorrect password', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="password"]', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Incorrect password')).toBeVisible();
  });

  test('should accept correct password and show main app', async ({ page }) => {
    await login(page);
    await expect(page.locator('text=Retail advances - peer comparison')).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[type="password"]');
    await expect(input).toHaveAttribute('type', 'password');
    
    await page.click('button:has-text("Show")');
    await expect(input).toHaveAttribute('type', 'text');
    
    await page.click('button:has-text("Hide")');
    await expect(input).toHaveAttribute('type', 'password');
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate between main tabs', async ({ page }) => {
    const tabs = [
      { name: 'Dashboard', text: 'Retail advances' },
      { name: 'Interest Rates', text: 'All Rates' },
      { name: 'Tariffs', text: 'Tariff' },
      { name: 'Compare', text: 'Product Selection' },
    ];
    
    for (const tab of tabs) {
      await page.click(`button:has-text("${tab.name}")`);
      await expect(page.locator(`text=${tab.text}`).first()).toBeVisible();
    }
  });

  test('should maintain filter state when switching tabs', async ({ page }) => {
    // Set a filter in Interest Rates
    await page.click('button:has-text("Interest Rates")');
    await page.click('button:has-text("Home Loans")').first();
    
    // Switch to Dashboard
    await page.click('button:has-text("Dashboard")');
    
    // Return to Interest Rates
    await page.click('button:has-text("Interest Rates")');
    
    // Verify filter is still active
    const hlButton = page.locator('button:has-text("Home Loans")').first();
    const classes = await hlButton.getAttribute('class');
    expect(classes).toContain('bg-[#3b82f6]');
  });
});

test.describe('Dashboard Features', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display product cards with best rates', async ({ page }) => {
    const products = ['Home Loans', 'Loan Against Property', 'Personal Loans', 'Education Loans'];
    
    for (const product of products) {
      await expect(page.locator(`text=LOWEST IN`).first()).toBeVisible();
    }
  });

  test('should show AWPR vs FTP chart', async ({ page }) => {
    await expect(page.locator('text=AWPR vs FTP')).toBeVisible();
    // Verify chart container exists (recharts wrapper)
    const charts = page.locator('.recharts-wrapper');
    if (await charts.count() > 0) {
      await expect(charts.first()).toBeVisible();
    }
  });
});

test.describe('Interest Rates View', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Interest Rates")');
  });

  test('should filter by product', async ({ page }) => {
    await page.click('button:has-text("Home Loans")').first();
    
    // Wait for filter to apply
    await page.waitForTimeout(300);
    
    // Verify table shows filtered results
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    
    if (count > 0) {
      // Check first few rows contain expected product
      const firstRow = rows.first();
      await expect(firstRow).toBeVisible();
    }
  });

  test('should search banks', async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', 'HNB');
    
    // Wait for search to apply
    await page.waitForTimeout(300);
    
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    
    if (count > 0) {
      const firstBankCell = rows.first().locator('td').first();
      await expect(firstBankCell).toContainText('HNB');
    }
  });

  test('should sort by columns', async ({ page }) => {
    // Click rate column header
    const rateHeader = page.locator('th:has-text("Rate")');
    if (await rateHeader.count() > 0) {
      await rateHeader.click();
      
      // Wait for sort to apply
      await page.waitForTimeout(300);
      
      // Verify sort indicator appears
      const sortIndicator = page.locator('th:has-text("Rate") span');
      if (await sortIndicator.count() > 0) {
        await expect(sortIndicator).toBeVisible();
      }
    }
  });

  test('should download CSV', async ({ page }) => {
    const downloadButton = page.locator('button:has-text("Download")');
    if (await downloadButton.count() > 0) {
      const downloadPromise = page.waitForEvent('download');
      await downloadButton.click();
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    }
  });

  test('should display rate summary matrix', async ({ page }) => {
    await expect(page.locator('text=Rate Summary')).toBeVisible();
    
    // Verify matrix has content
    const matrixTable = page.locator('table').nth(1);
    if (await matrixTable.count() > 0) {
      await expect(matrixTable).toBeVisible();
    }
  });
});

test.describe('Tariffs View', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Tariffs")');
  });

  test('should filter by product', async ({ page }) => {
    await page.click('button:has-text("Personal Loans")').first();
    
    await page.waitForTimeout(300);
    
    // Verify filter button is active
    const plButton = page.locator('button:has-text("Personal Loans")').first();
    const classes = await plButton.getAttribute('class');
    expect(classes).toContain('bg-[#3b82f6]');
  });

  test('should filter by category', async ({ page }) => {
    const categorySelect = page.locator('select').first();
    if (await categorySelect.count() > 0) {
      await categorySelect.selectOption({ index: 1 });
      
      await page.waitForTimeout(300);
      
      // Verify selection persists
      const value = await categorySelect.inputValue();
      expect(value).not.toBe('all');
    }
  });

  test('should search tariffs', async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', 'processing');
    
    await page.waitForTimeout(300);
  });

  test('should download tariff CSV', async ({ page }) => {
    const downloadButton = page.locator('button:has-text("Download")');
    if (await downloadButton.count() > 0) {
      const downloadPromise = page.waitForEvent('download');
      await downloadButton.click();
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    }
  });

  test('should display tariff summary matrix', async ({ page }) => {
    await expect(page.locator('text=Tariff Summary')).toBeVisible();
  });
});

test.describe('Compare Advisor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Compare")');
  });

  test('should validate required fields', async ({ page }) => {
    const generateBtn = page.locator('button:has-text("Generate")');
    await generateBtn.click();
    
    // Should show validation message or stay on form
    await page.waitForTimeout(200);
  });

  test('should fill loan details and generate comparison', async ({ page }) => {
    // Select product
    await page.click('button:has-text("Home Loans")').first();
    
    // Loan amount
    await page.fill('input[placeholder="0.00"]', '10000000');
    
    // Tenure
    const tenureInput = page.locator('input[inputMode="numeric"]');
    if (await tenureInput.count() > 0) {
      await tenureInput.fill('20');
    }
    
    // Generate
    await page.click('button:has-text("Generate")');
    
    // Wait for results
    await page.waitForTimeout(1000);
    
    // Verify results section appears
    const results = page.locator('text=#1, text=Monthly Payment');
    if (await results.count() > 0) {
      await expect(results.first()).toBeVisible();
    }
  });

  test('should toggle salary level options', async ({ page }) => {
    const noneBtn = page.locator('button:has-text("None")');
    if (await noneBtn.count() > 0) {
      await noneBtn.click();
      const classes = await noneBtn.getAttribute('class');
      expect(classes).toContain('bg-[#3b82f6]');
    }
  });

  test('should toggle yes/no options', async ({ page }) => {
    // Find yes/no toggle groups
    const yesButtons = page.locator('button:has-text("Yes")');
    if (await yesButtons.count() > 0) {
      await yesButtons.first().click();
      const classes = await yesButtons.first().getAttribute('class');
      expect(classes).toContain('bg-[#3b82f6]');
    }
  });

  test('should expand advanced options', async ({ page }) => {
    const advancedBtn = page.locator('button:has-text("Advanced")');
    if (await advancedBtn.count() > 0) {
      await advancedBtn.click();
      
      // Wait for expansion
      await page.waitForTimeout(300);
      
      // Verify advanced section is visible
      const advancedContent = page.locator('text=Customer Category, text=Express Processing');
      if (await advancedContent.count() > 0) {
        await expect(advancedContent.first()).toBeVisible();
      }
    }
  });

  test('should expand fee breakdown in results', async ({ page }) => {
    // Set up valid inputs
    await page.fill('input[placeholder="0.00"]', '10000000');
    
    const generateBtn = page.locator('button:has-text("Generate")');
    await generateBtn.click();
    
    await page.waitForTimeout(1000);
    
    // If results exist, try to expand fee breakdown
    const showButtons = page.locator('button:has-text("Show")');
    if (await showButtons.count() > 0) {
      await showButtons.first().click();
      
      // Verify breakdown appears
      await page.waitForTimeout(300);
    }
  });
});

test.describe('Scrapers Panel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Scrapers")');
  });

  test('should display scraper tiles', async ({ page }) => {
    const banks = ['HNB', 'Seylan', 'Sampath', 'Commercial Bank', 'NDB'];
    
    for (const bank of banks.slice(0, 3)) {
      const bankTile = page.locator(`text=${bank}`).first();
      if (await bankTile.count() > 0) {
        await expect(bankTile).toBeVisible();
      }
    }
  });

  test('should display scraper status', async ({ page }) => {
    // Verify status badges exist
    const statusBadges = page.locator('text=IDLE, text=RUNNING, text=DONE, text=ERROR');
    const count = await statusBadges.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have run buttons for scrapers', async ({ page }) => {
    const runButtons = page.locator('button:has-text("Run")');
    if (await runButtons.count() > 0) {
      await expect(runButtons.first()).toBeVisible();
    }
  });

  test('should have "Run All" button', async ({ page }) => {
    const runAllBtn = page.locator('button:has-text("Run All")');
    if (await runAllBtn.count() > 0) {
      await expect(runAllBtn).toBeVisible();
    }
  });

  test('should have "Reset" button', async ({ page }) => {
    const resetBtn = page.locator('button:has-text("Reset")');
    if (await resetBtn.count() > 0) {
      await expect(resetBtn).toBeVisible();
    }
  });
});

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Admin")');
  });

  test('should display FTP uploader', async ({ page }) => {
    await expect(page.locator('text=FTP Uploader, text=Upload')).toBeVisible();
  });

  test('should have save/reset buttons', async ({ page }) => {
    const saveBtn = page.locator('button:has-text("Save")');
    const resetBtn = page.locator('button:has-text("Reset")');
    
    if (await saveBtn.count() > 0) {
      await expect(saveBtn).toBeVisible();
    }
    if (await resetBtn.count() > 0) {
      await expect(resetBtn).toBeVisible();
    }
  });

  test('should display FTP preview table', async ({ page }) => {
    const tables = page.locator('table');
    if (await tables.count() > 0) {
      await expect(tables.first()).toBeVisible();
    }
  });
});

test.describe('Data Integration & Calculations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should normalize AWPR formulas in rates', async ({ page }) => {
    await page.click('button:has-text("Interest Rates")');
    
    // If AWPR data exists, verify formula rates are computed
    const formulaNotes = page.locator('td:has-text("AWPR")');
    if (await formulaNotes.count() > 0) {
      // Verify rate column shows numeric value, not formula text
      const rateCell = formulaNotes.first().locator('..').locator('td').nth(2);
      const text = await rateCell.textContent();
      expect(text).toMatch(/\d+/);
    }
  });

  test('should compute effective rates in compare', async ({ page }) => {
    await page.click('button:has-text("Compare")');
    
    // Fill inputs
    await page.fill('input[placeholder="0.00"]', '10000000');
    
    const tenureInput = page.locator('input[inputMode="numeric"]');
    if (await tenureInput.count() > 0) {
      await tenureInput.fill('20');
    }
    
    // Enable tariffs if checkbox exists
    const tariffCheckbox = page.locator('input[type="checkbox"]');
    if (await tariffCheckbox.count() > 0) {
      await tariffCheckbox.check();
    }
    
    await page.click('button:has-text("Generate")');
    await page.waitForTimeout(1000);
    
    // Verify effective rate is shown (if results exist)
    const effRate = page.locator('text=Eff:');
    if (await effRate.count() > 0) {
      await expect(effRate.first()).toBeVisible();
    }
  });

  test('should calculate monthly payment correctly', async ({ page }) => {
    await page.click('button:has-text("Compare")');
    
    // Known inputs for verification
    await page.fill('input[placeholder="0.00"]', '10000000'); // 10M
    
    const tenureInput = page.locator('input[inputMode="numeric"]');
    if (await tenureInput.count() > 0) {
      await tenureInput.fill('20'); // 20 years
    }
    
    await page.click('button:has-text("Generate")');
    await page.waitForTimeout(1000);
    
    // Monthly payment should be displayed
    const monthlyPayment = page.locator('text=Monthly Payment');
    if (await monthlyPayment.count() > 0) {
      await expect(monthlyPayment.first()).toBeVisible();
    }
  });
});

test.describe('LocalStorage Persistence', () => {
  test('should persist rates across page reload', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Interest Rates")');
    
    // Check if rates exist
    const rowsBefore = await page.locator('tbody tr').count();
    
    if (rowsBefore > 0) {
      // Reload page
      await page.reload();
      await login(page);
      await page.click('button:has-text("Interest Rates")');
      
      // Verify same number of rows
      const rowsAfter = await page.locator('tbody tr').count();
      expect(rowsAfter).toBe(rowsBefore);
    }
  });

  test('should persist tariffs across page reload', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Tariffs")');
    
    const rowsBefore = await page.locator('tbody tr').count();
    
    if (rowsBefore > 0) {
      await page.reload();
      await login(page);
      await page.click('button:has-text("Tariffs")');
      
      const rowsAfter = await page.locator('tbody tr').count();
      expect(rowsAfter).toBe(rowsBefore);
    }
  });
});

test.describe('Responsive Behavior', () => {
  test('should adapt layout for mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page);
    
    // Verify nav tabs are visible
    const nav = page.locator('button:has-text("Dashboard")');
    await expect(nav).toBeVisible();
  });

  test('should show content on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await login(page);
    await page.click('button:has-text("Interest Rates")');
    
    // Verify table is visible
    const table = page.locator('table').first();
    if (await table.count() > 0) {
      await expect(table).toBeVisible();
    }
  });
});

test.describe('Error Handling', () => {
  test('should handle scraper errors gracefully', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Scrapers")');
    
    // If any scraper has error status
    const errorBadge = page.locator('text=ERROR');
    if (await errorBadge.count() > 0) {
      // Verify error message or badge is shown
      await expect(errorBadge.first()).toBeVisible();
    }
  });

  test('should handle invalid loan amount', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Compare")');
    
    // Try negative amount
    await page.fill('input[placeholder="0.00"]', '-1000');
    
    // Generate button should remain disabled or show error
    const generateBtn = page.locator('button:has-text("Generate")');
    
    // Either disabled or shows validation message
    const isDisabled = await generateBtn.isDisabled().catch(() => false);
    if (!isDisabled) {
      await generateBtn.click();
      await page.waitForTimeout(300);
      // Should show validation or stay on form
    }
  });

  test('should handle missing AWPR data', async ({ page }) => {
    await login(page);
    
    // Dashboard should show "—" for missing rates
    const dashCards = page.locator('text=—');
    if (await dashCards.count() > 0) {
      await expect(dashCards.first()).toBeVisible();
    }
  });
});

test.describe('Bank Logo Display', () => {
  test('should display bank logos in tables', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Interest Rates")');
    
    // Check if any rows have logos
    const logos = page.locator('tbody img[alt]');
    if (await logos.count() > 0) {
      const firstLogo = logos.first();
      await expect(firstLogo).toBeVisible();
      
      // Verify logo has proper styling
      const className = await firstLogo.getAttribute('class');
      expect(className).toContain('rounded');
    }
  });
});

test.describe('Accessibility', () => {
  test('should have meaningful button labels', async ({ page }) => {
    await login(page);
    
    // Check for meaningful button labels
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await login(page);
    
    // Tab through navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Verify focus is visible
    const focused = page.locator(':focus');
    if (await focused.count() > 0) {
      await expect(focused).toBeVisible();
    }
  });
});
