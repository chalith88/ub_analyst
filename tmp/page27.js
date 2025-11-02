const fs = require("fs");
const { getDocument } = require("pdfjs-dist/legacy/build/pdf.mjs");
const clean = (s = "") => s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

function toRow(page, y, cells) {
  const cleaned = cells
    .map((c) => ({ x: c.x, str: clean(c.str) }))
    .filter((c) => c.str.length > 0)
    .sort((a, b) => a.x - b.x);
  const text = cleaned.map((c) => c.str).join(" ").trim();
  return { page, y, cells: cleaned, text };
}

function groupRows(items, yTolerance = 2) {
  const byPage = new Map();
  for (const item of items) {
    if (!item.str) continue;
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page).push(item);
  }
  const rows = [];
  for (const [page, arr] of byPage.entries()) {
    arr.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    let current = [];
    let lastY = -Infinity;
    for (const item of arr) {
      if (!current.length || Math.abs(item.y - lastY) <= yTolerance) {
        current.push({ x: item.x, str: item.str });
      } else {
        if (current.length) rows.push(toRow(page, lastY, current));
        current = [{ x: item.x, str: item.str }];
      }
      lastY = item.y;
    }
    if (current.length) rows.push(toRow(page, lastY, current));
  }
  rows.sort((a, b) => (a.page === b.page ? a.y - b.y : a.page - b.page));
  return rows;
}

(async () => {
  const data = new Uint8Array(fs.readFileSync('c:/Users/chali/ub-scraper/tmp/ndb_tariff.pdf'));
  const pdf = await getDocument({ data }).promise;
  const items = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      const [ , , , , e, f ] = item.transform;
      const x = e;
      const y = viewport.height - f;
      const str = clean(item.str);
      if (!str) continue;
      items.push({ page: pageNo, x, y, str });
    }
  }
  const rows = groupRows(items);
  rows.filter(r => r.page === 27).forEach(r => {
    console.log(r.cells.map(c => `${c.x.toFixed(1)}:${c.str}`).join(' | '));
  });
})();
