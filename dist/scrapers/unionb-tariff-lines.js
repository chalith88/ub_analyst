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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pdfjsLib = __importStar(require("pdfjs-dist/legacy/build/pdf.mjs"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const fs_1 = __importDefault(require("fs"));
const PDF_URL = "https://www.unionb.com/wp-content/uploads/2025/09/UBC-Retail-Tariff-22.09.2025_English.pdf";
(async () => {
    const res = await (0, node_fetch_1.default)(PDF_URL);
    if (!res.ok)
        throw new Error("Failed to download Union Bank PDF tariff");
    const buf = await res.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buf });
    const pdf = await loadingTask.promise;
    let lines = [];
    for (let i = 1; i <= pdf.numPages; ++i) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let currLine = [];
        for (const item of content.items) {
            const str = item.str;
            if (!str)
                continue;
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
    fs_1.default.writeFileSync("unionb-tariff-lines.txt", lines.join("\n"), "utf-8");
    console.log("Extracted", lines.length, "lines to unionb-tariff-lines.txt");
})();
//# sourceMappingURL=unionb-tariff-lines.js.map