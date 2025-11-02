function ScraperPanel({
  apiBase, onMerge, onMergeTariffs, onResetRates, onResetTariffs, onCbsl, awprLatest,
}: {
  apiBase: string;
  onMerge: (rows: RateRow[]) => void;
  onMergeTariffs: (rows: TariffRow[]) => void;
  onResetRates: () => void;
  onResetTariffs: () => void;
  onCbsl: (rows: any[]) => void;
  awprLatest?: number;
}) {
  /* ---- Rate scrapers (unchanged list incl. CBSL) ---- */
  const rateBanks: Bank[] = [
    { key: "hnb", label: "HNB", url: `${apiBase}/scrape/hnb` },
    { key: "seylan", label: "Seylan", url: `${apiBase}/scrape/seylan` },
    { key: "sampath", label: "Sampath", url: `${apiBase}/scrape/sampath` },
    { key: "combank", label: "Commercial Bank", url: `${apiBase}/scrape/combank` },
    { key: "ndb", label: "NDB", url: `${apiBase}/scrape/ndb` },
    { key: "unionb", label: "Union Bank", url: `${apiBase}/scrape/unionb` },
    { key: "dfcc", label: "DFCC", url: `${apiBase}/scrape/dfcc` },
    { key: "nsb", label: "NSB", url: `${apiBase}/scrape/nsb` },
    { key: "boc", label: "BOC", url: `${apiBase}/scrape/boc` },
    { key: "cargills", label: "Cargills", url: `${apiBase}/scrape/cargills` },
    { key: "ntb", label: "NTB", url: `${apiBase}/scrape/ntb` },
    { key: "amana", label: "Amana", url: `${apiBase}/scrape/amana` },
    { key: "peoples", label: "People’s", url: `${apiBase}/scrape/peoples` },
    { key: "cbsl", label: "CBSL (AWPR)", url: `${apiBase}/scrape/cbsl` },
  ];

  /* ---- Tariff scrapers: mirror keys with "-tariff" endpoints ---- */
  const tariffBanks: Bank[] = [
    { key: "hnb_tariff", label: "HNB – Tariff", url: tariffEndpointFor("hnb", apiBase)[0] },
    { key: "seylan_tariff", label: "Seylan – Tariff", url: tariffEndpointFor("seylan", apiBase)[0] },
    { key: "sampath_tariff", label: "Sampath – Tariff", url: tariffEndpointFor("sampath", apiBase)[0] },
    { key: "combank_tariff", label: "Commercial Bank – Tariff", url: tariffEndpointFor("combank", apiBase)[0] },
    { key: "ndb_tariff", label: "NDB – Tariff", url: tariffEndpointFor("ndb", apiBase)[0] },
    { key: "unionb_tariff", label: "Union Bank – Tariff", url: tariffEndpointFor("unionb", apiBase)[0] },
    { key: "dfcc_tariff", label: "DFCC – Tariff", url: tariffEndpointFor("dfcc", apiBase)[0] },
    { key: "nsb_tariff", label: "NSB – Tariff", url: tariffEndpointFor("nsb", apiBase)[0] },
    { key: "boc_tariff", label: "BOC – Tariff", url: tariffEndpointFor("boc", apiBase)[0] },
    { key: "cargills_tariff", label: "Cargills – Tariff", url: tariffEndpointFor("cargills", apiBase)[0] },
    { key: "ntb_tariff", label: "NTB – Tariff", url: tariffEndpointFor("ntb", apiBase)[0] },
    { key: "amana_tariff", label: "Amana – Tariff", url: tariffEndpointFor("amana", apiBase)[0] },
    { key: "peoples_tariff", label: "People’s – Tariff", url: tariffEndpointFor("peoples", apiBase)[0] },
  ];

  type PanelState = {
    status: Record<string, ScrapeStatus>;
    counts: Record<string, number>;
    errors: Record<string, string | undefined>;
    lastRun: Record<string, string | undefined>;
  };
  const EMPTY_PANEL: PanelState = { status: {}, counts: {}, errors: {}, lastRun: {} };

  const [panel, setPanel] = useState<PanelState>(() => loadJSON<PanelState>(LS_PANEL, EMPTY_PANEL));
  useEffect(() => saveJSON(LS_PANEL, panel), [panel]);

  function patch(key: string, p: Partial<{ st: ScrapeStatus; cnt: number; err?: string; ts?: string }>) {
    setPanel((s) => ({
      status: { ...s.status, ...(p.st ? { [key]: p.st } : {}) },
      counts: { ...s.counts, ...(p.cnt !== undefined ? { [key]: p.cnt } : {}) },
      errors: { ...s.errors, ...(p.err !== undefined ? { [key]: p.err } : {}) },
      lastRun: { ...s.lastRun, ...(p.ts !== undefined ? { [key]: p.ts } : {}) },
    }));
  }

  /* ---- Rates coercer (unchanged) ---- */
  function coerceRows(raw: any): RateRow[] {
    const arr = Array.isArray(raw) ? raw : raw?.rows || raw?.data || [];
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => {
      const stringFields: string[] = []
        .concat(r.rate, r.Rate, r.rateWithSalary, r.rateWithoutSalary, r.minRate, r.maxRate, r.Min, r.Max, r.notes)
        .filter((x: any) => typeof x === "string");
      const formulaStr = stringFields.find(containsFormula);
      const isFormula = !!formulaStr;

      const numericCandidates = [r.rate, r.Rate, r.rateWithSalary, r.rateWithoutSalary, r.minRate, r.maxRate, r.Min, r.Max]
        .filter((x: any) => !(isFormula && typeof x === "string"))
        .map(readNumber);
      const rateNum = isFormula ? undefined :
        numericCandidates.find((v) => typeof v === "number" && isFinite(v));

      const product = normProductName(r.product ?? r.Product ?? r.category ?? r.ProductName);
      const type: "Fixed" | "Floating" =
        /floating|float/i.test(String(r.type ?? r.Type ?? r.notes ?? "").toLowerCase())
          ? "Floating" : "Fixed";

      const fy =
        r.fixedYears ?? r.tenureYears ??
        (() => {
          const m =
            String(r.tenureLabel ?? r.notes ?? "").toLowerCase().match(/\b([0-9]+)\s*(?:y|year)/) ||
            String(r.type ?? "").toLowerCase().match(/\b([0-9]+)\s*(?:y|year)/);
          return m ? parseInt(m[1], 10) : undefined;
        })();

      return {
        bank: r.bank || r.Bank || "Unknown",
        product,
        rate: rateNum ?? NaN,
        type,
        fixedYears: fy,
        updatedAt: r.updatedAt || new Date().toISOString(),
        source: r.source,
        notes: r.notes ?? (isFormula ? formulaStr : undefined),
        ltv: typeof r.ltv === "number" ? r.ltv : undefined,
        salaryRequired: r.salaryRequired,
        raw: r,
      } as RateRow;
    });
  }

  /* ---- runners ---- */

  async function runRateOne(b: Bank) {
    patch(b.key, { st: "running", err: undefined });
    const tries: string[] = [b.url];
    if (!/[?&](show|save)=/i.test(b.url)) {
      tries.push(b.url + (b.url.includes("?") ? "&" : "?") + "show=true");
    }

    let lastErr: any = null;
    for (const url of tries) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();

        if (b.key === "cbsl") {
          const rows = Array.isArray(data) ? data : [];
          onCbsl(rows);
          patch(b.key, { st: "done", cnt: rows.length, ts: new Date().toLocaleString() });
          return;
        }

        let rows = coerceRows(data);
        if (typeof awprLatest === "number") rows = normalizeFormulaRates(rows, awprLatest);
        onMerge(rows);
        patch(b.key, { st: "done", cnt: rows.length, ts: new Date().toLocaleString() });
        return;
      } catch (e: any) {
        lastErr = e;
      }
    }
    patch(b.key, { st: "error", err: String(lastErr?.message || lastErr) });
  }

  async function runTariffOne(b: Bank) {
    patch(b.key, { st: "running", err: undefined });

    // Try both -tariff and _tariff transparently (server variations)
    const baseTries = tariffEndpointFor(b.key.replace(/_tariff$/, "").replace(/-tariff$/, ""), apiBase);
    const tries: string[] = [];
    for (const base of baseTries) {
      tries.push(base);
      if (!/[?&](show|save)=/i.test(base)) {
        tries.push(base + (base.includes("?") ? "&" : "?") + "show=true");
      }
    }

    let lastErr: any = null;
    for (const url of tries) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        const rows = coerceTariffs(data);
        onMergeTariffs(rows);
        patch(b.key, { st: "done", cnt: rows.length, ts: new Date().toLocaleString() });
        return;
      } catch (e: any) {
        lastErr = e;
      }
    }
    patch(b.key, { st: "error", err: String(lastErr?.message || lastErr) });
  }

  async function runAllSequential() {
    // 1) All rate scrapers (incl. CBSL)
    for (const b of rateBanks) { // eslint-disable-next-line no-await-in-loop
      await runRateOne(b);
    }
    // 2) All tariff scrapers
    for (const b of tariffBanks) { // eslint-disable-next-line no-await-in-loop
      await runTariffOne(b);
    }
  }

  function resetAll() {
    // Clear panel
    const EMPTY_PANEL: PanelState = { status: {}, counts: {}, errors: {}, lastRun: {} };
    setPanel(EMPTY_PANEL);
    saveJSON(LS_PANEL, EMPTY_PANEL);
    // Clear rates
    onResetRates();
    saveJSON(LS_RATES, [] as RateRow[]);
    // Clear tariffs
    onResetTariffs();
    saveJSON(LS_TARIFFS, [] as TariffRow[]);
  }

  /* ---- UI ---- */

  function Tile({ id, label, isTariff, url, onRun }: { id: string; label: string; isTariff: boolean; url: string; onRun: () => void; }) {
    const st = panel.status[id] || "idle";
    const cnt = panel.counts[id] ?? 0;
    const err = panel.errors[id];
    const ts = panel.lastRun[id];
    const tag = st.toUpperCase();

    return (
      <div className="rounded-xl p-4 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">{label}</div>
          <span
            className={
              "text-xs px-2 py-1 rounded " +
              (st === "running" ? "bg-yellow-500/20 text-yellow-300"
                : st === "done" ? "bg-green-500/20 text-green-300"
                : st === "error" ? "bg-red-500/20 text-red-300"
                : "bg-white/10 text-white/70")
            }
          >
            {tag}
          </span>
        </div>

        <div className="mt-2 text-sm text-white/70">
          Rows: <span className="text-white/90">{cnt}</span>
          {ts && <span className="ml-3">Last: {ts}</span>}
        </div>

        {err && <div className="mt-2 text-xs text-red-300 break-words">{err}</div>}

        <div className="mt-3">
          <Btn className="px-3 py-1.5 rounded-lg bg-white/10" disabled={st === "running"} onClick={onRun}>
            {st === "running" ? "Running…" : "Run"}
          </Btn>
          <a href={url} target="_blank" rel="noreferrer" className="ml-3 text-[#60a5fa] underline text-sm">
            Open endpoint
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Scraper Control Panel</h2>
        <div className="flex items-center gap-2">
          <Btn className="px-4 py-2 rounded-lg bg-white/10" onClick={resetAll}>Reset</Btn>
          <Btn className="px-4 py-2 rounded-lg bg-white/10" onClick={runAllSequential}>Run All</Btn>
        </div>
      </div>

      {/* Section 1: Rate scrapers (unchanged visually) */}
      <div>
        <div className="text-white/80 mb-2 font-semibold">Rate scrapers</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rateBanks.map((b) => (
            <Tile
              key={b.key}
              id={b.key}
              label={b.label}
              isTariff={false}
              url={/[?&](show|save)=/i.test(b.url) ? b.url : b.url + (b.url.includes("?") ? "&" : "?") + "show=true"}
              onRun={() => runRateOne(b)}
            />
          ))}
        </div>
      </div>

      {/* Section 2: Tariff scrapers (new) */}
      <div>
        <div className="text-white/80 mb-2 font-semibold">Tariff scrapers</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tariffBanks.map((b) => {
            const [dashUrl] = tariffEndpointFor(b.key.replace(/_tariff$/, "").replace(/-tariff$/, ""), apiBase);
            const openUrl = /[?&](show|save)=/i.test(dashUrl)
              ? dashUrl
              : dashUrl + (dashUrl.includes("?") ? "&" : "?") + "show=true";
            return (
              <Tile
                key={b.key}
                id={b.key}              // distinct keys like "hnb_tariff"
                label={b.label}
                isTariff={true}
                url={openUrl}
                onRun={() => runTariffOne(b)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

type CbslRow = { period: string; weekEnd: string; metric: string; rate: string; source: string; updatedAt: string };

function reduceCbslToMonthlyAwpr(rows: CbslRow[]): Record<string, number> {
  const map: Record<string, { ts: number; rate: number }> = {};
  for (const r of rows) {
    const m = ym(r.weekEnd || r.period);
    const n = parseFloat(String(r.rate));
    if (!isFinite(n)) continue;
    const ts = new Date(r.weekEnd || r.period).getTime();
    const cur = map[m];
    if (!cur || ts >= cur.ts) map[m] = { ts, rate: n };
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(map).sort()) out[k] = map[k].rate;
  return out;
}
function monthRange(minYm: string, maxYm: string): string[] {
  const [y1, m1] = minYm.split("-").map(Number);
  const [y2, m2] = maxYm.split("-").map(Number);
  const out: string[] = [];
  let y = y1, m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
function tenorKeys(): TenorKey[] { return ["1M","3M","6M","12M","24M","36M","48M","60M"]; }

function applyLiquidityPremium(
  base: number | undefined,
  lp: number | Partial<Record<TenorKey, number>> | undefined,
  tenor: TenorKey
): number | undefined {
  if (typeof base !== "number") return undefined;
  if (!lp) return base;
  if (typeof lp === "number") return base + lp;
  if (typeof lp[tenor] === "number") return base + (lp[tenor] as number);
  return base;
}

export function buildAwprFtpMultiSeries(cbslRows: CbslRow[], ftpMonths: UbFtpMonth[]) {
  const awprMonthly = reduceCbslToMonthlyAwpr(cbslRows);
  const ftpByMonth: Record<string, Partial<Record<TenorKey, number>>> = {};
  const lpByMonth: Record<string, number | Partial<Record<TenorKey, number>>> = {};

  for (const rec of ftpMonths) {
    ftpByMonth[rec.month] = rec.asset || {};
    if (rec.liquidityPremium != null) lpByMonth[rec.month] = rec.liquidityPremium;
  }

  const monthsAll = (() => {
    const ms = new Set<string>([...Object.keys(awprMonthly), ...Object.keys(ftpByMonth)]);
    const sorted = [...ms].sort();
    if (!sorted.length) return [];
    return monthRange(sorted[0], sorted[sorted.length - 1]);
  })();

  const months = monthsAll.length > 6 ? monthsAll.slice(monthsAll.length - 6) : monthsAll;

  const awprFfilled: Record<string, number | null> = {};
  let lastAwpr: number | null = null;
  for (const m of monthsAll) {
    const cur = typeof awprMonthly[m] === "number" ? awprMonthly[m] : null;
    if (cur != null) lastAwpr = cur;
    awprFfilled[m] = lastAwpr;
  }

  const rows = months.map((m) => {
    const row: any = { month: m, AWPR: awprFfilled[m] ?? null };
    for (const t of tenorKeys()) {
      let last: number | undefined = undefined;
      for (let i = monthsAll.indexOf(m); i >= 0; i--) {
        const mm = monthsAll[i];
        const base = ftpByMonth[mm]?.[t];
        const lp = lpByMonth[mm];
        const eff = applyLiquidityPremium(base, lp, t);
        if (typeof eff === "number") { last = eff; break; }
      }
      row[t] = last ?? null;
    }
    return row;
  });
  return rows as Array<{ month: string; AWPR: number | null } & Partial<Record<TenorKey, number | null>>>;
}

function AwprFtpChartMulti({
  cbslRows, ftpMonths, brand,
}: {
  cbslRows: CbslRow[];
  ftpMonths: UbFtpMonth[];
  brand: typeof BRAND;
}) {
  const data = useMemo(() => buildAwprFtpMultiSeries(cbslRows, ftpMonths), [cbslRows, ftpMonths]);

  const [activeTenors, setActiveTenors] = useState<Set<TenorKey>>(
    () => new Set<TenorKey>(["6M","12M","24M"])
  );
  function toggle(t: TenorKey) {
    setActiveTenors((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3 flex flex-wrap gap-2">
        {tenorKeys().map((t) => (
          <Btn
            key={t}
            className={`px-2.5 py-1 rounded-full text-xs ${activeTenors.has(t) ? "bg-[#3b82f6] text-white" : "bg-white/10"}`}
            onClick={() => toggle(t)}
          >
            {t}
          </Btn>
        ))}
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value) => (typeof value === "number" ? value.toFixed(2) : value)} />
          <Legend />
          <Line dataKey="AWPR" stroke={brand.Gold} dot={false} strokeWidth={2} />
          {tenorKeys().map((t) =>
            activeTenors.has(t) ? <Line key={t} dataKey={t} dot={false} strokeWidth={2} /> : null
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function FtpFileUploader({
  initialMonths, onSaveAll, onReset,
}: {
  initialMonths: UbFtpMonth[];
  onSaveAll: (months: UbFtpMonth[]) => void;
  onReset: () => void;
}) {
  const [staged, setStaged] = useState<UbFtpMonth[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  function currentYm(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  async function parseCsv(text: string): Promise<Partial<Record<TenorKey, number>>> {
    const out: Partial<Record<TenorKey, number>> = {};
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      const m =
        line.match(/([0-9]{1,2})\s*(m|y)\s*[,:\- ]\s*([0-9]+(?:\.[0-9]+)?)/i) ||
        line.match(/^\s*([0-9]{1,2})(m|y)\s+([0-9]+(?:\.[0-9]+)?)\s*$/i);
      if (!m) continue;
      const num = Number(m[1]);
      const unit = m[2].toUpperCase();
      const rate = parseFloat(m[3]);
      if (!isFinite(rate)) continue;
      let key: TenorKey | undefined;
      if (unit === "M") key = ({ 1: "1M", 3: "3M", 6: "6M", 12: "12M" } as const)[num];
      else key = ({ 1: "12M", 2: "24M", 3: "36M", 4: "48M", 5: "60M" } as const)[num];
      if (key) out[key] = rate;
    }
    return out;
  }

  function tenorKey(num: number, unit: string): TenorKey | undefined {
    return unit.toUpperCase() === "M"
      ? ({ 1: "1M", 3: "3M", 6: "6M", 12: "12M" } as const)[num]
      : ({ 1: "12M", 2: "24M", 3: "36M", 4: "48M", 5: "60M" } as const)[num];
  }
  function getPercentsFromString(line: string): number[] {
    return [...line.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g)].map((m) => parseFloat(m[1])).filter(isFinite);
  }
  function percentAt(tokens: string[], j: number): [number | undefined, number] {
    const t = tokens[j];
    let m = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*%$/);
    if (m) return [parseFloat(m[1]), 1];
    const mNum = t.match(/^([0-9]+(?:\.[0-9]+)?)$/);
    if (mNum && tokens[j + 1] === "%") return [parseFloat(mNum[1]), 2];
    return [undefined, 0];
  }

  async function parsePdf(
    file: File
  ): Promise<{ asset: Partial<Record<TenorKey, number>>; lp?: Partial<Record<TenorKey, number>> | number }> {
    const pdfjsLib = await import("pdfjs-dist");
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

    const buf = new Uint8Array(await file.arrayBuffer());
    // @ts-ignore
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;

    let allRows: string[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let lineTokens: string[] = [];
      let lastY: number | null = null;
      for (const item of content.items as any[]) {
        const [,, , , x, y] = item.transform;
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (lineTokens.length) allRows.push([...lineTokens]);
          lineTokens = [];
        }
        lastY = y;
        const text = String(item.str || "").trim();
        if (text) lineTokens.push(text);
      }
      if (lineTokens.length) allRows.push([...lineTokens]);
    }

    const tenors: TenorKey[] = ["1M", "3M", "6M", "12M", "24M", "36M", "48M", "60M"];
    const asset: Partial<Record<TenorKey, number>> = {};
    const lp: Partial<Record<TenorKey, number>> = {};

    let augHeaderIdx = -1, periodIdx = -1, assetFtpIdx = -1;
    for (let i = 0; i < allRows.length; ++i) {
      const lower = allRows[i].map(s => s.toLowerCase());
      if (lower.includes("period") && lower.includes("asset ftp")) {
        augHeaderIdx = i; periodIdx = lower.indexOf("period"); assetFtpIdx = lower.indexOf("asset ftp"); break;
      }
    }

    if (augHeaderIdx !== -1 && periodIdx !== -1 && assetFtpIdx !== -1) {
      for (let i = augHeaderIdx + 1; i < allRows.length; ++i) {
        const row = allRows[i];
        if (!row.length) continue;
        const joined = row.join(" ").toLowerCase();
        if (joined.includes("tenor") || joined.includes("liability/asset") || joined.includes("ftp - fcy")
            || (joined.includes("asset") && joined.length < 20)) break;

        const period = (row[periodIdx] || "").replace(/\s/g, "").toUpperCase();
        if (!tenors.includes(period as TenorKey)) continue;

        const assetStr = row[assetFtpIdx] || "";
        const assetNum = parseFloat(assetStr.replace(/[^0-9.]/g, ""));
        if (isFinite(assetNum)) asset[period as TenorKey] = assetNum;

        if (row.length > assetFtpIdx + 1) {
          const lpStr = row[assetFtpIdx + 1] || "";
          const lpNum = parseFloat(lpStr.replace(/[^0-9.]/g, ""));
          if (isFinite(lpNum)) lp[period as TenorKey] = lpNum;
        }
      }
      for (const tenor of tenors) {
        if (typeof asset[tenor] === "number" && typeof lp[tenor] === "number") {
          asset[tenor] = (asset[tenor] as number) + (lp[tenor] as number);
        }
      }
      const lpOut = Object.keys(lp).length ? lp : undefined;
      return { asset, lp: lpOut };
    }

    let headerRowIdx2 = -1;
    let periodIdx2 = -1, assetIdx2 = -1, lpIdx2 = -1;
    for (let i = 0; i < allRows.length; ++i) {
      const lower = allRows[i].map(s => s.toLowerCase());
      if (lower.includes("period") && (lower.includes("asset lkr") || lower.includes("asset ftp"))) {
        headerRowIdx2 = i; periodIdx2 = lower.indexOf("period");
        assetIdx2 = lower.findIndex(c => c === "asset lkr" || c === "asset ftp");
        lpIdx2 = lower.findIndex(c => c.includes("liquidity premium"));
        break;
      }
    }

    if (headerRowIdx2 !== -1 && assetIdx2 !== -1 && periodIdx2 !== -1) {
      const rows = [];
      for (let i = headerRowIdx2 + 1; i < allRows.length; ++i) {
        const rowLower = allRows[i].map(s => s.toLowerCase()).join(" ");
        if (rowLower.includes("liability") || rowLower.includes("fcy") || rowLower.includes("foreign")
            || (rowLower.includes("premium") && !rowLower.includes("liquidity")) || rowLower.includes("period")) break;
        rows.push(allRows[i]);
      }
      for (const tenor of tenors) {
        const matchRows = rows.filter(r => {
          const periodCell = r[periodIdx2] || "";
          return periodCell.replace(/\s/g, "").toUpperCase().startsWith(tenor);
        });
        if (matchRows.length) {
          const last = matchRows[matchRows.length - 1];
          let val = last[assetIdx2] || "";
          val = val.replace(/[^0-9.]/g, "");
          const num = parseFloat(val);
          if (isFinite(num)) asset[tenor] = num;

          if (lpIdx2 !== -1 && last[lpIdx2]) {
            const lpVal = parseFloat((last[lpIdx2] || "").replace(/[^0-9.]/g, ""));
            if (isFinite(lpVal)) lp[tenor] = lpVal;
          }
        }
      }
      for (const tenor of tenors) {
        if (typeof asset[tenor] === "number" && typeof lp[tenor] === "number") {
          asset[tenor] = (asset[tenor] as number) + (lp[tenor] as number);
        }
      }
      const lpOut = Object.keys(lp).length ? lp : undefined;
      return { asset, lp: lpOut };
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    const newRows: UbFtpMonth[] = [];

    for (const f of Array.from(files)) {
      try {
        const name = f.name;
        const month = inferMonthFromFilename(name) || currentYm();

        let asset: Partial<Record<TenorKey, number>> = {};
        let lpMaybe: number | Partial<Record<TenorKey, number>> | undefined;

        if (/\.(csv|txt)$/i.test(name)) {
          const text = await f.text();
          asset = await parseCsv(text);
        } else if (/\.(pdf)$/i.test(name)) {
          const parsed = await parsePdf(f);
          asset = parsed.asset || {};
          if (parsed.lp && Object.keys(parsed.lp).length) lpMaybe = parsed.lp;
        } else {
          continue;
        }

        if (Object.keys(asset).length === 0) continue;

        newRows.push({
          month,
          sourceName: name,
          asset,
          liquidityPremium: lpMaybe,
          uploadedAt: new Date().toISOString(),
        });
      } catch {
        // ignore parse errors
      }
    }

    const combined = dedupeByMonth([...staged, ...newRows]);
    setStaged(combined);
    setBusy(false);
  }

  function dedupeByMonth(arr: UbFtpMonth[]): UbFtpMonth[] {
    const map = new Map<string, UbFtpMonth>();
    for (const r of arr) map.set(r.month, r);
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  function saveAll() {
    const merged = dedupeByMonth([...initialMonths, ...staged]);
    onSaveAll(merged);
    setStaged([]);
  }
  function resetAll() { onReset(); setStaged([]); }

  const previewList = staged.length ? staged : initialMonths;

  return (
    <div className="rounded-2xl border border-white/10 p-4" style={{ backgroundColor: BRAND.card }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">FTP Uploader</div>
          <div className="text-white/70 text-sm">Upload monthly Asset FTP (CSV or PDF). Each file = one month.</div>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="ftpFile" className="cursor-pointer px-4 py-2 rounded-xl bg-white text-black font-semibold shadow hover:bg-[#60a5fa] hover:text-black transition">Browse…</label>
          <span className="text-white/70 text-sm">{files?.length ? `${files.length} file(s) selected` : "No files selected."}</span>
          {busy && <span className="text-white/60 text-sm ml-2">Parsing…</span>}
          <input
            id="ftpFile" type="file" multiple accept=".csv,.pdf,.txt"
            onChange={async (e) => { const list = e.target.files; setFiles(Array.from(list ?? [])); await handleFiles(list); e.currentTarget.value = ""; }}
            className="hidden"
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm text-white/80 mb-2">
          {staged.length
            ? `Preview (${staged.length} month${staged.length === 1 ? "" : "s"}) — not saved yet`
            : `Saved (${initialMonths.length} month${initialMonths.length === 1 ? "" : "s"})`}
        </div>
        <div className="overflow-auto rounded-xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                <th>Month</th>
                <th>Source</th>
                <th>Tenors (parsed)</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-white/5">
              {previewList.map((r) => (
                <tr key={r.month} className="border-t border-white/10">
                  <td className="px-3 py-2 font-medium">{r.month}</td>
                  <td className="px-3 py-2">{r.sourceName}</td>
                  <td className="px-3 py-2">
                    {Object.entries(r.asset)
                      .filter(([, v]) => typeof v === "number")
                      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}%`)
                      .join("  ·  ") || "—"}
                  </td>
                </tr>
              ))}
              {!previewList.length && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-white/70">No staged uploads yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn className="px-4 py-2 rounded-lg bg-white text-black disabled:opacity-60" disabled={!staged.length || busy} onClick={saveAll}>Save All</Btn>
        <Btn className="px-4 py-2 rounded-lg bg-white/10 disabled:opacity-60" disabled={busy} onClick={() => setStaged([])}>Clear Preview</Btn>
        <Btn className="px-4 py-2 rounded-lg bg-white/10 disabled:opacity-60" disabled={busy || !initialMonths.length} onClick={resetAll}>Reset</Btn>
        {busy && <span className="text-white/60 text-sm ml-2">Parsing…</span>}
      </div>
    </div>
  );
}
export default function AppWithAuth() {
  const [ok, setOk] = React.useState(false);   // always start locked
  if (!ok) return <LoginGate onSuccess={() => setOk(true)} />;
  return <UBRateAnalyst />;
}

