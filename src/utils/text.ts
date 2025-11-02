// --- text helpers kept tiny & predictable ---

export function clean(s?: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

// Normalize any AWPR/AWPLR mention to "AWPR + X%"
export function normalizeAwpr(cell: string): string {
  const t = clean(cell);
  if (!/(awpr|awplr)/i.test(t)) return t;

  // capture "AWPR + 3", "AWPLR+3%", "AWPR + 3.00 %", etc.
  const m = t.match(/awp(?:lr)?\s*\+?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
  if (m) return `AWPR + ${Number(m[1]).toString()}%`;

  // leave as-is if weird
  return "AWPR + ";
}

// Decide Fixed / Floating / Fixed & Floating
export function decideType(
  rateWithSalary?: string,
  rateWithoutSalary?: string,
  heading = ""
): "Fixed" | "Floating" | "Fixed & Floating" {
  const h = heading.toLowerCase();
  const v = `${rateWithSalary ?? ""} ${rateWithoutSalary ?? ""}`.toLowerCase();

  const hasAwpr = /(awpr|awplr)/i.test(v) || /(awpr|awplr)/i.test(h);
  const saysFixed = /fixed/.test(h) || /fixed/.test(v);
  const saysFloating = /floating/.test(h) || /floating/.test(v);

  // hybrid lines e.g. "3/5/10 years fixed followed by AWPR + …"
  if (hasAwpr && saysFixed) return "Fixed & Floating";
  if (hasAwpr || saysFloating) return "Floating";
  return "Fixed";
}

// Expand a tenure label into individual years
export function expandTenureYears(label: string): number[] {
  const t = clean(label).toLowerCase();
  const MAX_TENURE = 25;

  // "Up to 3 Years"
  let m = t.match(/up to\s*([0-9]+)\s*year/);
  if (m) {
    const n = Number(m[1]);
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  // "4 to 5 Years" / "6 - 7 Years"
  m = t.match(/([0-9]+)\s*(?:to|-)\s*([0-9]+)\s*year/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }

  // EXCLUSIVE upper-lower phrasing:
  // "Above 10 Years" / "Over 10 Years" / "More than 10 Years" / "Greater than 10 Years" => 11..25
  m = t.match(/(?:above|over|more than|greater than)\s*([0-9]+)\s*year/);
  if (m) {
    const start = Number(m[1]) + 1;
    const lo = Math.max(start, 1);
    const hi = MAX_TENURE;
    if (lo > hi) return [];
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }

  // INCLUSIVE variants:
  // "10 years and above" / "10 years over" / "10 years & above" / "10 years or above" => 10..25
  m = t.match(/([0-9]+)\s*year(?:s)?\s*(?:and\s+|&\s*|or\s+)?(?:above|over)\b/);
  if (m) {
    const n = Number(m[1]);
    const lo = Math.max(n, 1);
    const hi = MAX_TENURE;
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }

  // "10+ Years" / "10 plus years" => 10..25 (treat as inclusive)
  m = t.match(/([0-9]+)\s*(?:\+|plus)\s*year/);
  if (m) {
    const n = Number(m[1]);
    const lo = Math.max(n, 1);
    const hi = MAX_TENURE;
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }

  // "3 / 5 / 10 Years"
  const slash = t.match(/([0-9]+)\s*\/\s*([0-9]+)\s*\/\s*([0-9]+)/);
  if (slash) return [Number(slash[1]), Number(slash[2]), Number(slash[3])];

  // "3 Years" or "1 Year"
  m = t.match(/([0-9]+)\s*year/);
  if (m) return [Number(m[1])];

  return [];
}

// duplicate a row across expanded years
export function fanOutByYears<T extends { tenureYears?: number; tenureLabel: string }>(
  base: Omit<T, "tenureYears">,
  years: number[]
): T[] {
  if (!years.length) return [{ ...(base as any), tenureYears: undefined } as T];
  return years.map((y) => ({ ...(base as any), tenureYears: y }));
}
