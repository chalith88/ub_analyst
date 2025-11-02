"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeCargills = scrapeCargills;
// src/scrapers/cargills.ts
const playwright_1 = require("playwright");
/** ------------------------------------------------------------------------
 * Cargills Bank – Lending Rates scraper
 * URL: https://www.cargillsbank.com/rates-and-charges/lending-rates/
 *
 * Banded schema (single row per tenure):
 *  rateWithSalaryAssignmentAbove300k
 *  rateWithSalaryRemittedAbove300k
 *  rateWithoutSalaryAbove300k
 *  rateWithSalaryAssignment150kTo299999
 *  rateWithSalaryRemitted150kTo299999
 *  rateWithoutSalary150kTo299999
 *  rateWithSalaryAssignmentUpTo149999
 *  rateWithSalaryRemittedUpTo149999
 *  rateWithoutSalaryUpTo149999
 *
 * Mapping (left→right sub-columns):
 *  Salary Assignment → rateWithSalaryAssignment<Band>
 *  Salary Remitted   → rateWithSalaryRemitted<Band>
 *  Standing Instruction → rateWithoutSalary<Band>
 *
 * Sections captured:
 *  • Home Loan (6M Var, 1y Fix, 3y Fix, 5y Fix)         → simple two-column mapping
 *  • LAP       (6M Var, 1y Fix, 3y Fix, 5y Fix)         → simple two-column mapping
 *  • Education Loan (01M Var, 6M Var, 1y Fix, 3y Fix, 5y Fix) → banded aggregate
 *  • Personal Loan – Employees / Professionals / Bankers Product → banded aggregate
 * ------------------------------------------------------------------------ */
const SRC = "https://www.cargillsbank.com/rates-and-charges/lending-rates/";
const BANK = "Cargills Bank";
const nowISO = () => new Date().toISOString();
const clean = (s) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const pctRe = /(\d+(?:\.\d+)?)\s*%/;
const awplrRe = /\bAWP(?:LR)?\b/i;
/* ------------------------------ pdf.js loader ------------------------------ */
async function ensurePdfJs(page) {
    await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js" });
    await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js" });
    await page.waitForFunction(() => window.pdfjsLib !== undefined, { timeout: 15000 });
}
async function extractPdfItems(page) {
    return page.evaluate(async () => {
        // @ts-ignore
        const pdfjs = window.pdfjsLib;
        const loading = pdfjs.getDocument({ url: location.href, useSystemFonts: true });
        const pdf = await loading.promise;
        const items = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const vp = page.getViewport({ scale: 1.0 });
            const tc = await page.getTextContent();
            for (const it of tc.items) {
                const tr = it.transform; // [a,b,c,d,e,f]
                const x = tr[4];
                const y = vp.height - tr[5]; // flip Y
                items.push({ str: it.str, x, y, w: it.width, h: it.height, page: p });
            }
        }
        return items;
    });
}
function groupRows(items, yTol = 2) {
    const byPage = new Map();
    items.forEach((it) => {
        const arr = byPage.get(it.page) ?? [];
        arr.push(it);
        byPage.set(it.page, arr);
    });
    const rows = [];
    for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
        const arr = byPage.get(page).slice().sort((a, b) => a.y - b.y || a.x - b.x);
        let cur = null;
        for (const it of arr) {
            if (!cur || Math.abs(it.y - cur.y) > yTol) {
                if (cur)
                    rows.push({
                        y: cur.y,
                        cells: cur.cells.sort((a, b) => a.x - b.x),
                        text: clean(cur.cells.map((c) => c.str).join(" ")),
                    });
                cur = { y: it.y, cells: [{ x: it.x, str: it.str }] };
            }
            else {
                cur.cells.push({ x: it.x, str: it.str });
            }
        }
        if (cur)
            rows.push({
                y: cur.y,
                cells: cur.cells.sort((a, b) => a.x - b.x),
                text: clean(cur.cells.map((c) => c.str).join(" ")),
            });
    }
    return rows;
}
/* --------------------------------- utils ---------------------------------- */
function findRowIndex(rows, re) {
    return rows.findIndex((r) => re.test(r.text));
}
function sliceBetween(rows, start, end) {
    return rows.slice(start, end);
}
function betweenTitles(rows, title, nextTitles) {
    const i = findRowIndex(rows, title);
    if (i === -1)
        return [];
    const nextIdxs = nextTitles.map((re) => {
        const j = rows.slice(i + 1).findIndex((r) => re.test(r.text));
        return j === -1 ? Infinity : i + 1 + j;
    });
    const end = Math.min(...nextIdxs.filter((n) => Number.isFinite(n))) || rows.length;
    return sliceBetween(rows, i, end);
}
function yearsFromLabel(label) {
    const m = label.match(/(\d+)\s*year/i);
    return m ? Number(m[1]) : undefined;
}
/** tenureCenters: X positions for tenure headers (used to bucket values by column) */
function tenureCenters(block, labels) {
    const xs = [];
    for (const label of labels) {
        const re = new RegExp(label.replace(/\s+/g, "\\s+"), "i");
        let x;
        for (const r of block) {
            const c = r.cells.find((c) => re.test(c.str));
            if (c) {
                x = c.x;
                break;
            }
        }
        xs.push(x ?? NaN);
    }
    if (xs.some((v) => Number.isNaN(v))) {
        const minX = Math.min(...block.flatMap((r) => r.cells.map((c) => c.x)));
        const maxX = Math.max(...block.flatMap((r) => r.cells.map((c) => c.x)));
        const step = (maxX - minX) / (labels.length + 1);
        return labels.map((_, i) => minX + step * (i + 1));
    }
    return xs;
}
/** tokens left→right: percentages or AWPLR + margin expressions */
function tokensL2R(row) {
    const toks = [];
    const cells = row.cells;
    for (let i = 0; i < cells.length; i++) {
        const s = clean(cells[i].str);
        if (!s)
            continue;
        // Merge AWPLR + margin if split
        if (awplrRe.test(s)) {
            let j = i + 1;
            let merged = s;
            while (j < cells.length && !pctRe.test(merged) && (cells[j].str || "").length < 18) {
                merged = clean(merged + " " + cells[j].str);
                j++;
            }
            if (/\d+(?:\.\d+)?\s*%/.test(merged)) {
                toks.push({ x: cells[i].x, val: merged.replace(/\s+/g, " ").replace(/–/g, "-") });
                i = j - 1;
                continue;
            }
        }
        const m = s.match(pctRe);
        if (m)
            toks.push({ x: cells[i].x, val: `${m[1]}%` });
    }
    return toks.sort((a, b) => a.x - b.x);
}
function put(obj, k, v) {
    if (v !== undefined && v !== null && v !== "")
        obj[k] = v;
}
const BAND_SUFFIXES = ["Above300k", "150kTo299999", "UpTo149999"];
const SUBCOL_KEYS = ["rateWithSalaryAssignment", "rateWithSalaryRemitted", "rateWithoutSalary"];
/** Normalize band text to improve matching (strip "/-" and collapse spaces) */
function normBandText(t) {
    return t.replace(/\/-\b/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
/** Robust generic band detector (Education + Employees + Bankers) */
function detectBand(txtRaw) {
    const t = normBandText(txtRaw);
    const c = t.replace(/\s+/g, "");
    // Above 300,000
    if (/\bSalary\s*(?:over|above)\s*(?:LKR\s*)?300[, ]?000\b/i.test(t) ||
        /Salary(?:over|above)LKR?300,?000\b/i.test(c))
        return "Above300k";
    // Between 150,000 & 299,***
    if (/\bSalary\s*between\s*(?:LKR\s*)?150[, ]?000(?:\/-)?\s*(?:&|and|to|–|-)\s*(?:LKR\s*)?299[, ]?\d{3}(?:\/-)?\b/i.test(t) ||
        /SalarybetweenLKR?150,?000(?:\/-)?(?:&|and|to|–|-)?LKR?299,?\d{3}(?:\/-)?/i.test(c))
        return "150kTo299999";
    // Up to / upto / up tp / below / less than 149,***
    const upWord = "(?:up\\s*(?:to|tp)|upto|below|less\\s*than)";
    if (new RegExp(`\\bSalary\\s*${upWord}\\s*(?:LKR\\s*)?149[, ]?\\d{3}(?:\\/-)?\\b`, "i").test(t) ||
        /Salary(?:upto|uptp|up(?:to|tp)|below|lessthan)LKR?149,?\d{3}(?:\/-)?/i.test(c))
        return "UpTo149999";
    return undefined;
}
/** Look ahead a few rows after a band header to collect its values */
function collectBandValues(block, startIdx, labels, centers, maxLookahead = 4) {
    const buckets = labels.map(() => []);
    const end = Math.min(block.length, startIdx + 1 + maxLookahead);
    for (let rIdx = startIdx; rIdx < end; rIdx++) {
        const row = block[rIdx];
        if (rIdx !== startIdx && (detectBand(row.text) || detectBandProfessionals(row.text)))
            break;
        const toks = tokensL2R(row);
        if (!toks.length)
            continue;
        for (const t of toks) {
            let best = 0, bestd = Infinity;
            centers.forEach((cx, i) => {
                const d = Math.abs(t.x - cx);
                if (d < bestd) {
                    bestd = d;
                    best = i;
                }
            });
            buckets[best].push({ x: t.x, v: t.val });
        }
        if (buckets.every(arr => arr.length >= 3))
            break;
    }
    return { buckets };
}
/** Ensure all 9 band keys exist on a row (fill missing with null for stable shape). */
function ensureAllBandKeys(row) {
    for (const band of BAND_SUFFIXES) {
        for (const base of SUBCOL_KEYS) {
            const k = `${base}${band}`;
            if (!(k in row))
                row[k] = null;
        }
    }
}
/* ----------------- Professionals-specific band support --------------------- */
const PROF_BAND_SUFFIXES = ["Above500k", "300kTo499999", "150kTo299999"];
function detectBandProfessionals(txtRaw) {
    const t = normBandText(txtRaw);
    const c = t.replace(/\s+/g, "");
    // Above 500,000
    if (/\bSalary\s*(?:over|above)\s*(?:LKR\s*)?500[, ]?000\b/i.test(t) ||
        /Salary(?:over|above)LKR?500,?000\b/i.test(c))
        return "Above500k";
    // Between 300,000 & 499,***
    if (/\bSalary\s*between\s*(?:LKR\s*)?300[, ]?000(?:\/-)?\s*(?:&|and|to|–|-)\s*(?:LKR\s*)?499[, ]?\d{3}(?:\/-)?\b/i.test(t) ||
        /SalarybetweenLKR?300,?000(?:\/-)?(?:&|and|to|–|-)?LKR?499,?\d{3}(?:\/-)?/i.test(c))
        return "300kTo499999";
    // Between 150,000 & 299,***
    if (/\bSalary\s*between\s*(?:LKR\s*)?150[, ]?000(?:\/-)?\s*(?:&|and|to|–|-)\s*(?:LKR\s*)?299[, ]?\d{3}(?:\/-)?\b/i.test(t) ||
        /SalarybetweenLKR?150,?000(?:\/-)?(?:&|and|to|–|-)?LKR?299,?\d{3}(?:\/-)?/i.test(c))
        return "150kTo299999";
    return undefined;
}
function ensureAllBandKeysCustom(row, suffixes) {
    var _a, _b, _c;
    for (const band of suffixes) {
        row[_a = `rateWithSalaryAssignment${band}`] ?? (row[_a] = null);
        row[_b = `rateWithSalaryRemitted${band}`] ?? (row[_b] = null);
        row[_c = `rateWithoutSalary${band}`] ?? (row[_c] = null);
    }
}
/* ---------------------- emitters (band aggregate rows) --------------------- */
/** Aggregate-banded rows (one object per tenure with all bands).
 *  Options let us override detector/suffixes for Professionals.
 */
function parseBandedBlockAggregate(block, product, labels, types, notes, opts) {
    const detector = opts?.bandDetector ?? detectBand;
    const suffixes = opts?.suffixes ?? BAND_SUFFIXES;
    const out = [];
    const centers = tenureCenters(block, labels);
    const bandHeaderIdxs = [];
    for (let i = 0; i < block.length; i++) {
        const b = detector(block[i].text);
        if (b)
            bandHeaderIdxs.push({ idx: i, band: b });
    }
    if (!bandHeaderIdxs.length)
        return out;
    const rowsMap = new Map();
    const mkBase = (i) => ({
        bank: BANK,
        product,
        type: types[i],
        tenureLabel: labels[i],
        source: SRC,
        updatedAt: nowISO(),
        notes,
        tenureYears: types[i] === "Fixed" ? yearsFromLabel(labels[i]) : undefined,
    });
    for (const { idx, band } of bandHeaderIdxs) {
        const { buckets } = collectBandValues(block, idx, labels, centers, 4);
        for (let i = 0; i < labels.length; i++) {
            const row = rowsMap.get(i) ?? mkBase(i);
            const vals = buckets[i].sort((a, b) => a.x - b.x).map((b) => b.v).slice(0, 3);
            if (vals[0])
                row[`rateWithSalaryAssignment${band}`] = vals[0];
            if (vals[1])
                row[`rateWithSalaryRemitted${band}`] = vals[1];
            if (vals[2])
                row[`rateWithoutSalary${band}`] = vals[2];
            rowsMap.set(i, row);
        }
    }
    for (let i = 0; i < labels.length; i++) {
        const row = rowsMap.get(i) ?? mkBase(i);
        ensureAllBandKeysCustom(row, suffixes);
        out.push(row);
    }
    return out;
}
/* ------------------ Bankers-only: map to WITHOUT-SALARY keys --------------- */
/** For Bankers Product: every band value is a "without salary" rate.
 * We emit ONLY:
 *   - rateWithoutSalaryAbove300k
 *   - rateWithoutSalary150kTo299999
 *   - rateWithoutSalaryUpTo149999
 */
function parseBankersBlockAggregate(block, product, labels, types, notes) {
    const out = [];
    const centers = tenureCenters(block, labels);
    const bandHeaderIdxs = [];
    for (let i = 0; i < block.length; i++) {
        const b = detectBand(block[i].text);
        if (b)
            bandHeaderIdxs.push({ idx: i, band: b });
    }
    if (!bandHeaderIdxs.length)
        return out;
    const rowsMap = new Map();
    const mkBase = (i) => ({
        bank: BANK,
        product,
        type: types[i],
        tenureLabel: labels[i],
        source: SRC,
        updatedAt: nowISO(),
        notes,
        tenureYears: types[i] === "Fixed" ? yearsFromLabel(labels[i]) : undefined,
    });
    // Helper to ensure we always have the three without-salary keys
    function ensureBankersWithout(row) {
        for (const band of BAND_SUFFIXES) {
            const k = `rateWithoutSalary${band}`;
            if (!(k in row))
                row[k] = null;
        }
    }
    for (const { idx, band } of bandHeaderIdxs) {
        const { buckets } = collectBandValues(block, idx, labels, centers, 4);
        for (let i = 0; i < labels.length; i++) {
            const row = rowsMap.get(i) ?? mkBase(i);
            const vals = buckets[i].sort((a, b) => a.x - b.x).map((b) => b.v);
            // pick the rightmost token (or the only token) as the "without salary" rate
            const v = vals.length >= 3 ? vals[2] : vals[vals.length - 1];
            if (v)
                row[`rateWithoutSalary${band}`] = v;
            rowsMap.set(i, row);
        }
    }
    for (let i = 0; i < labels.length; i++) {
        const row = rowsMap.get(i) ?? mkBase(i);
        ensureBankersWithout(row);
        out.push(row);
    }
    return out;
}
/** Home/LAP simple (two columns) — unchanged */
function emitHomeOrLAPSimple(out, product, block, labels, types) {
    const r = block.find((rw) => (rw.text.match(pctRe) || []).length >= 2);
    if (!r)
        return;
    const centers = tenureCenters(block, labels);
    const toks = tokensL2R(r);
    const buckets = labels.map(() => []);
    for (const t of toks) {
        let best = 0, bestd = Infinity;
        centers.forEach((cx, idx) => {
            const d = Math.abs(t.x - cx);
            if (d < bestd) {
                bestd = d;
                best = idx;
            }
        });
        buckets[best].push({ x: t.x, v: t.val });
    }
    for (let i = 0; i < labels.length; i++) {
        const vs = buckets[i].sort((a, b) => a.x - b.x).map((b) => b.v);
        const row = {
            bank: BANK,
            product,
            type: types[i],
            tenureLabel: labels[i],
            source: SRC,
            updatedAt: nowISO(),
            tenureYears: types[i] === "Fixed" ? yearsFromLabel(labels[i]) : undefined,
        };
        if (vs.length >= 2) {
            put(row, "rateWithSalaryRemitted", vs[0]);
            put(row, "rateWithoutSalary", vs[1]);
        }
        else if (vs.length === 1) {
            put(row, "rateWithSalaryRemitted", vs[0]);
        }
        out.push(row);
    }
}
/* ------------------------------ main scrape ------------------------------- */
async function openBrowser(opts) {
    const browser = await playwright_1.chromium.launch({
        headless: !(opts.show === "true"),
        slowMo: opts.slow ? Number(opts.slow) : 0,
    });
    const page = await browser.newPage();
    return { browser, page };
}
async function maybeSave(bank, data, save) {
    if (save !== "true")
        return;
    const fs = await Promise.resolve().then(() => __importStar(require("fs/promises")));
    const path = await Promise.resolve().then(() => __importStar(require("path")));
    const outDir = path.join(process.cwd(), "output");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, `${bank.toLowerCase().replace(/\s+/g, "")}.json`), JSON.stringify(data, null, 2), "utf8");
}
/** Exported entry */
async function scrapeCargills(opts = {}) {
    const { browser, page } = await openBrowser(opts);
    try {
        // 1) Page → accept cookies if present
        await page.goto(SRC, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => { try {
            sessionStorage["cookiePloicyShown"] = "yes";
        }
        catch { } });
        const cookieBtn = page.locator("button.cookie-dismiss");
        if (await cookieBtn.count().then((n) => n > 0) && (await cookieBtn.first().isVisible().catch(() => false))) {
            await cookieBtn.first().click().catch(() => { });
        }
        // 2) Get embedded PDF URL from <object type="application/pdf" data="...">
        const obj = page.locator('object[type="application/pdf"]');
        await obj.first().waitFor({ state: "visible", timeout: 15000 });
        const pdfUrl = await obj.first().getAttribute("data");
        if (!pdfUrl)
            throw new Error("Embedded PDF URL not found");
        // 3) Open the PDF and load pdf.js
        await page.goto(pdfUrl, { waitUntil: "domcontentloaded" });
        await ensurePdfJs(page);
        // 4) Extract & group text with coordinates
        const items = await extractPdfItems(page);
        const rows = groupRows(items);
        const ALL = [];
        // ---------- Titles ----------
        const tHome = /Housing Loans Rates/i;
        const tLap = /Loan against property rates/i;
        const tEdu = /Education Loan Rates/i;
        const tPLCorp = /Personal Loans\s*-\s*Employees of (?:Large|Diversified|Large\/Diversified)\s*Corporates.*including\s*Cargills\s*Group\s*staff\s*\(Excluding Bank staff\)/i;
        const tPLProf = /Personal Loans\s*-\s*Professionals.*Engineers.*Doctors.*Accountants.*Architects.*Pilots/i;
        const tPLBankers = /Personal Loans\s*-\s*(?:General Product|Bankers Product)/i;
        const tAll = [tHome, tLap, tEdu, tPLCorp, tPLProf, tPLBankers];
        // Column sets
        const HL_LAP_LABELS = ["6 Months Variable", "1 year Fixed", "3 year Fixed", "5 Year Fixed"];
        const HL_LAP_TYPES = ["Floating", "Fixed", "Fixed", "Fixed"];
        const EDU_PL_LABELS = ["01 Month Variable", "6 Months Variable", "1 year Fixed", "3 year Fixed", "5 Year Fixed"];
        const EDU_PL_TYPES = ["Floating", "Floating", "Fixed", "Fixed", "Fixed"];
        // ---------- HOME LOAN (simple) ----------
        {
            const block = betweenTitles(rows, tHome, tAll.filter((r) => r !== tHome));
            emitHomeOrLAPSimple(ALL, "Home Loan", block, [...HL_LAP_LABELS], HL_LAP_TYPES);
        }
        // ---------- LAP (simple) ----------
        {
            const block = betweenTitles(rows, tLap, tAll.filter((r) => r !== tLap));
            emitHomeOrLAPSimple(ALL, "LAP", block, [...HL_LAP_LABELS], HL_LAP_TYPES);
        }
        // ---------- EDUCATION (banded; generic detector) ----------
        {
            const block = betweenTitles(rows, tEdu, tAll.filter((r) => r !== tEdu));
            ALL.push(...parseBandedBlockAggregate(block, "Education Loan", [...EDU_PL_LABELS], EDU_PL_TYPES, "Education Loan Rates"));
        }
        // ---------- PERSONAL – Employees (banded; generic detector) ----------
        {
            const block = betweenTitles(rows, tPLCorp, tAll.filter((r) => r !== tPLCorp));
            ALL.push(...parseBandedBlockAggregate(block, "Personal Loan", [...EDU_PL_LABELS], EDU_PL_TYPES, "Employees of Large/Diversified Corporates (incl. Cargills Group staff, excluding bank staff)"));
        }
        // ---------- PERSONAL – Professionals (banded; custom bands) ----------
        {
            const block = betweenTitles(rows, tPLProf, tAll.filter((r) => r !== tPLProf));
            ALL.push(...parseBandedBlockAggregate(block, "Personal Loan", [...EDU_PL_LABELS], EDU_PL_TYPES, "Professionals (Engineers, Doctors, Accountants, Architects, Pilots)", {
                bandDetector: detectBandProfessionals,
                suffixes: PROF_BAND_SUFFIXES,
            }));
        }
        // ---------- PERSONAL – Bankers Product (banded; ONLY without-salary keys) ----------
        {
            const block = betweenTitles(rows, tPLBankers, tAll.filter((r) => r !== tPLBankers));
            if (block.length) {
                ALL.push(...parseBankersBlockAggregate(block, "Personal Loan", [...EDU_PL_LABELS], EDU_PL_TYPES, "Bankers Product"));
            }
        }
        // de-dup exact objects
        const seen = new Set();
        const data = ALL.filter((r) => {
            const k = JSON.stringify(r);
            if (seen.has(k))
                return false;
            seen.add(k);
            return true;
        });
        if (opts.save === "true")
            await maybeSave("cargills", data, opts.save);
        return data;
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=cargills.js.map