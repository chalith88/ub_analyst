import { calculateTariff } from "./tariff";
import { selectBestRate } from "./rates";
import type { UserInputs } from "./tariff";
import type { RateResult } from "./rates";

export interface OfferResult {
  tariff: ReturnType<typeof calculateTariff>;
  rate: RateResult;
}

export function generateOffer(inputs: UserInputs): OfferResult {
  const rate = selectBestRate(inputs);
  const tariff = calculateTariff(inputs);
  return { rate, tariff };
}
