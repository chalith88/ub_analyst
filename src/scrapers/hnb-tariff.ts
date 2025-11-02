// src/scrapers/hnb-tariff.ts

import { chromium, Page } from "playwright";
import { clean } from "../utils/text";
import { acceptAnyCookie } from "../utils/dom";
import { JSDOM } from "jsdom";

// Types
export interface FeeRow {
  bank: string;
  product: string;      // ["Home Loan"]
  feeType: string;         // e.g. "Up to Rs. 1,000,000/-"
  description: string;     // e.g. "Documentation Charges"
  amount: string;          // e.g. "Rs. 10,000/-"
  notes?: string;
  updatedAt: string;
  source: string;
}

const PRODUCT = ["Home Loan", "LAP", "Personal Loan", "Education Loan"];
const URL = "https://www.hnb.lk/tariffs/retail-services-tariff";

export async function scrapeHnbTariff(opts?: { show?: boolean; slow?: number }): Promise<FeeRow[]> {
  const browser = await chromium.launch({
    headless: !opts?.show,
    slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const now = new Date().toISOString();

  try {
    // Try domcontentloaded first, fallback to load with longer timeout
    try {
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      await page.goto(URL, { waitUntil: "load", timeout: 90000 });
    }
    await acceptAnyCookie(page);

    // Click to expand "Personal Financial Services"
    const persFinSel = 'button:has-text("Personal Financial Services")';
    await page.waitForSelector(persFinSel, { timeout: 8000 });
    await page.locator(persFinSel).click();

    // Click to expand "HOME LOAN AND PERSONAL LOAN CHARGES"
    const homeLoanButton = page.locator('button:has-text("HOME LOAN AND PERSONAL LOAN CHARGES")');
    await homeLoanButton.waitFor({ state: "visible", timeout: 8000 });
    await homeLoanButton.click();

    // Wait for the table to show up
    const tableSel = 'table.w-full.text-left';
    await page.waitForSelector(tableSel, { timeout: 8000 });

    // Extract the HTML table for parsing
    const tableHtml = await page.$eval(tableSel, el => el.outerHTML);

    // Parse and flatten
    const rows = parseTariffTable(tableHtml, now);

    // Expand per product
    const expandedRows: FeeRow[] = [];
    for (const r of rows) {
      for (const product of PRODUCT) {
        expandedRows.push({
          ...r,
          bank: "HNB",
          product: product,
          updatedAt: now,
          source: URL,
        });
      }
    }
    return expandedRows;
  } finally {
    await browser.close();
  }
}

// Helper: parse HTML string table to FeeRow[] (dynamic group/heading logic)
function parseTariffTable(html: string, now: string): FeeRow[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const out: FeeRow[] = [];
  const trs = Array.from(doc.querySelectorAll("tbody tr"));
  let groupDesc = ""; // dynamic heading

  for (let i = 0; i < trs.length; ++i) {
    const tds = Array.from(trs[i].querySelectorAll("td")).map(td => clean(td.textContent || ""));
    if (!tds.length) continue;
    if (tds.length === 3) {
      // New group + first subrow
      groupDesc = tds[0];
      out.push({
        bank: "HNB",
        product: [],
        feeType: tds[1],
        description: groupDesc,
        amount: tds[2],
        updatedAt: now,
        source: URL,
      });
    } else if (tds.length === 2) {
      // If this is a new group label (like "Early Settlement / Part Payment Charges"),
      // and the amount cell is a full sentence, treat this as a new section with no sub-rows
      const isLikelyGroupLabel = /charges?/i.test(tds[0]) || /settlement/i.test(tds[0]);
      if (isLikelyGroupLabel) {
        groupDesc = tds[0];
        out.push({
          bank: "HNB",
          product: [],
          feeType: "",
          description: groupDesc,
          amount: tds[1],
          updatedAt: now,
          source: URL,
        });
      } else {
        // Normal 2-col row in current group
        out.push({
          bank: "HNB",
          product: [],
          feeType: tds[0],
          description: groupDesc,
          amount: tds[1],
          updatedAt: now,
          source: URL,
        });
      }
    } else if (tds.length === 1 && tds[0]) {
      // Note row (rare)
      out.push({
        bank: "HNB",
        product: [],
        feeType: "",
        description: groupDesc,
        amount: "",
        notes: tds[0],
        updatedAt: now,
        source: URL,
      });
    }
  }
  return out;
}

export default scrapeHnbTariff;