import { Page, Locator } from "playwright";

export async function acceptAnyCookie(page: Page) {
  const buttons = [
    "button:has-text(\"OK\")",
    "button:has-text(\"Ok\")",
    "button:has-text(\"I Agree\")",
    "button:has-text(\"Accept\")",
    "text=Accept"
  ];
  for (const sel of buttons) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      try { await btn.click({ timeout: 1000 }); } catch {}
    }
  }
}

// robust left menu clicker (works with their <nav class="grid"> list)
export async function clickLeftMenu(page: Page, label: string) {
  const nav = page.locator("nav.grid").first();
  await nav.waitFor({ state: "visible", timeout: 5000 });

  // try visible role=link first
  let link: Locator = nav.getByRole("link", { name: new RegExp(`^${escapeRegex(label)}$`, "i") }).first();

  if (!(await link.isVisible().catch(() => false))) {
    // fallback to :has-text
    link = nav.locator(`a:has-text("${label}")`).first();
  }

  // if still hidden, try to bring into view and click via force if necessary
  try { await link.scrollIntoViewIfNeeded({ timeout: 2000 }); } catch {}
  if (!(await link.isVisible().catch(() => false))) {
    await page.evaluate((txt) => {
      const candidates = Array.from(document.querySelectorAll("nav.grid a"));
      const el = candidates.find(a => (a.textContent || "").trim().toLowerCase() === txt.toLowerCase());
      if (el) el.scrollIntoView({ block: "center" });
    }, label);
  }

  if (!(await link.isVisible().catch(() => false))) {
    throw new Error(`could not click left menu: ${label}`);
  }

  await link.click({ timeout: 3000 });
  // Page re-renders top portion; scroll to very top then to bottom slowly so all tables mount
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  await page.waitForTimeout(400);
}
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
