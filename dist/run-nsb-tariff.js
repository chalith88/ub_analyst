"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// src/run-nsb-tariff.ts
const path = __importStar(require("path"));
const nsb_tariff_1 = require("./scrapers/nsb-tariff");
(async () => {
    const outDir = path.join(process.cwd(), "output");
    const { rows, ambiguous, debugFile } = await (0, nsb_tariff_1.scrapeNSBTariff)({
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
//# sourceMappingURL=run-nsb-tariff.js.map