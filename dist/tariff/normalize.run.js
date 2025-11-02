"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const normalize_1 = require("./normalize");
function run() {
    const base = { bank: "Union Bank", product: "Home Loan" };
    const rows = [
        { ...base, feeType: "Processing Fee", description: "Up to Rs. 5 Mn: 1.00%; Above Rs. 5 Mn up to Rs. 10 Mn: 0.80%; > 10 Mn: 0.60%" },
        { ...base, feeType: "Legal", description: "1.25% Min Rs. 10,000 Max Rs. 50,000" },
        { ...base, feeType: "Valuation", description: "LKR 7,500 per inspection" },
        { ...base, feeType: "CRIB Fee", description: "CRIB check", amount: "Rs. 500" },
    ];
    const ts = rows.map(normalize_1.normalizeTariffRow);
    const res = (0, normalize_1.pickTariffsForScenario)(ts, { bank: "Union", product: "HL", amount: 10000000 });
    console.log(JSON.stringify(res, null, 2));
}
run();
//# sourceMappingURL=normalize.run.js.map