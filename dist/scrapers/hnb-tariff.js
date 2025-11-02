"use strict";
// src/scrapers/hnb-tariff.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeHnbTariff = scrapeHnbTariff;
const playwright_1 = require("playwright");
const text_1 = require("../utils/text");
const dom_1 = require("../utils/dom");
const jsdom_1 = require("jsdom");
const PRODUCT = ["Home Loan", "LAP", "Personal Loan", "Education Loan"];
const URL = "https://www.hnb.lk/tariffs/retail-services-tariff";
async function scrapeHnbTariff(opts) {
    const browser = await playwright_1.chromium.launch({
        headless: !opts?.show,
        slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined,
    });
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    const now = new Date().toISOString();
    try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await (0, dom_1.acceptAnyCookie)(page);
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
        const expandedRows = [];
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
    }
    finally {
        await browser.close();
    }
}
// Helper: parse HTML string table to FeeRow[] (dynamic group/heading logic)
function parseTariffTable(html, now) {
    const dom = new jsdom_1.JSDOM(html);
    const doc = dom.window.document;
    const out = [];
    const trs = Array.from(doc.querySelectorAll("tbody tr"));
    let groupDesc = ""; // dynamic heading
    for (let i = 0; i < trs.length; ++i) {
        const tds = Array.from(trs[i].querySelectorAll("td")).map(td => (0, text_1.clean)(td.textContent || ""));
        if (!tds.length)
            continue;
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
        }
        else if (tds.length === 2) {
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
            }
            else {
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
        }
        else if (tds.length === 1 && tds[0]) {
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
exports.default = scrapeHnbTariff;
//# sourceMappingURL=hnb-tariff.js.map