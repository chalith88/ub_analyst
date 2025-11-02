"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeUnionBank = scrapeUnionBank;
const playwright_1 = require("playwright");
const text_1 = require("../utils/text");
const URL = "https://www.unionb.com/interest-rates/loans/";
async function acceptCookies(page) {
    const sels = [
        'button:has-text("Accept")',
        'button:has-text("I Accept")',
        'button:has-text("I agree")',
        'button:has-text("Got it")',
        "#cookie_action_close_header",
        ".cky-btn.cky-btn-accept",
        ".cc-allow",
    ];
    for (const s of sels) {
        const b = page.locator(s).first();
        if (await b.isVisible().catch(() => false)) {
            await b.click().catch(() => { });
            break;
        }
    }
}
function normalizeRate(s) {
    const m = s.replace(/\s+/g, " ").match(/(\d+(?:\.\d+)?)(?:\s*%?)$/);
    return m ? `${m[1]}%` : undefined;
}
function typeFromTenure(tenure) {
    const t = tenure.toLowerCase();
    return (t.includes("variable") || t.includes("floating")) ? "Floating" : "Fixed";
}
function extractYears(label) {
    const m = label.match(/(\d+)\s*Y/i);
    return m ? parseInt(m[1], 10) : undefined;
}
/** Normalize product names to match HNB JSON style */
function normalizeProduct(raw) {
    const s = raw.toLowerCase().trim();
    if (/loan against property/i.test(raw))
        return "LAP";
    if (/home loan/i.test(raw))
        return "Home Loan";
    if (/educational/i.test(raw))
        return "Education Loan";
    if (/personal loan/i.test(raw))
        return "Personal Loan";
    return raw; // fallback if unknown
}
async function scrapeUnionBank(opts = {}) {
    const { show = false, slow = 0 } = opts;
    const browser = await playwright_1.chromium.launch({ headless: !show, slowMo: slow || 0 });
    const page = await browser.newPage();
    const out = [];
    const now = new Date().toISOString();
    try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => { });
        await acceptCookies(page);
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(200);
        const table = page.locator("table.rat-tab-m-w").first();
        await table.waitFor({ timeout: 30000 });
        const productRows = table.locator("> tbody > tr");
        const count = await productRows.count();
        for (let i = 0; i < count; i++) {
            const row = productRows.nth(i);
            const tds = row.locator("> td");
            const tdN = await tds.count();
            if (!tdN)
                continue;
            let productRaw = "";
            for (let j = 0; j < tdN; j++) {
                const td = tds.nth(j);
                const cls = (await td.getAttribute("class")) || "";
                if (!/\bin-ra-td\b/.test(cls)) {
                    productRaw = (0, text_1.clean)(await td.innerText());
                    break;
                }
            }
            if (!productRaw)
                continue;
            // Skip Leasing / Vehicle Loans
            if (/leasing|vehicle/i.test(productRaw))
                continue;
            const product = normalizeProduct(productRaw);
            const innerTables = row.locator("> td.in-ra-td table.in-ra-t.en");
            const innerCnt = await innerTables.count();
            if (!innerCnt)
                continue;
            for (let k = 0; k < innerCnt; k++) {
                const it = innerTables.nth(k);
                const cells = it.locator("tr > td");
                const c = await cells.count();
                if (c < 2)
                    continue;
                const tenure = (0, text_1.clean)(await cells.nth(0).innerText());
                const rateTxt = (0, text_1.clean)(await cells.nth(c - 1).innerText());
                const rate = normalizeRate(rateTxt);
                if (!tenure || !rate)
                    continue;
                // --- Personal Loan (Salary Assignments) fan-out ---
                if (product === "Personal Loan" && /salary/i.test(productRaw)) {
                    if (/variable/i.test(tenure)) {
                        for (let yr = 1; yr <= 7; yr++) {
                            out.push({
                                bank: "Union Bank of Colombo",
                                product,
                                type: "Floating",
                                tenureLabel: `${yr} Years`,
                                tenureYears: yr,
                                rateWithSalary: rate,
                                source: URL,
                                updatedAt: now,
                                notes: "Salary assignment variant",
                            });
                        }
                    }
                    else if (/fixed/i.test(tenure)) {
                        for (let yr = 1; yr <= 5; yr++) {
                            out.push({
                                bank: "Union Bank of Colombo",
                                product,
                                type: "Fixed",
                                tenureLabel: `${yr} Years`,
                                tenureYears: yr,
                                rateWithSalary: rate,
                                source: URL,
                                updatedAt: now,
                                notes: "Salary assignment variant",
                            });
                        }
                    }
                    continue;
                }
                // --- Education Loan VARIABLE → fan out 1–15 years ---
                if (product === "Education Loan" && /variable/i.test(tenure)) {
                    for (let yr = 1; yr <= 15; yr++) {
                        out.push({
                            bank: "Union Bank of Colombo",
                            product,
                            type: "Floating",
                            tenureLabel: `${yr} Years`,
                            tenureYears: yr,
                            rateWithSalary: rate,
                            rateWithoutSalary: rate,
                            source: URL,
                            updatedAt: now,
                            notes: "Applicable with or without salary assignment",
                        });
                    }
                    continue;
                }
                // --- Home Loan / LAP / Education Loan fixed rows ---
                if (["Home Loan", "LAP", "Education Loan"].includes(product)) {
                    const yrs = extractYears(tenure);
                    out.push({
                        bank: "Union Bank of Colombo",
                        product,
                        type: typeFromTenure(tenure),
                        tenureLabel: yrs ? `${yrs} Years` : tenure,
                        tenureYears: yrs,
                        rateWithSalary: rate,
                        rateWithoutSalary: rate,
                        source: URL,
                        updatedAt: now,
                        notes: "Applicable with or without salary assignment",
                    });
                    continue;
                }
                // --- Other rows (fallback) ---
                const yrs = extractYears(tenure);
                out.push({
                    bank: "Union Bank of Colombo",
                    product,
                    type: typeFromTenure(tenure),
                    tenureLabel: yrs ? `${yrs} Years` : tenure,
                    tenureYears: yrs,
                    rateWithSalary: rate,
                    source: URL,
                    updatedAt: now,
                });
            }
        }
        return out;
    }
    finally {
        await browser.close().catch(() => { });
    }
}
//# sourceMappingURL=unionb.js.map