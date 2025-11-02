import { chromium, Browser, BrowserContext, Page } from "playwright";

/**
 * Create a new Playwright browser instance with production-safe flags
 * Always launches headless in production with stability flags
 */
export async function newBrowser(options?: { show?: boolean; slow?: number }): Promise<Browser> {
  return chromium.launch({
    headless: !options?.show,
    slowMo: options?.slow || 0,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox", 
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor"
    ]
  });
}

/**
 * Utility to create a page with standard navigation timeout
 */
export async function newPageWithDefaults(browser: Browser, options?: { 
  viewport?: { width: number; height: number };
  timeout?: number;
}): Promise<Page> {
  const context = await browser.newContext({
    viewport: options?.viewport || { width: 1366, height: 900 }
  });
  
  const page = await context.newPage();
  page.setDefaultTimeout(options?.timeout || 60000);
  page.setDefaultNavigationTimeout(options?.timeout || 60000);
  
  return page;
}

/**
 * Safe navigation with retry and timeout handling
 */
export async function safeGoto(page: Page, url: string, options?: {
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeout?: number;
  retries?: number;
}): Promise<void> {
  const waitUntil = options?.waitUntil || "domcontentloaded";
  const timeout = options?.timeout || 60000;
  const retries = options?.retries || 2;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout });
      return; // Success
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries) {
        await page.waitForTimeout(1000); // Wait 1s before retry
      }
    }
  }
  
  throw lastError || new Error(`Failed to navigate to ${url} after ${retries + 1} attempts`);
}

/**
 * Safe cleanup of browser resources
 */
export async function safeBrowserClose(browser: Browser): Promise<void> {
  try {
    await browser.close();
  } catch (error) {
    console.warn("Error closing browser:", error);
  }
}