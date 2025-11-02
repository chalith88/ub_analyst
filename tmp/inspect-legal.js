const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');
const LEGAL_URL = 'https://www.peoplesbank.lk/roastoth/2023/12/Legal-Charges.pdf';
const normalizeWhitespace = (text) => text.replace(/\s+/g, ' ').trim();
const isSuffixLine = (text) => /^((?:st|nd|rd|th)\s*)+$/i.test(text.trim());
async function extract() {
  const pdf = await getDocument({ url: LEGAL_URL, standardFontDataUrl: undefined }).promise;
  const all = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map((it) => ({ str: it.str || '', x: Number(it.transform?.[4] ?? 0), y: Number(it.transform?.[5] ?? 0) }));
    items.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    const rows = [];
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (!last || Math.abs(it.y - last.y) > 2) {
        rows.push({ y: it.y, parts: [it.str] });
      } else {
        last.parts.push(it.str);
      }
    }
    for (const row of rows) {
      const text = normalizeWhitespace(row.parts.join(' '));
      if (text) all.push({ page: p, text });
    }
  }
  const attachOrdinals = (lines) => {
    const out = [];
    for (const line of lines) {
      const trimmed = line.text.trim();
      if (isSuffixLine(trimmed) && out.length) {
        const suffixes = trimmed.split(/\s+/);
        let prev = out[out.length - 1].text;
        const amountIdx = prev.search(/\d+(?:\.\d+)?%|LKR|\bRs\./i);
        const targetSegment = amountIdx >= 0 ? prev.slice(0, amountIdx) : prev;
        const rest = amountIdx >= 0 ? prev.slice(amountIdx) : '';
        const numbers = [...targetSegment.matchAll(/\d+/g)];
        if (numbers.length >= suffixes.length) {
          const startIdx = numbers.length - suffixes.length;
          let adjusted = targetSegment;
          for (let i = suffixes.length - 1; i >= 0; i--) {
            const match = numbers[startIdx + i];
            if (!match || match.index === undefined) continue;
            const pos = match.index + match[0].length;
            adjusted = adjusted.slice(0, pos) + suffixes[i].toLowerCase() + adjusted.slice(pos);
          }
          out[out.length - 1] = { page: out[out.length - 1].page, text: adjusted + rest };
        }
        continue;
      }
      out.push({ page: line.page, text: line.text });
    }
    return out;
  };
  const sanitized = attachOrdinals(all).map((l) => ({ page: l.page, text: normalizeWhitespace(l.text.replace(/\u2013/g, '-')) }));
  sanitized.forEach((l, idx) => {
    if (idx >= 10 && idx <= 40) {
      console.log(idx, l.text);
    }
  });
}
extract();
