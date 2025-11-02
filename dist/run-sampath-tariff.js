"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sampath_tariff_1 = require("./scrapers/sampath-tariff");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
(async () => {
    try {
        const data = await (0, sampath_tariff_1.scrapeSampathTariff)();
        const outDir = path_1.default.join(__dirname, "../output");
        if (!fs_1.default.existsSync(outDir))
            fs_1.default.mkdirSync(outDir, { recursive: true });
        const outFile = path_1.default.join(outDir, "sampath-tariff.json");
        fs_1.default.writeFileSync(outFile, JSON.stringify(data, null, 2), "utf8");
        console.log("✅ Sampath Tariff OCR scraping finished.");
        console.log("📂 Results saved to:", outFile);
        console.log("📊 Sample output:\n", JSON.stringify(data.slice(0, 8), null, 2));
    }
    catch (err) {
        console.error("❌ Error in Sampath Tariff scraper:", err);
        process.exit(1);
    }
})();
//# sourceMappingURL=run-sampath-tariff.js.map