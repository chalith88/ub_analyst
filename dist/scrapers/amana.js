"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeAmana = scrapeAmana;
// src/scrapers/amana.ts
const pdf_mjs_1 = require("pdfjs-dist/legacy/build/pdf.mjs");
const SRC = "https://www.amanabank.lk/pdf/tariff/advance-pricing-november-2024-english.pdf";
const BANK = "Amãna Bank";
const nowISO = () => new Date().toISOString();
function pctToken(s) {
    const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    return m ? `${m[1]}%` : undefined;
}
/** Group lines by y (with a small tolerance) so we can treat a row in the PDF as one line. */
function groupByRow(items, tol = 2) {
    // sort by y then x
    items.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    const rows = [];
    for (const it of items) {
        const last = rows[rows.length - 1];
        if (!last || Math.abs(it.y - last.y) > tol) {
            rows.push({ y: it.y, parts: [it.str] });
        }
        else {
            last.parts.push(it.str);
        }
    }
    return rows.map((r) => r.parts.join(" ").replace(/\s+/g, " ").trim());
}
/** Extract two % tokens on a row as [min,max] preserving on-page order */
function extractRangeFromRow(rowText) {
    const matches = rowText.match(/([0-9]+(?:\.[0-9]+)?)\s*%/g) || [];
    if (matches.length >= 2) {
        return [pctToken(matches[0]), pctToken(matches[1])];
    }
    if (matches.length === 1) {
        const only = pctToken(matches[0]);
        return [only, only];
    }
    return [undefined, undefined];
}
function normalizeProduct(label) {
    if (/Home\s*Financing/i.test(label))
        return "Home Loan";
    if (/Education\s*Financing/i.test(label))
        return "Education Loan";
    return null;
}
/** Fan-out helper: clones a row across 1..years with standardized labels. */
function fanOutYears(out, base, years) {
    for (let y = 1; y <= years; y++) {
        out.push({
            ...base,
            tenureLabel: `${y} Year${y > 1 ? "s" : ""}`,
            tenureYears: y,
        });
    }
}
/** Build min/max base rows for a product (without tenure fan-out). */
function buildMinMaxRows(product, minRate, maxRate) {
    const now = nowISO();
    const common = {
        bank: BANK,
        product,
        type: "Floating", // range presented; treat as floating band
        source: SRC,
        updatedAt: now,
    };
    const rows = [];
    if (minRate) {
        rows.push({
            ...common,
            tenureLabel: "Pricing Range",
            rateWithSalary: minRate,
            rateWithoutSalary: minRate,
            notes: "Minimum",
        });
    }
    if (maxRate) {
        rows.push({
            ...common,
            tenureLabel: "Pricing Range",
            rateWithSalary: maxRate,
            rateWithoutSalary: maxRate,
            notes: "Maximum",
        });
    }
    return rows;
}
async function scrapeAmana() {
    const out = [];
    const pdf = await (0, pdf_mjs_1.getDocument)({ url: SRC, standardFontDataUrl: undefined }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.map((it) => ({
        str: it.str,
        x: it.transform?.[4] ?? 0,
        y: it.transform?.[5] ?? 0,
    }));
    const rows = groupByRow(items);
    const collected = {};
    for (const row of rows) {
        const prod = normalizeProduct(row);
        if (prod) {
            const [minRate, maxRate] = extractRangeFromRow(row);
            collected[prod] = { min: minRate, max: maxRate };
        }
    }
    // Defensive pass over coarse Y-buckets in case numbers were split across spans
    for (const want of ["Home Loan", "Education Loan"]) {
        if (!collected[want]?.min || !collected[want]?.max) {
            const yBuckets = new Map();
            for (const it of items) {
                const key = Math.round(it.y);
                const arr = yBuckets.get(key) || [];
                arr.push(it.str);
                yBuckets.set(key, arr);
            }
            for (const [, parts] of yBuckets) {
                const line = parts.join(" ").replace(/\s+/g, " ").trim();
                const prod = normalizeProduct(line);
                if (prod === want) {
                    const [minRate, maxRate] = extractRangeFromRow(line);
                    collected[want] = { min: collected[want]?.min || minRate, max: collected[want]?.max || maxRate };
                }
            }
        }
    }
    // Build rows + fan-out years per product
    if (collected["Home Loan"]) {
        const { min, max } = collected["Home Loan"];
        const baseRows = buildMinMaxRows("Home Loan", min, max);
        for (const r of baseRows)
            fanOutYears(out, r, 20); // 1..20 years
    }
    if (collected["Education Loan"]) {
        const { min, max } = collected["Education Loan"];
        const baseRows = buildMinMaxRows("Education Loan", min, max);
        for (const r of baseRows)
            fanOutYears(out, r, 5); // 1..5 years
    }
    return out;
}
//# sourceMappingURL=amana.js.map