// src/scrapers/peoples.ts
import { chromium, Page, Locator } from "playwright";
import { RateRow } from "../types";

const URL = "https://www.peoplesbank.lk/interest-rates/";

function clean(s: string) {
  return (s || "")
    .replace(/\u00A0/g, " ")        // NBSP
    .replace(/[\u200B-\u200D]/g, "")// zero-width
    .replace(/\s+/g, " ")
    .trim();
}

async function acceptCookies(page: Page) {
  const sels = [
    "#onetrust-accept-btn-handler",
    "button:has-text('Accept All')",
    "button:has-text('Accept')",
    "a:has-text('Accept All')",
    "a:has-text('Accept')",
  ];
  for (const s of sels) {
    const el = await page.$(s);
    if (el) { await el.click().catch(() => {}); break; }
  }
}

async function openLoanRates(page: Page): Promise<Locator> {
  // Click tab
  await page.locator("button.btn-type2.tablinks", { hasText: "Loan Rates" })
    .first()
    .click({ timeout: 20000 })
    .catch(async () => {
      const el = await page.$("button:has-text('Loan Rates')");
      if (el) await el.evaluate((b: any) => (b as HTMLButtonElement).click());
    });

  // Force display if not visible
  await page.evaluate(() => {
    const el = document.getElementById("Loan_Rates");
    if (el) (el as HTMLElement).style.display = "block";
  });

  const container = page.locator("#Loan_Rates");
  await container.waitFor({ state: "visible", timeout: 30000 });
  return container;
}

/** Capture all rows (label, min, max) */
async function readAllRows(container: Locator) {
  const rows = await container.evaluate(() => {
    function txt(el?: Element | null) {
      return (el?.textContent || "")
        .replace(/\u00A0/g, " ")
        .replace(/[\u200B-\u200D]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    const out: Array<{ label: string; min: string; max: string }> = [];
    const trs = Array.from(document.querySelectorAll("#Loan_Rates table tbody tr"));
    for (const tr of trs) {
      const h6s = Array.from(tr.querySelectorAll<HTMLHeadingElement>("td h6"));
      if (h6s.length >= 3) {
        out.push({ label: txt(h6s[0]), min: txt(h6s[1]), max: txt(h6s[2]) });
      }
    }
    return out;
  });
  return rows;
}

export async function scrapePeoples(show = false, slow = 0): Promise<RateRow[]> {
  const browser = await chromium.launch({ headless: !show, slowMo: slow });
  const page = await browser.newPage();
  const now = new Date().toISOString();
  const out: RateRow[] = [];

  // Exclude list (case-insensitive substring match)
  const exclude = [
    "Business Loans",
    "Vehicle Loans",
    "Pawning",
    "Export Finance - Rupee Facilities",
    "Import Finance - Rupee Facilities",
    "Lending to Small & Medium Scale Industries (SMEs)",
    "Credit Cards",
    "Agriculture/Animal Husbandry Fisheries/related industries",
    "Development Loans",
    "Permanent",
    "Temporary"
  ].map(e => e.toLowerCase());

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await acceptCookies(page);
    const container = await openLoanRates(page);

    const rows = await readAllRows(container);

    for (const r of rows) {
      const label = clean(r.label);
      if (!label) continue;

      // Skip excluded rows
      if (exclude.some(ex => label.toLowerCase().includes(ex))) continue;

      const minRate = clean(r.min);
      const maxRate = clean(r.max);

      // --- Special mapping: Residential Housing -> Home Loan ---
      if (/Residential Housing/i.test(label)) {
        [minRate, maxRate].forEach((rate, i) => {
          out.push({
            bank: "People's Bank",
            product: "Home Loan",
            type: "Floating",
            tenureLabel: i === 0 ? "Min Rate" : "Max Rate",
            rateWithSalary: rate,
            rateWithoutSalary: rate,
            source: URL,
            updatedAt: now,
          });
        });
        continue;
      }

      // --- Special mapping: Gurusetha Loan -> Personal Loan + LAP ---
      if (/Gurusetha/i.test(label)) {
        [minRate, maxRate].forEach((rate, i) => {
          out.push({
            bank: "People's Bank",
            product: "Personal Loan",
            type: "Floating",
            tenureLabel: i === 0 ? "≤ LKR 4Mn (Min Rate)" : "≤ LKR 4Mn (Max Rate)",
            rateWithSalary: rate,
            rateWithoutSalary: rate,
            source: URL,
            updatedAt: now,
            notes: "Only for Teachers of the public and private sector schools and institutions. Maximum tenure up to 10 years."
          });
          out.push({
            bank: "People's Bank",
            product: "LAP",
            type: "Floating",
            tenureLabel: i === 0 ? "> LKR 4Mn (Min Rate)" : "> LKR 4Mn (Max Rate)",
            rateWithSalary: rate,
            rateWithoutSalary: rate,
            source: URL,
            updatedAt: now,
            notes: "Only for Teachers of the public and private sector schools and institutions. Maximum tenure up to 10 years."
          });
        });
        continue;
      }

      // --- Default case: all other products, just 2 records (min + max) ---
      [minRate, maxRate].forEach((rate, i) => {
        out.push({
          bank: "People's Bank",
          product: label,
          type: "Floating",
          tenureLabel: i === 0 ? "Min Rate" : "Max Rate",
          rateWithSalary: rate,
          rateWithoutSalary: rate,
          source: URL,
          updatedAt: now,
        });
      });
    }
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  return out;
}
