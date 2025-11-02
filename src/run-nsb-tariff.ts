// src/run-nsb-tariff.ts
import * as path from "path";
import { scrapeNSBTariff } from "./scrapers/nsb-tariff";

(async () => {
  const outDir = path.join(process.cwd(), "output");
  const { rows, ambiguous, debugFile } = await scrapeNSBTariff({
    outDir,
    save: true,
  });

  console.log(`→ Debug lines: ${debugFile}`);
  console.log(`→ Parsed rows: ${rows.length}`);
  if (ambiguous.length) {
    console.log(`⚠ Ambiguous lines: ${ambiguous.length} (see output/nsb-ambiguous.json)`);
  }
  console.log(`✓ JSON written to output/nsb-fees.json`);
})().catch((e) => {
  console.error("NSB tariff scrape error:", e);
  process.exit(1);
});
