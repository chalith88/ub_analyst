"use strict";
/**
 * Tariff normalization & selection (per PROMPT.md)
 *
 * Responsibilities:
 * - normalizeTariffRow: convert raw tariff CSV/JSON rows into a NormalizedTariff
 * - pickTariffsForScenario: select applicable tariffs for a given scenario and compute LKR amounts
 *
 * Notes:
 * - Keep pure, typed, and defensive. Regexes are documented.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCategory = mapCategory;
exports.normalizeTariffRow = normalizeTariffRow;
exports.computeTariffAmount = computeTariffAmount;
exports.pickTariffsForScenario = pickTariffsForScenario;
// ---------------- Parsing helpers ----------------
// Extract first percentage number in text like "1.25%" => 1.25
function firstPercent(text) {
    const m = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (!m)
        return undefined;
    return Number(m[1]);
}
// Extract first money, supporting Mn/Million suffix
function firstMoney(text) {
    // Match e.g. Rs 10,000 | LKR 10 000 | 10,000 | 5 Mn | 5 Million
    const m = text.match(/(?:rs\.?|lkr)?\s*([0-9][0-9,\s]*)(?:\.(\d{2}))?\s*(mn|million)?/i);
    if (!m)
        return undefined;
    let n = Number(m[1].replace(/[^0-9]/g, ""));
    if (m[2])
        n = n + Number("0." + m[2]);
    const mult = m[3] ? 1000000 : 1;
    return n * mult;
}
// Extract Min/Max constraints like "Min Rs. 10,000" and "Max Rs. 50,000"
function parseMinMax(text) {
    let min;
    let max;
    const minM = text.match(/\bmin\b[^0-9]*([0-9][0-9,\s]*)(?:\.(\d{2}))?/i);
    if (minM) {
        const n = Number(minM[1].replace(/[^0-9]/g, ""));
        min = minM[2] ? n + Number("0." + minM[2]) : n;
    }
    const maxM = text.match(/\bmax\b[^0-9]*([0-9][0-9,\s]*)(?:\.(\d{2}))?/i);
    if (maxM) {
        const n = Number(maxM[1].replace(/[^0-9]/g, ""));
        max = maxM[2] ? n + Number("0." + maxM[2]) : n;
    }
    return { min, max };
}
// Determine per-unit token
function parsePerUnit(text) {
    const t = text.toLowerCase();
    if (/per\s+inspection/.test(t))
        return { perUnit: "inspection", countDefault: 1 };
    if (/per\s+valuation/.test(t))
        return { perUnit: "valuation", countDefault: 1 };
    if (/per\s+document/.test(t))
        return { perUnit: "document", countDefault: 1 };
    if (/per\s+visit/.test(t))
        return { perUnit: "visit", countDefault: 1 };
    return {};
}
// Map to normalized fee category per spec
function mapCategory(text) {
    const t = (text || "").toLowerCase();
    if (/(processing|handling|facility)/.test(t))
        return "processing";
    if (/(legal|notary|mortgage|title)/.test(t))
        return "legal";
    if (/(valuation|inspection)/.test(t))
        return "valuation";
    if (/(crib|credit\s*bureau)/.test(t))
        return "crib";
    if (/(early\s*settlement|prepayment|closure)/.test(t))
        return "early_settlement";
    if (/(penalty|late\s*payment|penal\s*interest)/.test(t))
        return "penalty";
    return "other";
}
function normalizeProductName(p) {
    const t = p.trim().toLowerCase();
    if (t === "hl" || /home\s*loan/.test(t))
        return "Home Loan";
    if (t === "pl" || /personal\s*loan/.test(t))
        return "Personal Loan";
    if (t === "lap" || /loan\s*against\s*property|lap/.test(t))
        return "LAP";
    if (/education/.test(t))
        return "Education Loan";
    return p;
}
// Parse bands in segments separated by ;, |, newlines
function parseBands(text) {
    const segments = text.split(/[;\n\r\|]+/).map((s) => s.trim()).filter(Boolean);
    const bands = [];
    for (const seg of segments) {
        const pct = firstPercent(seg);
        const money = firstMoney(seg);
        const basis = pct != null ? "percent" : money != null ? "flat" : undefined;
        if (!basis)
            continue;
        let min;
        let max;
        // up to X => max inclusive
        let m = seg.match(/up\s*to\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\s]*)(?:\.(\d{2}))?\s*(mn|million)?/i);
        if (m) {
            const n = Number(m[1].replace(/[^0-9]/g, ""));
            const n2 = m[2] ? n + Number("0." + m[2]) : n;
            const mult = m[3] ? 1000000 : 1;
            max = n2 * mult;
        }
        // above/over/> X => min exclusive (normalize to min + epsilon ~ treat as inclusive of next integer)
        m = seg.match(/(?:above|over|more than|greater than|>+)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\s]*)(?:\.(\d{2}))?\s*(mn|million)?/i);
        if (m) {
            const n = Number(m[1].replace(/[^0-9]/g, ""));
            const n2 = m[2] ? n + Number("0." + m[2]) : n;
            const mult = m[3] ? 1000000 : 1;
            min = n2 * mult + 1; // normalize to next rupee
        }
        // between/from A to/up to B
        m = seg.match(/(?:between|from)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\s]*)(?:\.(\d{2}))?\s*(mn|million)?\s*(?:to|up to)\s*(?:rs\.?|lkr)?\s*([0-9][0-9,\s]*)(?:\.(\d{2}))?\s*(mn|million)?/i);
        if (m) {
            const a = Number(m[1].replace(/[^0-9]/g, ""));
            const a2 = m[2] ? a + Number("0." + m[2]) : a;
            const aMult = m[3] ? 1000000 : 1;
            const b = Number(m[4].replace(/[^0-9]/g, ""));
            const b2 = m[5] ? b + Number("0." + m[5]) : b;
            const bMult = m[6] ? 1000000 : 1;
            min = a2 * aMult;
            max = b2 * bMult;
        }
        const value = basis === "percent" ? pct : money;
        if (value == null)
            continue;
        bands.push({ min, max, basis, value });
    }
    return bands;
}
function computeSpecificity(b) {
    // higher is more specific: narrower ranges rank higher
    const span = (b.max ?? 9e18) - (b.min ?? -9e18);
    // penalize open-ended
    const openPenalty = (b.min == null || b.max == null) ? 1.5 : 1.0;
    return 1 / (span * openPenalty + 1);
}
function normalizeTariffRow(raw) {
    const bank = String(raw.bank ?? raw.Bank ?? "").trim();
    const product = normalizeProductName(String(raw.product ?? raw.Product ?? "").trim());
    const feeTypeRaw = String(raw.feeType ?? raw["Fee Type"] ?? raw.category ?? raw.Category ?? "").trim();
    const description = String(raw.description ?? raw.Description ?? "").trim();
    const amountText = String(raw.amount ?? raw.Amount ?? "").trim();
    const notes = String(raw.notes ?? raw.Notes ?? "").trim();
    const fullText = `${feeTypeRaw} ${description} ${amountText} ${notes}`.trim();
    // Basis detection
    let basis = /actuals?/i.test(fullText) || /as per govt|as per government/i.test(fullText)
        ? "actuals"
        : (firstPercent(fullText) != null ? "percent" : "flat");
    // Values
    let value = basis === "percent" ? firstPercent(fullText) : firstMoney(amountText) ?? firstMoney(description) ?? undefined;
    // Min/Max
    const { min, max } = parseMinMax(fullText);
    // Per-unit
    const { perUnit, countDefault } = parsePerUnit(fullText);
    // Bands/slabs
    const bands = parseBands(fullText);
    // Category mapping
    const feeType = mapCategory(`${feeTypeRaw} ${description}`);
    return {
        bank,
        product,
        feeType,
        feeTypeRaw,
        basis,
        value,
        min,
        max,
        bands: bands.length ? bands : undefined,
        perUnit,
        countDefault,
        description,
        notes,
        source: raw.source || raw.Source,
        updatedAt: raw.updatedAt || raw.UpdatedAt,
    };
}
// Compute applicable amount for a tariff given amount; prefers most specific matching band
function computeTariffAmount(t, loanAmount) {
    let pickedBand;
    if (t.bands && t.bands.length) {
        const candidates = t.bands.filter(b => {
            const minOK = b.min == null || loanAmount >= b.min;
            const maxOK = b.max == null || loanAmount <= b.max;
            return minOK && maxOK;
        });
        candidates.sort((a, b) => computeSpecificity(b) - computeSpecificity(a));
        pickedBand = candidates[0];
    }
    const basis = pickedBand?.basis ?? t.basis;
    const value = pickedBand?.value ?? t.value;
    if (basis === "actuals" || value == null)
        return { computed: undefined, pickedBand, basis };
    let computed = basis === "percent" ? (loanAmount * value) / 100 : value;
    // Clamp
    const min = t.min;
    const max = t.max;
    if (typeof min === "number")
        computed = Math.max(min, computed);
    if (typeof max === "number")
        computed = Math.min(max, computed);
    // Multiply per-unit defaults
    const units = t.perUnit ? (t.countDefault ?? 1) : 1;
    computed *= units;
    return { computed, pickedBand, basis };
}
function pickTariffsForScenario(tariffs, scenario) {
    const bank = scenario.bank.toLowerCase();
    const product = normalizeProductName(scenario.product);
    const amount = scenario.amount;
    // Filter & exclude non-relevant items
    const relevant = tariffs.filter(t => t.bank.toLowerCase().includes(bank) &&
        normalizeProductName(t.product) === product).filter(t => {
        const text = `${t.feeTypeRaw || ""} ${t.description || ""}`.toLowerCase();
        if (/insurance/.test(text))
            return false;
        if (/\brelease\b|part\s*release/.test(text))
            return false;
        // scenario-based exclusions can be added here (e.g., edu local/foreign)
        return true;
    });
    const picked = [];
    const actualsFlags = [];
    let total = 0;
    for (const row of relevant) {
        const { computed, pickedBand, basis } = computeTariffAmount(row, amount);
        if (basis === "actuals") {
            actualsFlags.push(row.feeType);
            picked.push({ cat: row.feeType, row, band: pickedBand, note: "At actuals" });
            continue;
        }
        if (typeof computed === "number" && isFinite(computed)) {
            total += computed;
            picked.push({ cat: row.feeType, row, band: pickedBand, computed });
        }
    }
    return { total, actualsFlags, picked };
}
exports.default = {
    normalizeTariffRow,
    pickTariffsForScenario,
};
//# sourceMappingURL=normalize.js.map