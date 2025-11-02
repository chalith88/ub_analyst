import { chromium, Browser, Page, ElementHandle } from "playwright";
import fs from "fs/promises";
import path from "path";

const BANK = "Bank of Ceylon";
const SEED = "https://www.boc.lk/rates-tariff";
const OUT_DIR = path.join(process.cwd(), "output");
const OUT_FILE = path.join(OUT_DIR, "boc.json");

type Opts = { show?: string; slow?: string; save?: string };

export type TariffRow = {
  bank: string;
  product: "Home Loan" | "LAP" | "Personal Loan" | "Education Loan";
  feeCategory: string;
  description?: string;
  amount: string;
  updatedAt: string;
  source: string;
  notes?: string;
};

const nowISO = () => new Date().toISOString();

async function acceptCookies(page: Page, log: (s: string) => void) {
  try {
    await page.addInitScript(() => { try { localStorage.setItem("cookiePopupHidden","true"); } catch {} });
    await page.evaluate(() => {
      try { localStorage.setItem("cookiePopupHidden","true"); } catch {}
      const removeSel = [".cookies-popup", ".cookie-banner", ".cookie-consent"];
      removeSel.forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
    });

    const clicks = ["button.btn-accept",".cookie-accept",".cc-allow","#acceptCookies",".cookies-popup button"];
    for (const sel of clicks) {
      const el = await page.$(sel);
      if (el) { await el.click().catch(()=>{}); log(`cookie: clicked ${sel}`); return; }
    }
    log("cookie: removed via JS (no visible button)");
  } catch (e) {
    log(`cookie: error ${String(e)}`);
  }
}

async function ensureExpandedAndWaitTable(wrapper: ElementHandle<Element>, page: Page, log: (s: string) => void) {
  const hasTable = await wrapper.$("table.ck-table-resized");
  if (hasTable) return;

  const btn = await wrapper.$(".show-more-block .show-read-more");
  if (btn) {
    await btn.evaluate((b: any) => b.scrollIntoView({ block: "center" }));
    await btn.click({ force: true });
    log("nav: clicked 'Read More' inside Credit Operations wrapper");
    await page.waitForSelector("table.ck-table-resized", { state: "visible", timeout: 20000 });
  } else {
    log("nav: no .show-read-more button found under Credit Operations wrapper (maybe already open)");
  }
}

const EXCLUDE_INTEREST_RE = /interest rate|AWPLR|SLFR|APR|EIR|% p\.a\.|prime rate|base rate|annual interest/i;

const EXCLUDE_SECTION_RE =
  /(temporary overdrafts?|TOD|leasing|guarantee|stand ?by|credit line letters?|crib|sms alerts|fund transfers?|standing orders?|pay orders?|safe deposit|utility bill|collection accounts|treasury bills?|bonds?|repo|locker)/i;

function clean(s: string) {
  return (s || "").replace(/\s+/g, " ").replace(/\r?\n|\r/g, " ").trim();
}

function detectProduct(section: string, desc: string): TariffRow["product"] | undefined {
  const hay = `${section} • ${desc}`;
  if (/housing loans?/i.test(hay) || /BOC Housing Loans/i.test(hay)) return "Home Loan";
  if (/mortgage\s+over\s+immovable\s+property/i.test(hay)
      || /loan against property/i.test(hay)
      || /property\s*secured/i.test(hay)) return "LAP";
  if (/\bBOC\s+Personal\s+Loans?\b/i.test(hay)
      || /\bPersonal Loans?\b/i.test(hay)
      || /Pensioners' Loans/i.test(hay)) return "Personal Loan";
  if (/education|student/i.test(hay)) return "Education Loan";
  return undefined;
}

function detectFeeCategory(desc: string): string {
  if (/valuation/i.test(desc)) return "Valuation";
  if (/early\s*settlement|full\s*settlement|part\s*settlement/i.test(desc)) return "Early Settlement";
  if (/legal/i.test(desc)) return "Legal";
  if (/penal/i.test(desc)) return "Penal";
  if (/documentation|processing|service charge|application/i.test(desc)) return "Processing Fee";
  if (/inspection/i.test(desc)) return "Other";
  return "Processing Fee";
}

export async function scrapeBocTariff(opts: Opts = {}) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const logs: string[] = [];
  const log = (s: string) => {
    const stamp = new Date().toISOString().replace("T"," ").replace("Z","");
    logs.push(`[${stamp}] ${s}`);
    if (opts.show === "true") console.log(s);
  };

  let browser: Browser | undefined;
  let rows: TariffRow[] = [];

  try {
    browser = await chromium.launch({ headless: opts.show !== "true" });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

    log(`start: ${SEED}`);
    await page.goto(SEED, { waitUntil: "domcontentloaded" });
    await acceptCookies(page, log);

    const headers = await page.$$("h3.sub-title");
    let opened = false;

    for (const h3 of headers) {
      const productTitle = clean((await h3.textContent()) || "");
      if (!/credit operations/i.test(productTitle)) continue;

      const wrapper = await h3.evaluateHandle((el) => {
        let n = el.nextElementSibling;
        if (n && n.tagName === "H4") n = n.nextElementSibling as Element | null;
        return n as Element | null;
      });

      if (!wrapper) { log("nav: Credit Operations wrapper not found"); break; }

      await ensureExpandedAndWaitTable(wrapper, page, log);
      opened = true;

      const tableRows: string[][] = await (wrapper as ElementHandle<Element>).$$eval(
        "table.ck-table-resized tbody tr",
        (trs) => trs.map(tr => {
          const tds = Array.from(tr.querySelectorAll("td"));
          return tds.map(td => (td.innerText || td.textContent || "").replace(/\s+/g," ").trim());
        })
      );

      let currentSubHeader = "";

      for (const cells of tableRows) {
        if (!cells.length) continue;

        if ((cells.length === 1 || (cells.length === 2 && !cells[1])) && cells[0]) {
          currentSubHeader = clean(cells[0]);
          continue;
        }

        const desc = clean(cells[0] || "");
        const amt  = clean(cells[1] || "");

        if (!desc || !amt) continue;
        if (!/\d|%/.test(amt)) continue;
        if (EXCLUDE_INTEREST_RE.test(`${desc} ${amt}`)) continue;

        // ---- SPECIAL: Split Mortgage over Immovable Property for Personal & Business ----
        if (
          /Mortgage over Immovable Property/i.test(desc) &&
          /Personal Customers/i.test(desc) &&
          /Business Customers/i.test(desc) &&
          /0\.8%.*Rs\.\d+.*0\.8%.*Rs\.\d+/i.test(amt)
        ) {
          // Extract two amount lines (handles any delimiter or merged line)
          const amtMatch = amt.match(/(0\.8%[^0-9]*Rs\.[^0]+Max\.\s*Rs\.\s*\d+\/-)[^0-9]*(0\.8%[^0-9]*Rs\.[^0]+Max\.\s*Rs\.\s*\d+\/-)/i);
          let amtLines: string[] = [];
          if (amtMatch) {
            amtLines = [clean(amtMatch[1]), clean(amtMatch[2])];
          } else {
            amtLines = amt.split(/0\.8%/).map(s => s ? "0.8%" + s : "").map(clean).filter(Boolean);
          }
          rows.push({
            bank: BANK,
            product: "LAP",
            feeCategory: "Processing Fee",
            description: "Mortgage over Immovable Property - Personal Customers",
            amount: amtLines[0] || "",
            updatedAt: nowISO(),
            source: `${SEED}#general-tariff`
          });
          rows.push({
            bank: BANK,
            product: "LAP",
            feeCategory: "Processing Fee",
            description: "Mortgage over Immovable Property - Business Customers",
            amount: amtLines[1] || "",
            updatedAt: nowISO(),
            source: `${SEED}#general-tariff`
          });
          continue;
        }

        // ---- SPECIAL: Fan out Early Settlement block to all products ----
        if (
          /early settlement/i.test(currentSubHeader) &&
          /BOC Personal Loans.*BOC Housing Loans.*Gov Pensioners.*Loan/i.test(currentSubHeader)
        ) {
          const fanProducts: TariffRow["product"][] = ["Home Loan", "LAP", "Personal Loan", "Education Loan"];
          for (const prod of fanProducts) {
            rows.push({
              bank: BANK,
              product: prod,
              feeCategory: "Early Settlement",
              description: desc,
              amount: amt,
              updatedAt: nowISO(),
              source: `${SEED}#general-tariff`,
            });
          }
          continue;
        }

        if (EXCLUDE_SECTION_RE.test(currentSubHeader) || EXCLUDE_SECTION_RE.test(desc)) {
          continue;
        }

        const product = detectProduct(currentSubHeader, desc);
        if (!product) continue;

        const feeCategory = detectFeeCategory(desc);

        rows.push({
          bank: BANK,
          product,
          feeCategory,
          description: desc,
          amount: amt,
          updatedAt: nowISO(),
          source: `${SEED}#general-tariff`,
        });
      }
      break; // Only the first "Credit Operations" block
    }

    if (!opened) log("nav: Credit Operations not opened (heading not found?)");
    log(`done: ${rows.length} fee rows`);
  } catch (e) {
    log(`error: ${String(e)}`);
  } finally {
    if (browser) await browser.close().catch(()=>{});
  }

  if (opts.save === "true" || typeof opts.save === "undefined") {
    try {
      await fs.writeFile(OUT_FILE, JSON.stringify(rows, null, 2), "utf8");
      log(`save: ${OUT_FILE}`);
    } catch (e) {
      log(`save: failed → ${String(e)}`);
    }
  }

  return {
    bank: BANK,
    usedPdf: false,
    pdfUrl: null,
    count: rows.length,
    outFile: OUT_FILE,
    ocrFile: null,
    logs,
    rows,
  };
}
