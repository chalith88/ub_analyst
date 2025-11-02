const fs = require("fs");
const { getDocument } = require("pdfjs-dist/legacy/build/pdf.mjs");
const clean = (s = "") => s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
(async () => {
  const data = new Uint8Array(fs.readFileSync("c:/Users/chali/ub-scraper/tmp/ndb_tariff.pdf"));
  const pdf = await getDocument({ data }).promise;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const rows = textContent.items
      .map(it => ({ str: clean(it.str), x: it.transform[4], y: viewport.height - it.transform[5] }))
      .filter(it => it.str);
    const text = rows.map(r => r.str).join(' ');
    if (/12\.5 Housing|12\.6 Housing|12\.7 Other/i.test(text)) {
      console.log('Page', p);
      rows.sort((a, b) => a.y - b.y || a.x - b.x);
      let groups = [];
      let current = [];
      let lastY = null;
      const tol = 2;
      for (const row of rows) {
        if (lastY === null || Math.abs(row.y - lastY) <= tol) {
          current.push(row);
        } else {
          groups.push(current);
          current = [row];
        }
        lastY = row.y;
      }
      if (current.length) groups.push(current);
      for (const g of groups) {
        console.log(g.map(c => c.str).join(' '));
      }
    }
  }
})();
