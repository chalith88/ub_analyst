/** Scenario-based tariff picking wrapper using normalize.ts (per PROMPT.md) */
import { pickTariffsForScenario, TariffScenario, NormalizedTariff } from "./tariff/normalize";

export type UpfrontResult = ReturnType<typeof pickTariffsForScenario>;

/** Sum upfront tariffs for a bank/product/amount scenario. */
export function sumUpfrontTariffsForBank(tariffs: NormalizedTariff[], scenario: TariffScenario): UpfrontResult {
  return pickTariffsForScenario(tariffs, scenario);
}

export default { sumUpfrontTariffsForBank };
