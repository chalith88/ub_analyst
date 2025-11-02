"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sampath_ocr_1 = require("./scrapers/sampath_ocr");
const path_1 = __importDefault(require("path"));
(async () => {
    const PDF = "https://www.sampath.lk/common/loan/interest-rates-loan-and-advances.pdf";
    const OUT = path_1.default.join(process.cwd(), "output", "sampath.json");
    await (0, sampath_ocr_1.scrapeSampath_OCR)(PDF, OUT);
})();
//# sourceMappingURL=run-sampath-ocr.js.map