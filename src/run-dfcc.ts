import { scrapeDFCC } from "./src/scrapers/dfcc";

(async () => {
  const rows = await scrapeDFCC({ show: true, slow: 200 }); // 👈 show = true opens Chromium
  console.log("Extracted rows:", rows);
})();
