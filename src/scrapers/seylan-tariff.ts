// src/scrapers/seylan-tariff.ts

import { chromium } from "playwright";
import { clean } from "../utils/text";
import { acceptAnyCookie } from "../utils/dom";
import { JSDOM } from "jsdom";

export interface FeeRow {
  bank: string;
  products: string[];      // ["Home Loan"] or ["LAP"]
  feeType: string;         // sub-fee/row name
  description: string;     // group/main section
  amount: string;          // charge/fee value
  notes?: string;
  updatedAt: string;
  source: string;
}

const URL = "https://www.seylan.lk/service-charges?category=HOUSING_LOAN_CHARGES";
export async function scrapeSeylanTariff(opts?: { show?: boolean; slow?: number }): Promise<FeeRow[]> {
  const browser = await chromium.launch({
    headless: !opts?.show,
    slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const now = new Date().toISOString();

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptAnyCookie(page);

    // Wait for HOUSING LOAN CHARGES table
    const homeLoanSel = 'h3:text("HOUSING LOAN CHARGES") + table';
    await page.waitForSelector(homeLoanSel, { timeout: 12000 });
    const homeLoanTableHtml = await page.$eval(homeLoanSel, el => el.outerHTML);

    // Parse Home Loan table
    let homeLoanRows = parseSeylanTariffTable(homeLoanTableHtml, "Home Loan", now);

    // Scroll down and expand LAP section
    // Find the span or link for LAP and click it if collapsed
    const lapTriggerSel = 'span.item_title:has-text("LOAN AGAINST PROPERTY (LAP)")';
    await page.waitForSelector(lapTriggerSel, { timeout: 12000 });
    const lapTrigger = page.locator(lapTriggerSel);
    await lapTrigger.scrollIntoViewIfNeeded();
    // Sometimes needs click, sometimes double click (if already expanded, click is safe)
    await lapTrigger.click();

    // Wait for LAP table to appear
    const lapTableSel = 'h3:text("LOAN AGAINST PROPERTY (LAP)") + table';
    await page.waitForSelector(lapTableSel, { timeout: 12000 });
    const lapTableHtml = await page.$eval(lapTableSel, el => el.outerHTML);

    // Parse LAP table
    let lapRows = parseSeylanTariffTable(lapTableHtml, "LAP", now);

    // Return combined, with per-product expansion
    return [...homeLoanRows, ...lapRows];
  } finally {
    await browser.close();
  }
}
function parseSeylanTariffTable(html: string, product: string, now: string): FeeRow[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const out: FeeRow[] = [];
  const trs = Array.from(doc.querySelectorAll("tbody tr"));
  let groupDesc = ""; // the main group/heading (bold in Description col)
  for (let i = 0; i < trs.length; ++i) {
    const tds = Array.from(trs[i].querySelectorAll("td")).map(td => clean(td.textContent || ""));
    if (tds.length < 2) continue;
    // If description cell is bold (main group), treat as new group
    const descCell = trs[i].querySelector(".row-two-value");
    const isBold = descCell?.querySelector("b") != null;
    if (isBold && tds[2] === "") {
      // Group/heading row (e.g., Mortgage Bond, Valuation Fee, etc)
      groupDesc = tds[1];
      continue; // No fee on group header, skip to children
    }
    // For the first row under a group, if isBold and has fee, it's also a group/heading
    if (isBold && tds[2] !== "") {
      groupDesc = tds[1];
      out.push({
        bank: "Seylan",
        products: [product],
        feeType: groupDesc,
        description: groupDesc,
        amount: tds[2],
        updatedAt: now,
        source: URL,
      });
      continue;
    }
    // Sub-row under a group
    out.push({
      bank: "Seylan",
      products: [product],
      feeType: tds[1],
      description: groupDesc,
      amount: tds[2],
      updatedAt: now,
      source: URL,
    });
  }
  return out;
}

export default scrapeSeylanTariff;
