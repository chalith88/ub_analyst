import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fetch from "node-fetch";
import fs from "fs";

const PDF_URL = "https://www.unionb.com/wp-content/uploads/2025/09/UBC-Retail-Tariff-22.09.2025_English.pdf";

(async () => {
  const res = await fetch(PDF_URL);
  if (!res.ok) throw new Error("Failed to download Union Bank PDF tariff");
  const buf = await res.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({ data: buf });
  const pdf = await loadingTask.promise;

  let lines: string[] = [];
  for (let i = 1; i <= pdf.numPages; ++i) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let currLine: string[] = [];
    for (const item of content.items) {
      const str = (item as any).str;
      if (!str) continue;
      // Join as a "line" if long or ends with "  "
      currLine.push(str);
      if (str.endsWith(" ") || str.length > 35) {
        lines.push(currLine.join(" ").replace(/\s+/g, " ").trim());
        currLine = [];
      }
    }
    if (currLine.length) {
      lines.push(currLine.join(" ").replace(/\s+/g, " ").trim());
    }
  }
  fs.writeFileSync("unionb-tariff-lines.txt", lines.join("\n"), "utf-8");
  console.log("Extracted", lines.length, "lines to unionb-tariff-lines.txt");
})();
