// src/scrapers/combank_tariff.ts
import { chromium, Locator, Page } from "playwright";

const SRC = "https://www.combank.lk/rates-tariff#general-tariffs";
const nowISO = () => new Date().toISOString();

export interface FeeRow {
  bank: string;
  product: string;         // Home Loan | Personal Loan | Education Loan | Personal Loan - Top Up
  feeCategory: string;     // Processing Fee
  description: string;     // Slab/condition text
  amount: string;          // Fee value (LKR/%, etc.)
  updatedAt: string;
  source: string;
}

/* ---------- helpers ---------- */

async function clickGeneralTariffsTab(page: Page) {
  const tab = page.locator('a[href="#general-tariffs"]').first();
  await tab.scrollIntoViewIfNeeded().catch(() => {});
  try { await tab.click({ timeout: 10000, force: true }); } catch {}
  await page.locator("#general-tariffs").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function openExpandBlock(page: Page, title: string): Promise<Locator> {
  const link = page
    .locator("#general-tariffs")
    .locator("a.expand-link", { hasText: new RegExp(`^${title}\\b`, "i") })
    .first();

  await link.scrollIntoViewIfNeeded().catch(() => {});
  const isActive = await link.evaluate(el => el.classList.contains("active")).catch(() => false);
  if (!isActive) await link.click({ timeout: 10000, force: true });

  const block = link.locator('xpath=following-sibling::div[contains(@class,"hidden-block")]').first();
  await block.waitFor({ state: "visible", timeout: 10000 });
  await block.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(250);
  return block;
}

/* ---------- core table scraping ---------- */

async function scrapeTariffTable(block: Locator): Promise<FeeRow[]> {
  const out: FeeRow[] = [];
  const table = block.locator("table").first();
  await table.waitFor({ state: "visible", timeout: 10000 });

  const bodyRows = await table.locator("tbody tr").all();

  // product context; "IGNORE" means we’re in a section we don’t want to capture
  let product: string = "Home Loan";

  for (const tr of bodyRows) {
    const tds = (await tr.locator("td").allTextContents()).map(t => t.trim());
    const rawLabel = (tds[0] || "");
    const rawAmount = (tds[1] || "");
    const label = rawLabel.replace(/\s+/g, " ").trim();
    const amount = rawAmount.replace(/\s+/g, " ").trim();

    /* ----- context switches (headings) ----- */

    // Explicit headings we DO want
    if (/^Home Loans$/i.test(label)) { product = "Home Loan"; continue; }
    if (/^Personal Loans Setting Up Charges$/i.test(label)) { product = "Personal Loan"; continue; }
    if (/^Personal Loans Top-up Charges$/i.test(label)) { product = "Personal Loan - Top Up"; continue; }
    if (/^Education Loans?/i.test(label)) { product = "Education Loan"; continue; }

    // Headings we DON'T want – set to IGNORE so following rows are excluded
    if (/^Short Term Cultivation Loans/i.test(label)) { product = "IGNORE"; continue; }
    if (/^Microfinance Loans/i.test(label)) { product = "IGNORE"; continue; }
    if (/^Leasing$/i.test(label)) { product = "IGNORE"; continue; }
    if (/^Hire Purchase$/i.test(label)) { product = "IGNORE"; continue; }
    if (/^Temporary Facility$/i.test(label)) { product = "IGNORE"; continue; }
    if (/^Project Financing$/i.test(label)) { product = "IGNORE"; continue; }
    if (/^Off-?Shore Banking Centre$/i.test(label)) { product = "IGNORE"; continue; }
    if (/^Facilities? Secured By Cash$/i.test(label)) { product = "IGNORE"; continue; }

    /* ----- row-level skips ----- */

    // Notes, section numbers, completely empty rows
    if (/^Note\b/i.test(label)) continue;
    if (/^7\./.test(label)) continue;
    if (!label && !amount) continue;

    // Only keep Home Loan / Personal Loan / Education Loan / Personal Loan - Top Up
    const allowed = ["home loan", "personal loan", "education loan", "personal loan - top up"];
    if (!allowed.includes(product.toLowerCase())) continue;

    // Skip "As Above"
    if (amount.toLowerCase() === "as above") continue;

    // Also skip any *heading* row that slipped through with empty amount (safety)
    if (!amount && /loans?$/i.test(label)) continue;

    /* ----- keep row ----- */
    out.push({
      bank: "Commercial Bank",
      product,
      feeCategory: "Processing Fee",
      description: label,
      amount,
      updatedAt: nowISO(),
      source: SRC,
    });
  }

  return out;
}

/* ---------- main ---------- */

export async function scrapeCombankTariff(): Promise<FeeRow[]> {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  let out: FeeRow[] = [];
  try {
    await page.goto(SRC, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Accept cookie banners if present
    try {
      const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Got it")').first();
      if (await cookieBtn.isVisible()) await cookieBtn.click();
    } catch {}

    await clickGeneralTariffsTab(page);

    const block = await openExpandBlock(page, "Charges on Advances");

    out = await scrapeTariffTable(block);
  } finally {
    await browser.close();
  }

  return out;
}

/* ---------- local debug ---------- */
if (require.main === module) {
  scrapeCombankTariff().then(rows => {
    console.log(JSON.stringify(rows, null, 2));
  });
}
