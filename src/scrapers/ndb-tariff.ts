import fs from "fs/promises";
import os from "os";
import path from "path";
import { chromium, Page } from "playwright";
import fetch from "node-fetch";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { acceptAnyCookie } from "../utils/dom";

export interface FeeRow {
  bank: string;
  product: string;
  feeType: string;
  description: string;
  amount: string;
  notes?: string;
  updatedAt: string;
  source: string;
}

type PdfItem = {
  str: string;
  x: number;
  y: number;
  page: number;
  width: number;
  height: number;
};

type Cell = { x: number; str: string };

type Row = {
  page: number;
  y: number;
  cells: Cell[];
  text: string;
};

const PDF_URL = "https://ndbbankweb.ndbbank.com/images/download/pdf/1754026295Tariff_-Final_web.pdf";
const BANK = "NDB Bank";
const nowISO = () => new Date().toISOString();

const clean = (s?: string | null) => (s ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

async function downloadPdfBytes(page: Page): Promise<Uint8Array> {
  const tmpFile = path.join(
    os.tmpdir(),
    `ndb-tariff-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`
  );

  const waitForDownload = page.waitForEvent("download", { timeout: 45000 }).catch(() => null);
  let gotoErr: unknown;
  try {
    await page.goto(PDF_URL, { waitUntil: "networkidle", timeout: 45000 });
  } catch (err) {
    gotoErr = err;
  }

  const download = await waitForDownload;
  if (download) {
    await download.saveAs(tmpFile);
    const data = await fs.readFile(tmpFile);
    await fs.unlink(tmpFile).catch(() => {});
    return new Uint8Array(data);
  }

  if (gotoErr) {
    const msg = String((gotoErr as Error)?.message || gotoErr || "");
    if (!/Download is starting/i.test(msg)) throw gotoErr;
  }

  const res = await fetch(PDF_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${PDF_URL}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function parsePdfRows(pdfBytes: Uint8Array): Promise<Row[]> {
  const pdf = await getDocument({ data: pdfBytes }).promise;
  const items: PdfItem[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    for (const item of textContent.items as any[]) {
      const transform = item.transform as number[];
      const x = transform[4];
      const y = viewport.height - transform[5];
      const str = clean(item.str);
      if (!str) continue;
      items.push({
        str,
        x,
        y,
        page: pageNo,
        width: item.width ?? 0,
        height: item.height ?? 0,
      });
    }
  }

  return groupRows(items);
}

async function renderPdfPreview(page: Page, pdfBytes: Uint8Array) {
  const base64 = Buffer.from(pdfBytes).toString("base64");
  const html = `
    <html>
      <body style="margin:0;background:#111;">
        <iframe
          src="data:application/pdf;base64,${base64}"
          style="border:0;width:100%;height:100vh;"
          allow="fullscreen"
        ></iframe>
      </body>
    </html>
  `;
  await page.goto("about:blank");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await gentleScroll(page);
}

function toRow(page: number, y: number, cells: Cell[]): Row {
  const cleaned = cells
    .map((c) => ({ x: c.x, str: clean(c.str) }))
    .filter((c) => c.str.length > 0)
    .sort((a, b) => a.x - b.x);

  const text = cleaned.map((c) => c.str).join(" ").trim();
  return { page, y, cells: cleaned, text };
}

function groupRows(items: PdfItem[], yTolerance = 2): Row[] {
  const byPage = new Map<number, PdfItem[]>();
  for (const item of items) {
    if (!item.str) continue;
    const list = byPage.get(item.page);
    if (list) list.push(item);
    else byPage.set(item.page, [item]);
  }

  const rows: Row[] = [];
  for (const [page, arr] of byPage.entries()) {
    arr.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    let current: Cell[] = [];
    let lastY = -Infinity;
    for (const item of arr) {
      if (!current.length || Math.abs(item.y - lastY) <= yTolerance) {
        current.push({ x: item.x, str: item.str });
      } else {
        if (current.length) rows.push(toRow(page, lastY, current));
        current = [{ x: item.x, str: item.str }];
      }
      lastY = item.y;
    }
    if (current.length) rows.push(toRow(page, lastY, current));
  }

  rows.sort((a, b) => (a.page === b.page ? a.y - b.y : a.page - b.page));
  return rows;
}

function cloneRow(row: Row): Row {
  return {
    page: row.page,
    y: row.y,
    text: row.text,
    cells: row.cells.map((c) => ({ x: c.x, str: c.str })),
  };
}

function makeRow(
  product: string,
  feeType: string,
  description: string,
  amount: string,
  now: string,
  notes?: string
): FeeRow {
  return {
    bank: BANK,
    product,
    feeType,
    description,
    amount,
    notes,
    updatedAt: now,
    source: PDF_URL,
  };
}

function parsePersonal(rows: Row[], now: string): FeeRow[] {
  const out: FeeRow[] = [];
  const personalRows = rows.filter((r) => r.page === 21);

  const processingIdx = personalRows.findIndex((r) => /Loan Amount/i.test(r.text));
  if (processingIdx >= 0) {
    for (let i = processingIdx + 1; i < personalRows.length; i++) {
      const row = personalRows[i];
      if (/11\.7/i.test(row.text)) break;
      const values = row.cells.map((c) => c.str).filter(Boolean);
      if (values.length < 4) continue;
      const amounts = values.slice(-3);
      const loanLabel = clean(values.slice(0, values.length - 3).join(" "));
      if (!loanLabel) continue;
      const [standard, fastTrack, mortgaged] = amounts;
      if (standard)
        out.push(makeRow("Personal Loan", "Processing Fee - Standard", loanLabel, standard, now));
      if (fastTrack)
        out.push(makeRow("Personal Loan", "Processing Fee - Fast Track", loanLabel, fastTrack, now));
      if (mortgaged)
        out.push(makeRow("Personal Loan", "Processing Fee - Mortgaged Back", loanLabel, mortgaged, now));
    }
  }

  const doctorRow = personalRows.find((r) => /Doctor Category/i.test(r.text));
  if (doctorRow && doctorRow.cells[1]) {
    out.push(
      makeRow(
        "Personal Loan",
        "Early Settlement Fee",
        "Dream Maker Loan - Doctor category",
        doctorRow.cells[1].str,
        now
      )
    );
  }

  const otherRow = personalRows.find((r) => /all other categories/i.test(r.text));
  if (otherRow && otherRow.cells[1]) {
    out.push(
      makeRow(
        "Personal Loan",
        "Early Settlement Fee",
        "Dream Maker Loan - Other categories",
        otherRow.cells[1].str,
        now
      )
    );
  }

  const topUpHeaderIdx = personalRows.findIndex((r) => /Previous DML rate/i.test(r.text));
  if (topUpHeaderIdx >= 0) {
    const body: Row[] = [];
    for (let i = topUpHeaderIdx + 1; i < personalRows.length; i++) {
      const row = personalRows[i];
      if (/11\.9/i.test(row.text) || /Penal\/Default/i.test(row.text)) break;
      body.push(row);
    }

    const merged: Row[] = [];
    for (let i = 0; i < body.length; i++) {
      const base = cloneRow(body[i]);
      if (!base.cells.length) continue;
      const first = base.cells[0]?.str ?? "";
      const normalizedFirst = first.trim();
      if (!/^[A-F]/i.test(normalizedFirst)) continue;

      if (/^F$/i.test(normalizedFirst) && i + 1 < body.length) {
        const continuation = body[i + 1];
        const contFirst = continuation.cells[0]?.str ?? "";
        if (!/^[A-F]/i.test((contFirst || "").trim())) {
          base.cells.push(...continuation.cells.map((c) => ({ x: c.x, str: c.str })));
          i++;
        }
      }

      base.cells = base.cells
        .map((c) => ({ x: c.x, str: clean(c.str) }))
        .filter((c) => c.str.length > 0)
        .sort((a, b) => a.x - b.x);
      base.text = clean(base.cells.map((c) => c.str).join(" "));
      merged.push(base);
    }

    for (const row of merged) {
      const prevLabel = clean(row.cells.filter((c) => c.x < 200).map((c) => c.str).join(" "));
      if (!/^[A-F]/i.test(prevLabel)) continue;
      const newLabel = clean(
        row.cells
          .filter((c) => c.x >= 200 && c.x < 360)
          .map((c) => c.str)
          .join(" ")
      );
      const generalVal = clean(
        row.cells
          .filter((c) => c.x >= 360 && c.x < 450)
          .map((c) => c.str)
          .join(" ")
      );
      const medicalVal = clean(
        row.cells
          .filter((c) => c.x >= 450)
          .map((c) => c.str)
          .join(" ")
      );
      const desc = clean(`${prevLabel} -> ${newLabel}`);
      if (generalVal)
        out.push(
          makeRow(
            "Personal Loan",
            "Top-up Fee - General",
            desc,
            generalVal,
            now,
            "Customer segment: General"
          )
        );
      if (medicalVal)
        out.push(
          makeRow(
            "Personal Loan",
            "Top-up Fee - Medical Officers",
            desc,
            medicalVal,
            now,
            "Customer segment: Medical officers"
          )
        );
    }
  }

  const penalRow = personalRows.find((r) => /Penal\/Default Interest/i.test(r.text) && r.cells.length > 1);
  if (penalRow && penalRow.cells[1]) {
    out.push(
      makeRow(
        "Personal Loan",
        "Penal/Default Interest",
        "Dream Maker Loan",
        penalRow.cells[1].str,
        now
      )
    );
  }

  return out;
}
function parseHousing(rows: Row[], now: string): FeeRow[] {
  const out: FeeRow[] = [];
  const housingRows = rows.filter((r) => r.page === 22);
  const start = housingRows.findIndex((r) => /11\.10 Housing Loans/i.test(r.text));
  if (start < 0) return out;

  for (let i = start + 1; i < housingRows.length; i++) {
    const row = housingRows[i];
    if (/11\.11/i.test(row.text)) break;
    if (row.cells.length < 2) continue;
    const label = row.cells[0].str;
    const amount = row.cells[1].str;
    if (!amount) continue;
    out.push(makeRow("Home Loan", label, "Housing Loans", amount, now));
  }

  out.push(...parseHousingLegal(rows, now));
  return out;
}

function parseHousingLegal(rows: Row[], now: string): FeeRow[] {
  const legalRows = rows.filter((r) => r.page === 27);
  if (!legalRows.length) return [];

  const sections = [
    { title: "Housing - Primary Bonds", match: /12\.5 Housing - Primary Bonds/i },
    { title: "Housing - Further Bonds", match: /12\.6 Housing - Further Bonds/i },
    { title: "Other (Ancillary Work)", match: /12\.7 Other \(Ancillary Work\s*\)/i },
  ];

  const indexed = sections
    .map((section) => ({ section, index: legalRows.findIndex((row) => section.match.test(row.text)) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (!indexed.length) return [];

  const out: FeeRow[] = [];

  for (let i = 0; i < indexed.length; i++) {
    const { section, index } = indexed[i];
    const nextIndex = i + 1 < indexed.length ? indexed[i + 1].index : legalRows.length;
    const slice = legalRows.slice(index + 1, nextIndex);
    const lines = normalizeSectionLines(slice);

    for (const line of lines) {
      if (!line.description) continue;
      out.push(
        makeRow(
          "Home Loan",
          line.description,
          section.title,
          line.amount,
          now
        )
      );
    }
  }

  return out;
}

function normalizeSectionLines(rows: Row[]): Array<{ description: string; amount: string }> {
  const merged: Array<{ description: string; amount: string }> = [];

  for (const row of rows) {
    const desc = clean(
      row.cells
        .filter((cell) => cell.x < 200)
        .map((cell) => cell.str)
        .join(" ")
    );
    const amount = clean(
      row.cells
        .filter((cell) => cell.x >= 200)
        .map((cell) => cell.str)
        .join(" ")
    );

    if (!desc && !amount) continue;

    if (desc && !amount) {
      if (merged.length) {
        merged[merged.length - 1].description = clean(
          `${merged[merged.length - 1].description} ${desc}`
        );
      }
      continue;
    }

    if (!desc && amount) {
      if (merged.length) {
        merged[merged.length - 1].amount = clean(
          `${merged[merged.length - 1].amount} ${amount}`
        );
      }
      continue;
    }

    merged.push({ description: desc, amount });
  }

  return merged;
}

async function gentleScroll(page: Page) {
  for (let i = 0; i < 6; i++) {
    try {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(120);
    } catch {
      break;
    }
  }
  try { await page.keyboard.press("Home"); } catch {}
}

export async function scrapeNdbTariff(opts?: { show?: boolean; slow?: number }): Promise<FeeRow[]> {
  const browser = await chromium.launch({
    headless: !opts?.show,
    slowMo: opts?.slow && opts.slow > 0 ? opts.slow : undefined,
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage({ viewport: { width: 1366, height: 900 } });
  const now = nowISO();

  try {
    await page.goto("https://www.ndbbank.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await acceptAnyCookie(page);

    const pdfBytes = await downloadPdfBytes(page);
    const rows = await parsePdfRows(pdfBytes);
    await renderPdfPreview(page, pdfBytes);

    const out: FeeRow[] = [];
    out.push(...parsePersonal(rows, now));
    out.push(...parseHousing(rows, now));

    return out;
  } finally {
    await context.close().catch(() => {});
    await browser.close();
  }
}

export default scrapeNdbTariff;










