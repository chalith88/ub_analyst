"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dfcc_1 = require("./src/scrapers/dfcc");
(async () => {
    const rows = await (0, dfcc_1.scrapeDFCC)({ show: true, slow: 200 }); // 👈 show = true opens Chromium
    console.log("Extracted rows:", rows);
})();
//# sourceMappingURL=run-dfcc.js.map