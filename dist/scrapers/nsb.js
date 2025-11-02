"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeNSB = scrapeNSB;
// src/scrapers/nsb.ts
const playwright_1 = require("playwright");
const SRC = "https://www.nsb.lk/lending-rates/";
const clean = (s) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const isGeneralHousing = (s) => s.toLowerCase().includes("housing loans") && s.toLowerCase().includes("(general)");
const isFirstHome = (s) => /(1st|first)\s*home\s*owner/i.test(s);
const isFullTenureFixedText = (s) => /fixed\s*for\s*full\s*tenure/i.test(s);
const isTwoYearFixedFloating = (s) => /fixed\s*for\s*two\s*years.*variable/i.test(s.toLowerCase());
function pctify(s) {
    const n = s.replace(/[^\d.]/g, "");
    if (!n)
        return clean(s);
    return `${Number(n)}%`;
}
async function acceptCookiesIfAny(page) {
    const sels = [
        'button:has-text("Accept")',
        'button:has-text("I Accept")',
        'button:has-text("Got it")',
        'button[aria-label*="accept" i]',
        'text=Accept All',
        'text=Allow all',
    ];
    for (const sel of sels) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
            await el.click({ timeout: 1500 }).catch(() => { });
            break;
        }
    }
}
function fanOutByYears(base, maxYears) {
    const rows = [];
    for (let y = 1; y <= maxYears; y++) {
        rows.push({ ...base, tenureYears: y });
    }
    return rows;
}
async function scrapeNSB(opts) {
    let browser = null;
    const out = [];
    const now = new Date().toISOString();
    try {
        browser = await playwright_1.chromium.launch({ headless: !opts?.show, slowMo: opts?.slow ?? 0 });
        const page = await (await browser.newContext()).newPage();
        await page.goto(SRC, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => { });
        await acceptCookiesIfAny(page);
        const rows = await page.evaluate(() => {
            function txt(n) {
                return (n?.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
            }
            const tables = Array.from(document.querySelectorAll("table"));
            let target = null;
            for (const t of tables) {
                const first = Array.from(t.querySelectorAll("tr:first-child th, tr:first-child td"));
                const headers = first.map(c => txt(c)).map(h => h.toLowerCase());
                const ok = headers.some(h => h.includes("loan type")) &&
                    headers.some(h => h.includes("description")) &&
                    headers.some(h => h.includes("interest rate"));
                if (ok) {
                    target = t;
                    break;
                }
            }
            if (!target)
                return [];
            const bodyRows = Array.from(target.querySelectorAll("tbody tr"));
            const out = [];
            let lastLoanType = "";
            for (const tr of bodyRows) {
                const tds = Array.from(tr.querySelectorAll("td"));
                if (!tds.length)
                    continue;
                let loanType = "", description = "", rateRaw = "";
                if (tds.length >= 3) {
                    loanType = txt(tds[0]) || lastLoanType;
                    description = txt(tds[1]);
                    rateRaw = txt(tds[2]);
                }
                else if (tds.length === 2) {
                    loanType = lastLoanType;
                    description = txt(tds[0]);
                    rateRaw = txt(tds[1]);
                }
                else
                    continue;
                if (loanType)
                    lastLoanType = loanType;
                if (!/^\s*\d+(?:\.\d+)?\s*$/.test(rateRaw))
                    continue;
                out.push({ loanType, description, rateRaw });
            }
            return out;
        });
        for (const r of rows) {
            const loanType = clean(r.loanType);
            const description = clean(r.description);
            const rate = pctify(r.rateRaw);
            if (/solar/i.test(loanType))
                continue;
            let product = "Home Loan";
            let notes;
            if (isGeneralHousing(loanType)) {
                product = "Home Loan";
                notes = `Housing Loans (General) - ${description}`;
            }
            else if (isFirstHome(loanType)) {
                product = "Home Loan";
                notes = `First Home Owner Loan - ${description}`;
            }
            else if (/alankara/i.test(loanType)) {
                product = "Home Loan";
                notes = "Alankara Housing Loan";
            }
            else if (/buddhi/i.test(loanType) || /higher education/i.test(description)) {
                product = "Education Loan";
                notes = `Buddhi Loan${description ? " - " + description : ""}`;
            }
            else if (/diriya/i.test(loanType)) {
                product = "Personal Loan";
                notes = `Diriya Loan${description ? " - " + description : ""}`;
            }
            else if (/professionals/i.test(loanType)) {
                product = "Personal Loan";
                notes = `Personal Loans for Professionals${description ? " - " + description : ""}`;
            }
            else if (/personal/i.test(loanType)) {
                product = "Personal Loan";
            }
            else if (/housing/i.test(loanType)) {
                product = "Home Loan";
            }
            else {
                product = loanType;
            }
            const isFullTenureFixed = isFullTenureFixedText(description);
            const twoYearFixedFloating = isTwoYearFixedFloating(description + " " + loanType);
            const base = {
                bank: "NSB",
                product,
                type: isFullTenureFixed ? "Fixed" : "Fixed & Floating",
                tenureLabel: "",
                rateWithSalary: rate,
                rateWithoutSalary: rate,
                source: SRC,
                updatedAt: now,
                ...(notes ? { notes } : {}),
            };
            let finalRows = [];
            if (product === "Home Loan" && isFullTenureFixed) {
                base.tenureLabel = "Full Tenure (Fixed)";
                finalRows = fanOutByYears(base, 25);
            }
            else {
                // All others are single-row
                base.tenureLabel = "2 Years (Fixed)";
                base.tenureYears = 2;
                if (twoYearFixedFloating) {
                    base.notes = base.notes
                        ? `${base.notes} | Fixed 2y, then variable every 6 months`
                        : "Fixed 2y, then variable every 6 months";
                }
                finalRows = [base];
            }
            out.push(...finalRows);
        }
        return out;
    }
    finally {
        if (browser)
            await browser.close().catch(() => { });
    }
}
//# sourceMappingURL=nsb.js.map