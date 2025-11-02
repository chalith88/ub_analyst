const { chromium } = require('playwright');
const fs = require('fs/promises');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    const downloadPromise = page.waitForEvent('download');
    await page.goto('https://www.unionb.com/wp-content/uploads/2025/09/UBC-Retail-Tariff-22.09.2025_English.pdf', { waitUntil: 'networkidle', timeout: 60000 });
    const download = await downloadPromise.catch(() => null);
    if (download) {
      await download.saveAs('c:/Users/chali/ub-scraper/tmp/unionb_tariff_playwright.pdf');
      console.log('downloaded via event');
    } else {
      const content = await page.content();
      console.log('no download', content.length);
    }
  } catch (err) {
    console.error('error', err);
  } finally {
    await context.close();
    await browser.close();
  }
})();
