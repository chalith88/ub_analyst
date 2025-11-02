"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const jsdom_1 = require("jsdom");
const fast_xml_parser_1 = require("fast-xml-parser");
const hnb_1 = require("./scrapers/hnb");
const seylan_1 = require("./scrapers/seylan");
const sampath_1 = require("./scrapers/sampath"); // PDF parser
const combank_1 = require("./scrapers/combank");
const ndb_1 = require("./scrapers/ndb");
const unionb_1 = require("./scrapers/unionb");
const peoples_1 = require("./scrapers/peoples");
const dfcc_1 = require("./scrapers/dfcc");
const nsb_1 = require("./scrapers/nsb");
const boc_1 = require("./scrapers/boc");
const cargills_1 = require("./scrapers/cargills");
const ntb_1 = require("./scrapers/ntb");
const amana_1 = require("./scrapers/amana");
const cbsl_1 = require("./scrapers/cbsl");
const hnb_tariff_1 = require("./scrapers/hnb-tariff");
const seylan_tariff_1 = require("./scrapers/seylan-tariff");
const sampath_tariff_1 = require("./scrapers/sampath-tariff");
const combank_tariff_1 = require("./scrapers/combank_tariff");
const ndb_tariff_1 = require("./scrapers/ndb-tariff");
const unionb_tariff_1 = require("./scrapers/unionb-tariff");
const dfcc_tariff_1 = require("./scrapers/dfcc-tariff");
const nsb_tariff_1 = require("./scrapers/nsb-tariff");
const boc_tariff_1 = require("./scrapers/boc-tariff");
const cargills_tariff_1 = require("./scrapers/cargills-tariff");
const ntb_tariff_1 = require("./scrapers/ntb-tariff");
const amana_tariff_1 = require("./scrapers/amana-tariff");
const peoples_tariff_1 = require("./scrapers/peoples-tariff");
const app = (0, express_1.default)();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.use((0, cors_1.default)({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
const ensureOutputDir = async () => {
    const outDir = path_1.default.join(process.cwd(), "output");
    await promises_1.default.mkdir(outDir, { recursive: true });
    return outDir;
};
/** The same keys you used for individual tariff endpoints */
const TARIFF_SCRAPER_KEYS = [
    "hnb-tariff", "seylan-tariff", "sampath-tariff", "combank-tariff",
    "ndb-tariff", "unionb-tariff", "dfcc-tariff", "nsb-tariff",
    "boc-tariff", "cargills-tariff", "ntb-tariff", "amana-tariff", "peoples-tariff",
];
/** Safe array coerce */
function arr(x) {
    if (Array.isArray(x))
        return x;
    if (x?.rows && Array.isArray(x.rows))
        return x.rows;
    if (x?.data && Array.isArray(x.data))
        return x.data;
    return [];
}
/** Merge tariffs: replace by (bank, product, feeType) — latest row wins */
function mergeTariffsByKey(existing, incoming) {
    const map = new Map();
    for (const r of existing) {
        const k = `${r.bank}||${r.product}||${r.feeType}`.toLowerCase();
        map.set(k, r);
    }
    for (const r of incoming) {
        const k = `${r.bank}||${r.product}||${r.feeType}`.toLowerCase();
        map.set(k, r);
    }
    return [...map.values()];
}
app.get("/", (_req, res) => {
    res.type("text/plain").send([
        "UB Scraper API",
        "",
        `HNB                : http://localhost:${PORT}/scrape/hnb?show=true&slow=200`,
        `Seylan             : http://localhost:${PORT}/scrape/seylan?show=true&slow=200`,
        `Sampath            : http://localhost:${PORT}/scrape/sampath?show=true`,
        `ComBank            : http://localhost:${PORT}/scrape/combank?show=true&slow=200`,
        `NDB                : http://localhost:${PORT}/scrape/ndb?show=true&slow=200`,
        `UnionBank          : http://localhost:${PORT}/scrape/unionb?show=true&slow=200`,
        `Peoples            : http://localhost:${PORT}/scrape/peoples?show=true&slow=200`,
        `DFCC               : http://localhost:${PORT}/scrape/dfcc?show=true&slow=200`,
        `NSB                : http://localhost:${PORT}/scrape/nsb?show=true&slow=200`,
        `BOC                : http://localhost:${PORT}/scrape/boc?show=true&slow=200`,
        `Cargills           : http://localhost:${PORT}/scrape/cargills?show=true&slow=200`,
        `NTB                : http://localhost:${PORT}/scrape/ntb`,
        `Amana              : http://localhost:${PORT}/scrape/amana`,
        `CBSL               : http://localhost:${PORT}/scrape/cbsl`,
        `HNB Tariff         : http://localhost:${PORT}/scrape/hnb-tariff?show=true&slow=200`,
        `Seylan Tariff      : http://localhost:${PORT}/scrape/seylan-tariff?show=true&slow=200`,
        `Sampath Tariff     : http://localhost:${PORT}/scrape/sampath-tariff?show=true&slow=200`,
        `ComBank Tariff     : http://localhost:${PORT}/scrape/combank_tariff?show=true&slow=200`,
        `NDB Tariff         : http://localhost:${PORT}/scrape/ndb-tariff?show=true&slow=200`,
        `UnionBank Tariff   : http://localhost:${PORT}/scrape/unionb-tariff?show=true&slow=200`,
        `DFCC Tariff        : http://localhost:${PORT}/scrape/dfcc-tariff?show=true&slow=200`,
        `NSB Tariff         : http://localhost:${PORT}/scrape/nsb-tariff?show=true&slow=200`,
        `BOC Tariff         : http://localhost:${PORT}/scrape/boc-tariff?show=true&slow=200`,
        `Cargills Tariff    : http://localhost:${PORT}/scrape/cargills-tariff?show=true&slow=200`,
        `NTB Tariff         : http://localhost:${PORT}/scrape/ntb-tariff?show=true&slow=200`,
        `Amana Tariff       : http://localhost:${PORT}/scrape/amana-tariff?show=true&slow=200`,
        `Peoples Tariff     : http://localhost:${PORT}/scrape/peoples-tariff?show=true&slow=200`,
        `ALL                : http://localhost:${PORT}/scrape/all?show=true&slow=200`,
        `Tariff ALL         : http://localhost:${PORT}/scrape/tariffs-all?show=true&slow=200`,
        "",
        "Query params:",
        "  show=true|false   -> inline JSON / open Chromium (Playwright)",
        "  slow=0|200|500    -> slowMo ms between actions",
        "  save=true         -> also write JSON to /output/<bank>.json",
    ].join("\n"));
});
app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
});
async function maybeSave(bank, data, save) {
    if (!save)
        return;
    const outDir = await ensureOutputDir();
    const file = path_1.default.join(outDir, `${bank.toLowerCase().replace(/\s+/g, "-")}.json`);
    await promises_1.default.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}
/* ---------------- Industry news aggregator ---------------- */
const NEWS_TTL_MS = 10 * 60 * 1000;
const NEWS_USER_AGENT = "Mozilla/5.0 (compatible; UBAnalyst/1.0; +https://www.unionb.com/)";
const xmlParser = new fast_xml_parser_1.XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const GOOGLE_NEWS_QUERIES = [
    {
        source: "Google News – Banking",
        topics: ["Banking & Finance"],
        url: "https://news.google.com/rss/search?q=Sri%20Lanka%20banking&hl=en-US&gl=US&ceid=US:en",
    },
    {
        source: "Google News – Real Estate",
        topics: ["Real Estate"],
        url: "https://news.google.com/rss/search?q=Sri%20Lanka%20real%20estate&hl=en-US&gl=US&ceid=US:en",
    },
];
const RSS_FEEDS = [
    {
        source: "EconomyNext",
        url: "https://economynext.com/feed/",
    },
    {
        source: "Lanka Business Online",
        url: "https://www.lankabusinessonline.com/feed/",
    },
];
const CBSL_PRESS_URL = "https://www.cbsl.gov.lk/en/press/press-releases";
const TOPIC_MATCHERS = [
    {
        label: "Banking & Finance",
        patterns: [/bank/i, /finance/i, /financial/i, /loan/i, /lending/i, /credit/i, /deposit/i, /interest rate/i, /branch/i],
    },
    {
        label: "Real Estate",
        patterns: [/real estate/i, /property/i, /housing/i, /condominium/i, /apartment/i, /land/i, /construction/i],
    },
    {
        label: "Policy & Regulation",
        patterns: [/central bank/i, /cbsl/i, /monetary policy/i, /directive/i, /regulation/i, /policy/i, /governor/i],
    },
    {
        label: "Economy & Markets",
        patterns: [/economy/i, /economic/i, /market/i, /inflation/i, /growth/i, /investment/i, /gdp/i],
    },
];
let newsCache = null;
function stripHtml(html) {
    if (!html)
        return "";
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function summarise(text, max = 260) {
    const trimmed = text.trim();
    if (!trimmed)
        return "";
    if (trimmed.length <= max)
        return trimmed;
    return `${trimmed.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
function resolveUrl(candidate, base) {
    if (!candidate)
        return undefined;
    try {
        if (candidate.startsWith("http://") || candidate.startsWith("https://"))
            return candidate;
        if (base)
            return new URL(candidate, base).href;
    }
    catch {
        // ignore resolution errors
    }
    return candidate;
}
function deriveTopics(text, hints = []) {
    const lowered = text.toLowerCase();
    const topics = new Set();
    for (const matcher of TOPIC_MATCHERS) {
        if (matcher.patterns.some((re) => re.test(lowered))) {
            topics.add(matcher.label);
        }
    }
    for (const hint of hints) {
        if (hint)
            topics.add(hint);
    }
    return Array.from(topics);
}
function toIsoDate(value) {
    if (!value)
        return "";
    const ts = Date.parse(value);
    if (!Number.isNaN(ts))
        return new Date(ts).toISOString();
    return "";
}
function dedupeByTitle(items) {
    const seen = new Map();
    for (const item of items) {
        const key = item.title.toLowerCase();
        if (!seen.has(key)) {
            seen.set(key, item);
        }
    }
    return Array.from(seen.values());
}
async function fetchRssFeed(source, url, hints = [], maxItems = 25) {
    try {
        const res = await (0, node_fetch_1.default)(url, {
            headers: {
                "User-Agent": NEWS_USER_AGENT,
                Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
            },
        });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const parsed = xmlParser.parse(xml);
        const rawItems = parsed?.rss?.channel?.item;
        const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
        const articles = [];
        for (const raw of list.slice(0, maxItems)) {
            const title = raw?.title?.trim?.() || "";
            const link = raw?.link || "";
            if (!title || !link)
                continue;
            const html = (typeof raw["content:encoded"] === "string" ? raw["content:encoded"] : "") ||
                (typeof raw.description === "string" ? raw.description : "");
            const summary = summarise(stripHtml(html));
            const combined = `${title} ${summary}`;
            const topics = deriveTopics(combined, hints);
            if (!topics.length)
                continue;
            const publishedAt = toIsoDate(typeof raw.pubDate === "string" ? raw.pubDate : undefined) || new Date().toISOString();
            const image = (() => {
                const match = typeof html === "string" ? html.match(/<img[^>]+src=["']([^"']+)["']/i) : null;
                if (match?.[1])
                    return resolveUrl(match[1], link);
                const findMediaUrl = (value) => {
                    if (!value)
                        return undefined;
                    if (typeof value === "string")
                        return value;
                    if (Array.isArray(value)) {
                        for (const v of value) {
                            const found = findMediaUrl(v);
                            if (found)
                                return found;
                        }
                        return undefined;
                    }
                    if (typeof value === "object") {
                        if (typeof value.url === "string")
                            return value.url;
                        if (typeof value.href === "string")
                            return value.href;
                        if (value.$ && typeof value.$.url === "string")
                            return value.$.url;
                    }
                    return undefined;
                };
                const mediaUrl = findMediaUrl(raw?.["media:content"]) ||
                    findMediaUrl(raw?.["media:group"]?.["media:content"]) ||
                    findMediaUrl(raw?.["media:thumbnail"]) ||
                    findMediaUrl(raw?.enclosure);
                return resolveUrl(mediaUrl, link);
            })();
            const id = Buffer.from(`${source}:${link}`).toString("base64").replace(/=+$/, "");
            articles.push({
                id,
                title,
                summary: summary || title,
                link,
                source,
                publishedAt,
                topics,
                origin: source,
                image,
            });
        }
        return articles;
    }
    catch (err) {
        console.error(`[news] Failed RSS for ${source}:`, err);
        return [];
    }
}
async function fetchGoogleNewsFeed(entry) {
    return fetchRssFeed(entry.source, entry.url, entry.topics, 40);
}
async function fetchCbslPressReleases() {
    try {
        const res = await (0, node_fetch_1.default)(CBSL_PRESS_URL, {
            headers: {
                "User-Agent": NEWS_USER_AGENT,
                Accept: "text/html,application/xhtml+xml",
            },
        });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const dom = new jsdom_1.JSDOM(html);
        const doc = dom.window.document;
        const rows = Array.from(doc.querySelectorAll(".item-list li.views-row")).slice(0, 8);
        const items = [];
        for (const row of rows) {
            const anchor = row.querySelector(".views-field-field-file-title a");
            if (!anchor)
                continue;
            const href = anchor.href.startsWith("http") ? anchor.href : new URL(anchor.href, CBSL_PRESS_URL).href;
            const title = anchor.textContent?.trim() || "CBSL Press Release";
            const dateMatch = href.match(/press_(\d{4})(\d{2})(\d{2})/i);
            const publishedAt = dateMatch
                ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T06:00:00Z`).toISOString()
                : new Date().toISOString();
            const summary = `Central Bank update: ${title}`;
            const id = Buffer.from(`CBSL:${href}`).toString("base64").replace(/=+$/, "");
            items.push({
                id,
                title,
                summary,
                link: href,
                source: "CBSL Press Releases",
                publishedAt,
                topics: ["Policy & Regulation", "Banking & Finance"],
                origin: "CBSL",
            });
        }
        return items;
    }
    catch (err) {
        console.error("[news] Failed to fetch CBSL press releases:", err);
        return [];
    }
}
async function loadNews(force = false) {
    const now = Date.now();
    if (!force && newsCache && newsCache.expires > now) {
        return newsCache;
    }
    const results = await Promise.all([
        fetchCbslPressReleases(),
        ...RSS_FEEDS.map((feed) => fetchRssFeed(feed.source, feed.url, [])),
        ...GOOGLE_NEWS_QUERIES.map((entry) => fetchGoogleNewsFeed(entry)),
    ]);
    const [cbsl, ...others] = results;
    const combined = dedupeByTitle([
        ...(cbsl ?? []),
        ...others.flat(),
    ]);
    combined.sort((a, b) => {
        const at = Date.parse(a.publishedAt || "") || 0;
        const bt = Date.parse(b.publishedAt || "") || 0;
        return bt - at;
    });
    const sources = Array.from(new Set(combined.map((item) => item.source))).sort();
    newsCache = {
        items: combined,
        fetchedAt: new Date().toISOString(),
        expires: now + NEWS_TTL_MS,
        sources,
    };
    return newsCache;
}
app.get("/api/news", async (req, res) => {
    try {
        const force = req.query.refresh === "true";
        const limit = Number(req.query.limit ?? 0) || 0;
        const cache = await loadNews(force);
        const items = limit > 0 ? cache.items.slice(0, limit) : cache.items;
        res.json({
            updatedAt: cache.fetchedAt,
            count: items.length,
            sources: cache.sources,
            items,
        });
    }
    catch (err) {
        console.error("[news] failed to respond:", err);
        res.status(500).json({
            error: "Failed to load news feed",
            detail: err?.message ?? String(err),
        });
    }
});
/* ---------------- Sampath PDF helper ---------------- */
async function handlePdfScrape(req, res, scraper, pdfUrl, outFile, bankName) {
    try {
        const outDir = await ensureOutputDir();
        const outPath = path_1.default.join(outDir, outFile);
        const rows = await scraper(pdfUrl, outPath);
        if (req.query.show === "true")
            res.json(rows);
        else
            res.type("json").send(await promises_1.default.readFile(outPath, "utf8"));
    }
    catch (err) {
        console.error(`Error scraping ${bankName}:`, err);
        res.status(500).send({ error: String(err) });
    }
}
/* ---------------- Individual routes (unchanged) ---------------- */
// HNB, Seylan, Sampath, ComBank, NDB, UnionBank, Peoples, DFCC, NSB, BOC, Cargills, NTB, Amana
// ... (same as in previous merged file)
app.get("/scrape/hnb", async (req, res) => {
    try {
        const data = await (0, hnb_1.scrapeHNB)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        await maybeSave("HNB", data, req.query.save === "true");
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/scrape/seylan", async (req, res) => {
    try {
        const data = await (0, seylan_1.scrapeSeylan)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        await maybeSave("Seylan", data, req.query.save === "true");
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/scrape/sampath", (req, res) => handlePdfScrape(req, res, sampath_1.scrapeSampath, "https://www.sampath.lk/common/loan/interest-rates-loan-and-advances.pdf", "sampath.json", "Sampath"));
app.get("/scrape/combank", async (req, res) => {
    try {
        const data = await (0, combank_1.scrapeCombank)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        await maybeSave("ComBank", data, req.query.save === "true");
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/scrape/ndb", async (req, res) => {
    try {
        const data = await (0, ndb_1.scrapeNDB)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        await maybeSave("NDB", data, req.query.save === "true");
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/scrape/unionb", async (req, res) => {
    try {
        const data = await (0, unionb_1.scrapeUnionBank)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        await maybeSave("UnionBank", data, req.query.save === "true");
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/scrape/peoples", async (req, res) => {
    const data = await (0, peoples_1.scrapePeoples)("show" in req.query, req.query.slow ? Number(req.query.slow) : 0);
    res.json(data);
});
app.get("/scrape/dfcc", async (req, res) => {
    try {
        const data = await (0, dfcc_1.scrapeDFCC)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        await maybeSave("DFCC", data, req.query.save === "true");
        res.json(data);
    }
    catch (err) {
        res.status(500).send({ error: String(err) });
    }
});
app.get("/scrape/nsb", async (req, res) => {
    try {
        const data = await (0, nsb_1.scrapeNSB)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        await maybeSave("NSB", data, req.query.save === "true");
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
app.get("/scrape/boc", async (req, res) => {
    try {
        const data = await (0, boc_1.scrapeBOC)(req.query);
        await maybeSave("BOC", data, req.query.save === "true");
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: String(err?.message || err) });
    }
});
app.get("/scrape/cargills", async (req, res) => {
    try {
        const data = await (0, cargills_1.scrapeCargills)({
            show: req.query.show || "false",
            slow: req.query.slow || "0",
            save: req.query.save || "false",
        });
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
    }
});
app.get("/scrape/ntb", async (_req, res) => {
    try {
        res.json(await (0, ntb_1.scrapeNTB)());
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get("/scrape/amana", async (_req, res) => {
    try {
        res.json(await (0, amana_1.scrapeAmana)());
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/** CBSL AWPR monthly series */
app.get("/scrape/cbsl", async (req, res) => {
    try {
        const rows = await (0, cbsl_1.scrapeCBSL)({
            show: String(req.query.show),
            slow: String(req.query.slow),
            save: String(req.query.save),
        });
        res.json(rows);
    }
    catch (err) {
        console.error("CBSL scrape failed", err);
        res.status(500).json({ error: String(err?.message || err) });
    }
});
/** HNB-Tariff */
app.get("/scrape/hnb-tariff", async (req, res) => {
    try {
        const data = await (0, hnb_tariff_1.scrapeHnbTariff)({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/** Seylan-Tariff */
app.get("/scrape/seylan-tariff", async (req, res) => {
    try {
        const data = await (0, seylan_tariff_1.scrapeSeylanTariff)({
            show: req.query.show === "true",
            slow: Number(req.query.slow || 0)
        });
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/** Sampath-Tariff */
app.get("/scrape/sampath-tariff", async (req, res) => {
    try {
        const data = await (0, sampath_tariff_1.scrapeSampathTariff)();
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/** NDB-Tariff */
app.get("/scrape/ndb-tariff", async (req, res) => {
    try {
        const data = await (0, ndb_tariff_1.scrapeNdbTariff)({
            show: req.query.show === "true",
            slow: Number(req.query.slow || 0),
        });
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/** ComBank_Tariff */
app.get("/scrape/combank_tariff", async (req, res) => {
    try {
        const data = await (0, combank_tariff_1.scrapeCombankTariff)();
        res.json(data);
    }
    catch (e) {
        console.error("Combank Tariff Scraper Error:", e);
        res.status(500).json({ error: "Failed to scrape Combank tariffs" });
    }
});
/** UnionBank-Tariff */
app.get("/scrape/unionb-tariff", async (_req, res) => {
    try {
        const data = await (0, unionb_tariff_1.scrapeUnionbTariff)();
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to scrape Union Bank tariff", detail: err.message || String(err) });
    }
});
/** DFCC-Tariff */
app.get("/scrape/dfcc-tariff", async (req, res) => {
    try {
        const data = await (0, dfcc_tariff_1.scrapeDfccTariff)();
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: String(e) });
    }
});
/** NSB-Tariff */
app.get("/scrape/nsb-tariff", async (req, res) => {
    try {
        const result = await (0, nsb_tariff_1.scrapeNSBTariff)();
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e + "" });
    }
});
/** BOC-Tariff */
app.get("/scrape/boc-tariff", async (req, res) => {
    try {
        const data = await (0, boc_tariff_1.scrapeBocTariff)({
            show: String(req.query.show || ""),
            slow: String(req.query.slow || ""),
            save: String(req.query.save || "true"),
        });
        // optional: reuse your maybeSave helper if desired
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: String(err?.message || err) });
    }
});
// Cargills Tariff (fees/charges)
app.get("/scrape/cargills-tariff", async (req, res) => {
    try {
        const rows = await (0, cargills_tariff_1.scrapeCargillsTariff)({ show: String(req.query.show || ""), slow: String(req.query.slow || ""), save: String(req.query.save || "") });
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
// NTB Tariff (fees/charges)
app.get("/scrape/ntb-tariff", async (req, res) => {
    try {
        const rows = await (0, ntb_tariff_1.scrapeNtbTariff)({
            show: String(req.query.show || ""),
            slow: String(req.query.slow || ""),
            save: String(req.query.save || "")
        });
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
/** Amana-Tariff (OCR lines first pass) */
app.get("/scrape/amana-tariff", async (req, res) => {
    try {
        const rows = await (0, amana_tariff_1.scrapeAmanaTariff)({
            show: String(req.query.show || ""),
            slow: String(req.query.slow || ""),
            save: String(req.query.save || "")
        });
        res.json(rows);
    }
    catch (err) {
        console.error("Amana Tariff scrape failed:", err);
        res.status(500).json({ error: err?.message || String(err) });
    }
});
/** Peoples-Tariff (OCR lines first pass) */
app.get("/scrape/peoples-tariff", async (req, res) => {
    try {
        const rows = await (0, peoples_tariff_1.scrapePeoplesTariff)({
            show: String(req.query.show || ""),
            slow: String(req.query.slow || ""),
            save: String(req.query.save || ""),
        });
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
/* ---------------- ALL route ---------------- */
app.get("/scrape/all", async (req, res) => {
    const show = req.query.show === "true";
    const slow = Number(req.query.slow || 0) || (show ? 200 : 0);
    const save = req.query.save === "true";
    const startedAt = new Date().toISOString();
    const jobs = {
        HNB: () => (0, hnb_1.scrapeHNB)({ show, slow }),
        Seylan: () => (0, seylan_1.scrapeSeylan)({ show, slow }),
        Sampath: async () => {
            const outDir = await ensureOutputDir();
            const outPath = path_1.default.join(outDir, "sampath.json");
            return (0, sampath_1.scrapeSampath)("https://www.sampath.lk/common/loan/interest-rates-loan-and-advances.pdf", outPath);
        },
        ComBank: () => (0, combank_1.scrapeCombank)({ show, slow }),
        NDB: () => (0, ndb_1.scrapeNDB)({ show, slow }),
        UnionBank: () => (0, unionb_1.scrapeUnionBank)({ show, slow }),
        Peoples: () => (0, peoples_1.scrapePeoples)(show, slow),
        DFCC: () => (0, dfcc_1.scrapeDFCC)({ show, slow }),
        NSB: () => (0, nsb_1.scrapeNSB)({ show, slow }),
        BOC: () => (0, boc_1.scrapeBOC)({ show: String(show), slow: String(slow), save: "false" }),
        Cargills: () => (0, cargills_1.scrapeCargills)({ show: String(show), slow: String(slow), save: "false" }),
        NTB: () => (0, ntb_1.scrapeNTB)(),
        Amana: () => (0, amana_1.scrapeAmana)(),
    };
    const results = [];
    const status = {};
    const entries = Object.entries(jobs);
    const settled = await Promise.allSettled(entries.map(([_, fn]) => fn()));
    for (let i = 0; i < settled.length; i++) {
        const bank = entries[i][0];
        const r = settled[i];
        if (r.status === "fulfilled") {
            const rows = r.value ?? [];
            status[bank] = { ok: true, count: rows.length };
            results.push(...rows);
            if (save)
                await maybeSave(bank, rows, true);
        }
        else {
            status[bank] = { ok: false, error: String(r.reason) };
        }
    }
    const payload = {
        startedAt,
        finishedAt: new Date().toISOString(),
        status,
        total: results.length,
        rows: results,
    };
    if (save) {
        const outDir = await ensureOutputDir();
        await promises_1.default.writeFile(path_1.default.join(outDir, "all.json"), JSON.stringify(payload, null, 2), "utf8");
    }
    res.json(payload);
});
/**
 * GET /scrape/tariffs-all
 * Runs all *-tariff endpoints sequentially and returns a single JSON object:
 * { rows: TariffRow[], stats: { [bankKey]: { count: number, error?: string } } }
 *
 * Optional passthrough query params:
 *   - show=true    (kept so your individual endpoints don't persist)
 *   - slow=###     (forwarded to scrapers that support throttling)
 */
app.get("/scrape/tariffs-all", async (req, res) => {
    try {
        const show = req.query.show === "true" ? "true" : "true"; // default to show=true
        const slow = typeof req.query.slow === "string" ? req.query.slow : undefined;
        // Build base pointing to THIS server (so we reuse existing *-tariff endpoints)
        const base = `${req.protocol}://${req.get("host")}`;
        const qs = (key) => {
            const params = new URLSearchParams({ show });
            if (slow)
                params.set("slow", slow);
            return `${base}/scrape/${key}?${params.toString()}`;
        };
        const allRows = [];
        const stats = {};
        for (const key of TARIFF_SCRAPER_KEYS) {
            let error;
            let rows = [];
            try {
                const url = qs(key);
                const rsp = await (0, node_fetch_1.default)(url, { cache: "no-store" });
                if (!rsp.ok)
                    throw new Error(`${rsp.status} ${rsp.statusText}`);
                const data = await rsp.json();
                rows = arr(data);
            }
            catch (e) {
                error = e?.message || String(e);
            }
            stats[key] = { count: rows.length, ...(error ? { error } : {}) };
            if (rows.length) {
                // normalize minimal fields just in case, then merge
                const normalized = rows.map((r) => ({
                    bank: r.bank,
                    product: r.product,
                    feeType: r.feeType,
                    feeCategory: r.feeCategory || r.feeType, // ← add readable category
                    basis: r.basis,
                    value: typeof r.value === "number" ? r.value : undefined,
                    min: typeof r.min === "number" ? r.min : undefined,
                    max: typeof r.max === "number" ? r.max : undefined,
                    amount: r.amount || r.value || null, // ← add computed / text amount
                    notes: r.notes || r.note || "", // ← ensure notes always exist
                    effectiveDate: r.effectiveDate || null,
                    updatedAt: r.updatedAt || new Date().toISOString(),
                    source: r.source,
                    description: r.description || "",
                }));
                const merged = mergeTariffsByKey(allRows, normalized);
                allRows.length = 0;
                allRows.push(...merged);
            }
        }
        res.json({ rows: allRows, stats, updatedAt: new Date().toISOString() });
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
    console.log(`??? UB Scraper API running at http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map