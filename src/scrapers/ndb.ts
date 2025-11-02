// src/scrapers/ndb.ts
import { chromium, Page, Locator } from "playwright";
import { RateRow } from "../types";
import { acceptAnyCookie } from "../utils/dom";
import { clean, fanOutByYears, normalizeAwpr } from "../utils/text";

const URL = "https://www.ndbbank.com/rates/interest-rates-on-advances";

/* ───────────────────────── helpers ───────────────────────── */

function asRate(cell: string): string | undefined {
  const t = clean(cell);
  if (!t || t === "-" || t === "–") return undefined;
  if (/(awpr|awplr)/i.test(t)) return normalizeAwpr(t);
  const m = t.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  if (!isFinite(n) || n <= 0) return undefined; // treat 0.00% as not applicable
  return `${n.toFixed(2)}%`;
}

/** Extract ALL numeric rates from a cell, preserving order (skip 0.00). */
function extractRates(cell: string): string[] {
  const t = clean(cell);
  if (!t) return [];
  if (/(awpr|awplr)/i.test(t)) return [normalizeAwpr(t)];
  const ms = t.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
  return ms
    .map((s) => Number(s))
    .filter((n) => isFinite(n) && n > 0)
    .map((n) => `${n.toFixed(2)}%`);
}

async function scrollToAdvancesTable(page: Page): Promise<Locator> {
  const h = page.locator('text=/\\bADVANCES\\s+RATES\\b/i').first();
  if (await h.count().then((c) => c > 0)) {
    try { await h.scrollIntoViewIfNeeded(); } catch {}
  }
  const tables = await page.locator("table").all();
  for (const tbl of tables) {
    const ths = (await tbl.locator("thead th").allTextContents()).map(clean).join(" ").toLowerCase();
    if (ths.includes("description") && (ths.includes("min. rate") || ths.includes("max. rate"))) {
      await tbl.scrollIntoViewIfNeeded().catch(() => {});
      return tbl;
    }
  }
  return page.locator("table").first();
}

type ColMap = { idxDesc: number; idxMin?: number; idxMax?: number; idxOthers?: number };

async function mapColumns(table: Locator): Promise<ColMap> {
  const headTexts = (await table.locator("thead th").allTextContents()).map(clean);
  const heads = headTexts.map((h) => h.toLowerCase());

  const idxDesc = heads.findIndex((h) => /description/.test(h));
  const idxMin = heads.findIndex((h) => /\bmin\b|\bmin\.\s*rate/.test(h));
  const idxMax = heads.findIndex((h) => /\bmax\b|\bmax\.\s*rate/.test(h));
  const idxOthers = heads.findIndex((h) => /other/.test(h));

  return { idxDesc: idxDesc >= 0 ? idxDesc : 0, idxMin, idxMax, idxOthers };
}

function normalizeProduct(groupOrDesc: string): "Home Loan" | "Personal Loan" | "Education Loan" | string {
  const s = groupOrDesc.toLowerCase();
  if (/home\s*loan/.test(s) || /housing/.test(s) || /mortgage/.test(s)) return "Home Loan";
  if (/personal\s*loan/.test(s)) return "Personal Loan";
  if (/education/.test(s) || /student/.test(s) || /scholar/.test(s)) return "Education Loan";
  return groupOrDesc;
}

function detectType(desc: string): "Fixed" | "Floating" | "Fixed & Floating" | string {
  const d = desc.toLowerCase();
  if (/variable|floating|awpr|awplr/.test(d)) return "Floating";
  return "Fixed";
}

/* ───────────────────────── parser ───────────────────────── */

async function parseAdvancesTable(table: Locator, nowISO: string): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const { idxDesc, idxMin, idxMax, idxOthers } = await mapColumns(table);

  const trs = await table.locator("tbody tr").all();
  let currentGroup: string | null = null;

  for (const tr of trs) {
    const tds = await tr.locator("td").allTextContents();
    const cells = tds.map(clean);
    if (!cells.length) continue;

    const descCell = cells[idxDesc] ?? "";
    const minCell = idxMin != null ? cells[idxMin] ?? "" : "";
    const maxCell = idxMax != null ? cells[idxMax] ?? "" : "";
    const othCell = idxOthers != null ? cells[idxOthers] ?? "" : "";

    const anyRatePresent = !!(asRate(minCell) || asRate(maxCell) || asRate(othCell));

    // Section header (no rates in the row)
    if (!anyRatePresent && /(home loans?|personal loans?|education loans?)/i.test(descCell)) {
      currentGroup = descCell;
      continue;
    }

    if (!descCell && !anyRatePresent) continue;

    const product = normalizeProduct(currentGroup || descCell);
    if (!/home loan|personal loan|education loan/i.test(product)) continue;

    const type = detectType(descCell);
    const descClean = clean(descCell);

    // ❌ Skip Solar loans (e.g., "Solar Vantage - Personal Loans")
    if (/solar/i.test(descClean)) continue;

    // ---------- SPECIAL CASE: Personal Loans row contains two sub-items in one row ----------
    const isPersonal = /personal loan/i.test(product);
    const hasBothPersonalSubItems =
      isPersonal &&
      /general\s+personal\s+loan/i.test(descClean) &&
      /special\s+rate\s*for\s*doctors/i.test(descClean);

    if (hasBothPersonalSubItems) {
      const labels = ["General personal loan", "Special rate for doctors"];

      const cols: Array<{ label: string; values: string[] }> = [
        { label: "Min rate", values: extractRates(minCell) },
        { label: "Max rate", values: extractRates(maxCell) },
        { label: "Others",   values: extractRates(othCell) },
      ];

      for (const col of cols) {
        for (let i = 0; i < Math.min(labels.length, col.values.length); i++) {
          const rate = col.values[i];
          if (!rate) continue;
          const notes = `${labels[i]} · ${col.label}`;
          out.push(
            ...fanOutByYears<RateRow>(
              {
                bank: "NDB Bank",
                product,
                type,
                tenureLabel: undefined,
                rateWithSalary: rate,
                rateWithoutSalary: undefined,
                source: URL,
                updatedAt: nowISO,
                notes,
              },
              []
            )
          );
        }
      }
      continue; // done with this combined row
    }

    // ---------- Default path (single sub-item per row) ----------
    let notesBase: string | undefined;
    if (isPersonal) {
      if (/general personal loan/i.test(descClean)) notesBase = "General personal loan";
      else if (/special rate\s*for\s*doctors/i.test(descClean)) notesBase = "Special rate for doctors";
      else if (currentGroup && clean(currentGroup) !== descClean) notesBase = descClean;
    } else if (currentGroup && clean(currentGroup) !== descClean) {
      notesBase = descClean;
    }

    const pushes: Array<{ label: string; val?: string }> = [
      { label: "Min rate", val: asRate(minCell) },
      { label: "Max rate", val: asRate(maxCell) },
      { label: "Others",   val: asRate(othCell) },
    ];

    for (const { label, val } of pushes) {
      if (!val) continue;
      const notes = notesBase ? `${notesBase} · ${label}` : label;

      out.push(
        ...fanOutByYears<RateRow>(
          {
            bank: "NDB Bank",
            product,
            type,
            tenureLabel: undefined,
            rateWithSalary: val,
            rateWithoutSalary: undefined,
            source: URL,
            updatedAt: nowISO,
            notes,
          },
          []
        )
      );
    }
  }

  return out;
}

/* ───────────────────────── main entry ───────────────────────── */

export async function scrapeNDB(opts?: { show?: boolean; slow?: number }): Promise<RateRow[]> {
  const browser = await chromium.launch({
    headless: !opts?.show,
    slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  const rows: RateRow[] = [];
  const now = new Date().toISOString();

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptAnyCookie(page);

    const table = await scrollToAdvancesTable(page);
    await table.waitFor({ state: "visible", timeout: 15000 });

    rows.push(...(await parseAdvancesTable(table, now)));
  } finally {
    await browser.close();
  }

  return rows;
}
