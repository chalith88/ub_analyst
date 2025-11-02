import { scrapeSampathTariff } from "./scrapers/sampath-tariff";
import fs from "fs";
import path from "path";

(async () => {
  try {
    const data = await scrapeSampathTariff();

    const outDir = path.join(__dirname, "../output");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outFile = path.join(outDir, "sampath-tariff.json");
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2), "utf8");

    console.log("✅ Sampath Tariff OCR scraping finished.");
    console.log("📂 Results saved to:", outFile);
    console.log("📊 Sample output:\n", JSON.stringify(data.slice(0, 8), null, 2));
  } catch (err) {
    console.error("❌ Error in Sampath Tariff scraper:", err);
    process.exit(1);
  }
})();
