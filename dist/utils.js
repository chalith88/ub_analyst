"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sumUpfrontTariffsForBank = sumUpfrontTariffsForBank;
/** Scenario-based tariff picking wrapper using normalize.ts (per PROMPT.md) */
const normalize_1 = require("./tariff/normalize");
/** Sum upfront tariffs for a bank/product/amount scenario. */
function sumUpfrontTariffsForBank(tariffs, scenario) {
    return (0, normalize_1.pickTariffsForScenario)(tariffs, scenario);
}
exports.default = { sumUpfrontTariffsForBank };
//# sourceMappingURL=utils.js.map