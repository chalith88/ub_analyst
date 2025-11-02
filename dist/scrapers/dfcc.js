"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeDFCC = scrapeDFCC;
const playwright_1 = require("playwright");
const dom_1 = require("../utils/dom");
const text_1 = require("../utils/text");
const URL = "https://www.dfcc.lk/interest-rates/lending-rates/";
/* ── helpers ── */
function asRate(s) {
    if (!s)
        return undefined;
    const t = (0, text_1.clean)(s);
    if (!t || t === "-" || t === "–")
        return undefined;
    if (/(awplr|awpr)/i.test(t))
        return (0, text_1.normalizeAwpr)(t);
    const m = t.match(/[0-9]+(?:\.[0-9]+)?/);
    return m ? `${Number(m[0]).toFixed(2)}%` : undefined;
}
function productFrom(desc) {
    const d = (0, text_1.clean)(desc).toLowerCase();
    if (/\bpersonal\b/.test(d))
        return "Personal Loan";
    if (/\bhousing\b|\bhome\b/.test(d))
        return "Home Loan";
    return desc; // do NOT default to Home Loan
}
/* ── main ── */
async function scrapeDFCC(opts) {
    const browser = await playwright_1.chromium.launch({
        headless: !opts?.show,
        slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined,
    });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
    });
    const page = await context.newPage();
    const out = [];
    const now = new Date().toISOString();
    try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        await (0, dom_1.acceptAnyCookie)(page).catch(() => { });
        // Make sure content renders
        await page.evaluate(async () => {
            for (let i = 0; i < 6; i++) {
                window.scrollBy(0, 1000);
                await new Promise(r => setTimeout(r, 100));
            }
            window.scrollTo(0, 0);
        });
        // Read ALL tables inside the rates wrapper, then keep only the 4 rows we want
        const rows = await page.evaluate(() => {
            const cleanTxt = (s) => s.replace(/\s+/g, " ").trim();
            const getTxt = (el) => cleanTxt(el?.innerText || "");
            const tables = Array.from(document.querySelectorAll(".rates-wrap table"));
            const wanted = [
                "housing loans - fixed (normal)",
                "housing loans - fixed (professionals & pinnacle fixed income clients)",
                "housing loans - variable",
                "personal loans - variable (professionals / salaried & others)",
            ];
            const out = [];
            for (const tbl of tables) {
                const trs = Array.from(tbl.querySelectorAll("tbody tr"));
                let lastDesc = "";
                for (const tr of trs) {
                    const tds = Array.from(tr.querySelectorAll("td"));
                    if (tds.length < 3)
                        continue;
                    let desc = getTxt(tds[0]);
                    const min = getTxt(tds[1]);
                    const max = getTxt(tds[2]);
                    // DFCC quirk: blank first cell for the Professionals row
                    if (!desc && /fixed/i.test(lastDesc)) {
                        desc = lastDesc.replace(/\(Normal\)/i, "(Professionals & Pinnacle Fixed Income Clients)");
                    }
                    if (desc)
                        lastDesc = desc;
                    const d = desc.toLowerCase();
                    if (wanted.some(w => d.includes(w))) {
                        out.push({ desc, min, max });
                    }
                }
            }
            return out;
        });
        // Map to RateRow[]
        for (const r of rows) {
            const product = productFrom(r.desc);
            if (!/home loan|personal loan/i.test(product))
                continue; // ignore overdrafts, etc.
            const min = asRate(r.min);
            const max = asRate(r.max);
            const isFloating = /variable|floating/i.test(r.desc) || /(awplr|awpr)/i.test(`${r.min} ${r.max}`);
            const base = {
                bank: "DFCC",
                product,
                type: isFloating ? "Floating" : "Fixed",
                tenureLabel: r.desc,
                source: URL,
                updatedAt: now,
            };
            const salariedOnly = /professionals.*pinnacle.*fixed income/i.test(r.desc);
            if (min) {
                out.push(...(0, text_1.fanOutByYears)(salariedOnly
                    ? { ...base, rateWithSalary: min, notes: "Minimum (Salaried/Professionals only)" }
                    : { ...base, rateWithSalary: min, rateWithoutSalary: min, notes: "Minimum" }, []));
            }
            if (max) {
                out.push(...(0, text_1.fanOutByYears)(salariedOnly
                    ? { ...base, rateWithSalary: max, notes: "Maximum (Salaried/Professionals only)" }
                    : { ...base, rateWithSalary: max, rateWithoutSalary: max, notes: "Maximum" }, []));
            }
        }
    }
    finally {
        await browser.close();
    }
    return out;
}
//# sourceMappingURL=dfcc.js.map