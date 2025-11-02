// Client-side helper to compute DFCC pricing using live API endpoints
// This does not modify existing bank routers; call this only when bank === 'DFCC'.

import { dfccCalculator, type DFCCInputs, type PriceResult } from './dfcc';

async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * Fetch DFCC rates and tariff JSONs from the backend and compute the PriceResult.
 * - Endpoints assumed available and proxied by Vite:
 *   /scrape/dfcc          -> rates array
 *   /scrape/dfcc-tariff   -> tariff array
 *
 * This function is safe and side-effect free; it does not alter other bank logic.
 */
export async function calculateDfccFromApi(inputs: DFCCInputs): Promise<PriceResult> {
  if (inputs.bank !== 'DFCC') throw new Error('DFCC calculator called with non-DFCC bank');
  const [ratesJson, tariffJson] = await Promise.all([
    fetchJson('/api/scrape/dfcc'),
    fetchJson('/api/scrape/dfcc-tariff'),
  ]);
  return dfccCalculator.calculate(inputs, ratesJson, tariffJson);
}
