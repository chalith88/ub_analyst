import { scrapeSampath_OCR } from "./scrapers/sampath_ocr";
import path from "path";

(async () => {
  const PDF = "https://www.sampath.lk/common/loan/interest-rates-loan-and-advances.pdf";
  const OUT = path.join(process.cwd(), "output", "sampath.json");
  await scrapeSampath_OCR(PDF, OUT);
})();
