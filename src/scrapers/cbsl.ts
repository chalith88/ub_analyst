// src/scrapers/cbsl.ts
import { chromium, Browser, Page } from "playwright";
import fs from "fs/promises";
import path from "path";

type Opts = { show?: string; slow?: string; save?: string; preferDirect?: string };
type Row = {
  period: string;      // "YYYY-MM"
  weekEnd: string;     // effective weekly date used
  metric: string;      // "AWPR (6 months)"
  rate: string;        // e.g., "8.27"
  source: string;      // landing URL
  updatedAt: string;   // ISO timestamp
};

const GOOGLE = "https://www.google.com/";
const CBSL_REPORT = "https://www.cbsl.lk/eResearch/MoneyMarketRatesDefault.aspx?ReportId=6277";
const nowISO = () => new Date().toISOString();

function lastDayOfCurrentMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const mm = String(last.getMonth() + 1).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${last.getFullYear()}-${mm}-${dd}`;
}

function parseNum(txt?: string | null): string | undefined {
  if (!txt) return undefined;
  const t = txt.replace(/\s+/g, " ").trim();
  const m = t.match(/^-?\d+(?:\.\d+)?$/);
  return m ? m[0] : undefined;
}

async function tryGoogleThenFollow(page: Page): Promise<string> {
  // Try Google search → first result; if CAPTCHA/issue, go straight to CBSL.
  try {
    await page.goto(GOOGLE, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (/\/sorry\//i.test(page.url())) throw new Error("captcha");

    await page.fill("textarea[name=q]", "awplr rate sri lanka");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.keyboard.press("Enter"),
    ]);
    if (/\/sorry\//i.test(page.url())) throw new Error("captcha");

    const firstResult = page.locator("a").first();
    const href = await firstResult.getAttribute("href");
    if (!href) throw new Error("no-search-link");

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      firstResult.click(),
    ]);
    return page.url();
  } catch {
    await page.goto(CBSL_REPORT, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return page.url();
  }
}

export async function scrapeCBSL(opts: Opts = {}): Promise<Row[]> {
  const headless = !(opts.show === "true");
  const slowMo = opts.slow ? Number(opts.slow) : 0;

  let browser: Browser | undefined;
  const out: Row[] = [];
  const updatedAt = nowISO();

  try {
    browser = await chromium.launch({ headless, slowMo });
    const page = await browser.newPage();

    // Known redirect path — allow/continue (no abort needed with this flow)
    await page.route("**/MoneyMarketRatesDefault.aspx**", (route) => route.continue());

    // 1) Land on CBSL via Google (fallback to direct or opt-in direct)
    const arrivedUrl =
      opts.preferDirect === "true"
        ? (await page.goto(CBSL_REPORT, { waitUntil: "domcontentloaded", timeout: 60_000 }), page.url())
        : await tryGoogleThenFollow(page);

    // 2) Enter date range and click Show
    const from = "2025-01-01";
    const to = lastDayOfCurrentMonth();

    await page.evaluate(({ from, to }) => {
      const f = document.querySelector<HTMLInputElement>("#ContentPlaceHolder1_txtFrom");
      const t = document.querySelector<HTMLInputElement>("#ContentPlaceHolder1_txtTo");
      if (f) { f.value = from; f.dispatchEvent(new Event("input", { bubbles: true })); f.dispatchEvent(new Event("change", { bubbles: true })); }
      if (t) { t.value = to;   t.dispatchEvent(new Event("input", { bubbles: true })); t.dispatchEvent(new Event("change", { bubbles: true })); }
    }, { from, to });

    await Promise.all([
      page.click("#ContentPlaceHolder1_btnShow", { force: true }),
      page.locator("#statTB").waitFor({ state: "visible", timeout: 30_000 }),
    ]);
    await page.locator("#statTB tr").nth(6).waitFor({ timeout: 10_000 }).catch(() => {});

    // 3) Resolve the AWPR → first "6 months" subcolumn index
    const table = page.locator("#statTB");
    const subHeaders = await table.locator("tr").nth(2).locator("td").allTextContents().catch(() => []);
    let awpr6Index = -1;
    if (subHeaders.length) {
      let seenSix = 0;
      for (let i = 0; i < subHeaders.length; i++) {
        const txt = subHeaders[i].replace(/\s+/g, " ").trim().toLowerCase();
        if (txt === "6 months" || txt === "6months") {
          seenSix++;
          if (seenSix === 1) { awpr6Index = 2 + i; break; } // shift after [End Week, AWLR]
        }
      }
    }
    if (awpr6Index === -1) awpr6Index = 4; // fallback for current layout

    // 4) Collect weekly rows
    const allRows = await table.locator("tr").all();
    const dataRows = allRows.slice(3); // skip title + 2 header rows
    const weeks: { date: string; rate?: string }[] = [];
    for (const r of dataRows) {
      const cells = await r.locator("td").allTextContents();
      if (!cells.length) continue;
      const d = (cells[0] || "").replace(/\s+/g, " ").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const rate = parseNum(cells[awpr6Index]);
      weeks.push({ date: d, rate });
    }

    // Convenience: list of rows that actually have rates
    const ratedWeeks = weeks.filter(w => !!w.rate);

    // 5) Build monthly series:
    //    - If month has in-month rates, pick the one closest to 1st (ties → later/after-1st)
    //    - If month has NO in-month rate, pick the globally closest rated week (can be prev/next month)
    const months: Date[] = [];
    {
      const start = new Date("2025-01-01");
      const end = new Date(); end.setDate(1);
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        months.push(new Date(cur));
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    function pickClosest(rows: { date: string; rate?: string }[], anchorTs: number) {
      let best = rows[0];
      let bestDiff = Math.abs(new Date(best.date).getTime() - anchorTs);
      let bestAfter = new Date(best.date).getTime() >= anchorTs;
      for (let i = 1; i < rows.length; i++) {
        const ts = new Date(rows[i].date).getTime();
        const diff = Math.abs(ts - anchorTs);
        const isAfter = ts >= anchorTs;
        if (diff < bestDiff || (diff === bestDiff && isAfter && !bestAfter)) {
          best = rows[i]; bestDiff = diff; bestAfter = isAfter;
        }
      }
      return best;
    }

    for (const m of months) {
      const y = m.getFullYear();
      const mo = m.getMonth();
      const firstTs = new Date(y, mo, 1).getTime();

      const inMonthRated = ratedWeeks.filter(w => {
        const dt = new Date(w.date);
        return dt.getFullYear() === y && dt.getMonth() === mo;
      });

      let chosen: { date: string; rate?: string } | undefined;

      if (inMonthRated.length) {
        chosen = pickClosest(inMonthRated, firstTs);
      } else if (ratedWeeks.length) {
        // ⬅️ New behavior: choose the globally closest rated week
        chosen = pickClosest(ratedWeeks, firstTs);
      }

      if (chosen && chosen.rate) {
        out.push({
          period: `${y}-${String(mo + 1).padStart(2, "0")}`,
          weekEnd: chosen.date,
          metric: "AWPR (6 months)",
          rate: chosen.rate,
          source: arrivedUrl,
          updatedAt,
        });
      }
      // If no rated weeks exist at all (unlikely), we skip the month.
    }

    out.sort((a, b) => a.period.localeCompare(b.period));

    if (opts.save === "true") {
      const outDir = path.join(process.cwd(), "output");
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "cbsl.json"), JSON.stringify(out, null, 2), "utf8");
    }

    return out;
  } finally {
    await browser?.close().catch(() => {});
  }
}

// CLI:
//   npx ts-node src/scrapers/cbsl.ts --show --save
//   npx ts-node src/scrapers/cbsl.ts --show --save --preferDirect=true
if (require.main === module) {
  const show = process.argv.includes("--show") ? "true" : "false";
  const save = process.argv.includes("--save") ? "true" : "false";
  const preferDirect = process.argv.includes("--preferDirect=true") ? "true" : "false";
  scrapeCBSL({ show, save, preferDirect })
    .then(rows => console.log(JSON.stringify(rows, null, 2)))
    .catch(err => { console.error(err); process.exit(1); });
}
