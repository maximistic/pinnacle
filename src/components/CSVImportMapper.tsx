"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import type { TypeOption } from "@/components/HoldingsTable";

// ── Shared type (imported by HoldingsTable) ───────────────────────────────────

export type ImportRow = {
  idx: number;
  type: string;
  name: string;
  isin: string;
  folioNumber: string;
  quantity: string;
  investedValue: string;
  currentValue: string;
  notes: string;
  include: boolean;
};

// ── Internal types ────────────────────────────────────────────────────────────

type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  patterns: string[];
  hint?: string;
};

type Mapping = Record<string, string>; // fieldKey → csvHeader | "" (skip)

// ── Field definitions per asset type ─────────────────────────────────────────

function getFieldDefs(
  fixedType: string | undefined,
  showIsin: boolean,
  showFolioNumber: boolean,
  typeOptions: TypeOption[] | undefined,
  quantityLabel: string
): FieldDef[] {
  if (fixedType === "MUTUAL_FUND") {
    const defs: FieldDef[] = [
      {
        key: "name", label: "Name", required: true,
        patterns: ["name", "fund name", "scheme name", "scheme", "fund", "mutual fund"],
      },
      {
        key: "units", label: quantityLabel, required: true,
        patterns: ["units", "unit balance", "quantity", "qty", "balance", "unit", "no of units"],
      },
      {
        key: "avgNav", label: "Avg NAV", required: false,
        patterns: ["avg nav", "average nav", "avg price", "purchase nav", "average price", "cost nav", "avg. nav"],
        hint: "Invested Value = Units × Avg NAV",
      },
      {
        key: "currentNav", label: "Current NAV", required: false,
        patterns: ["current nav", "nav", "latest nav", "closing nav", "close nav", "redemption nav", "repurchase nav"],
        hint: "Current Value = Units × Current NAV",
      },
      {
        key: "currentValue", label: "Current Value", required: false,
        patterns: ["current value", "market value", "present value", "mkt value", "valuation"],
      },
    ];
    if (showIsin) defs.splice(1, 0, { key: "isin", label: "ISIN", required: false, patterns: ["isin"] });
    if (showFolioNumber) defs.push({
      key: "folioNumber", label: "Folio Number", required: false,
      patterns: ["folio", "folio number", "folio no", "folio no."],
    });
    defs.push({ key: "notes", label: "Notes", required: false, patterns: ["notes", "remarks", "comment"] });
    return defs;
  }

  if (fixedType === "STOCK") {
    const defs: FieldDef[] = [
      {
        key: "name", label: "Name", required: true,
        patterns: ["name", "scrip", "symbol", "stock", "company", "security", "instrument",
          "stock name", "trading symbol", "nse symbol", "bse symbol", "ticker"],
      },
      {
        key: "quantity", label: quantityLabel, required: true,
        patterns: ["qty available", "quantity", "qty", "shares", "holdings", "share qty",
          "qty.", "no. of shares", "number of shares"],
      },
      {
        key: "avgPrice", label: "Avg Price", required: false,
        patterns: ["avg price", "average price", "avg cost", "average cost", "buy avg",
          "purchase price", "avg buy price", "avg. price", "average buy price"],
        hint: "Invested Value = Qty × Avg Price",
      },
      {
        key: "currentValue", label: "Current Value", required: false,
        patterns: ["current value", "market value", "present value", "mkt value", "market val"],
      },
      {
        key: "priceCol", label: "Price (→ Current Value)", required: false,
        patterns: ["previous closing", "ltp", "last price", "closing price", "current price",
          "close", "price", "market price", "last traded price", "close price", "cmp"],
        hint: "Current Value = Qty × this price (used if Current Value not mapped)",
      },
    ];
    if (showIsin) defs.splice(1, 0, { key: "isin", label: "ISIN", required: false, patterns: ["isin"] });
    defs.push({ key: "notes", label: "Notes", required: false, patterns: ["notes", "remarks", "comment"] });
    return defs;
  }

  // Others / generic
  return [
    {
      key: "name", label: "Name", required: true,
      patterns: ["name", "asset name", "instrument", "security", "description", "holding name"],
    },
    ...(typeOptions
      ? [{ key: "type", label: "Type", required: false, patterns: ["type", "asset type", "category", "sub type", "class"] }]
      : []),
    {
      key: "investedValue", label: "Invested Value", required: false,
      patterns: ["invested value", "invested", "investment", "cost", "purchase value", "amount invested", "principal"],
    },
    {
      key: "currentValue", label: "Current Value", required: false,
      patterns: ["current value", "market value", "present value", "value", "current amount", "maturity value"],
    },
    { key: "notes", label: "Notes", required: false, patterns: ["notes", "remarks", "comment"] },
  ];
}

// ── Fuzzy auto-mapper ─────────────────────────────────────────────────────────

function matchScore(header: string, patterns: string[]): number {
  const h = header.toLowerCase().trim();
  for (const p of patterns) {
    if (h === p) return 3;
    if (h.includes(p)) return 2;
    if (p.includes(h) && h.length >= 3) return 1;
  }
  return 0;
}

function autoMap(
  headers: string[],
  fields: FieldDef[]
): { mapping: Mapping; autoKeys: Set<string> } {
  const mapping: Mapping = {};
  const autoKeys = new Set<string>();
  const usedHeaders = new Set<string>();

  const candidates: { fieldKey: string; header: string; score: number }[] = [];
  for (const field of fields) {
    for (const header of headers) {
      const score = matchScore(header, field.patterns);
      if (score > 0) candidates.push({ fieldKey: field.key, header, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const { fieldKey, header } of candidates) {
    if (!mapping[fieldKey] && !usedHeaders.has(header)) {
      mapping[fieldKey] = header;
      autoKeys.add(fieldKey);
      usedHeaders.add(header);
    }
  }

  return { mapping, autoKeys };
}

// ── Row transformer (mapping → ImportRow[]) ───────────────────────────────────

function transformRows(
  data: Record<string, string>[],
  mapping: Mapping,
  fixedType: string | undefined,
  typeOptions: TypeOption[] | undefined
): ImportRow[] {
  return data.map((row, idx) => {
    const get = (key: string): string => {
      const header = mapping[key];
      if (!header) return "";
      return (row[header] ?? "").trim();
    };

    const name = get("name");
    const isin = get("isin");
    const folioNumber = get("folioNumber");
    const notes = get("notes");

    // Quantity (stocks) or units (MF)
    const rawQty = get("quantity") || get("units");

    // Invested value: direct or computed from avgPrice/avgNav × qty
    let investedValue = get("investedValue");
    if (!investedValue) {
      const avgPrice = get("avgPrice") || get("avgNav");
      if (avgPrice && rawQty) {
        const v = parseFloat(avgPrice) * parseFloat(rawQty);
        if (!isNaN(v)) investedValue = v.toFixed(2);
      }
    }

    // Current value: direct or computed from priceCol/currentNav × qty
    let currentValue = get("currentValue");
    if (!currentValue) {
      const price = get("priceCol") || get("currentNav");
      if (price && rawQty) {
        const v = parseFloat(price) * parseFloat(rawQty);
        if (!isNaN(v)) currentValue = v.toFixed(2);
      }
    }

    const rawType = get("type");
    const resolvedType =
      fixedType ??
      typeOptions?.find((o) => o.value === rawType || o.label.toLowerCase() === rawType.toLowerCase())?.value ??
      typeOptions?.[0]?.value ??
      rawType;

    return {
      idx,
      type: resolvedType ?? "",
      name,
      isin,
      folioNumber,
      quantity: rawQty,
      investedValue,
      currentValue,
      notes,
      include: !!name.trim(),
    };
  });
}

// ── Preview helpers ───────────────────────────────────────────────────────────

function previewRawRow(
  row: Record<string, string>,
  mapping: Mapping
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, header] of Object.entries(mapping)) {
    if (header) out[key] = (row[header] ?? "").trim();
  }
  return out;
}

function computedPreview(
  rawRow: Record<string, string>
): { invested?: string; current?: string } {
  const qty = rawRow["quantity"] || rawRow["units"];
  const avgPrice = rawRow["avgPrice"] || rawRow["avgNav"];
  const price = rawRow["priceCol"] || rawRow["currentNav"];

  const invested =
    !rawRow["investedValue"] && avgPrice && qty
      ? (() => { const v = parseFloat(avgPrice) * parseFloat(qty); return isNaN(v) ? undefined : v.toFixed(2); })()
      : undefined;

  const current =
    !rawRow["currentValue"] && price && qty
      ? (() => { const v = parseFloat(price) * parseFloat(qty); return isNaN(v) ? undefined : v.toFixed(2); })()
      : undefined;

  return { invested, current };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  file: File;
  fixedType?: string;
  typeOptions?: TypeOption[];
  showQuantity: boolean;
  quantityLabel: string;
  showIsin: boolean;
  showFolioNumber: boolean;
  storageKey: string;
  onMapped: (rows: ImportRow[]) => void;
  onClose: () => void;
};

const selCls =
  "w-full px-2 py-1.5 text-xs font-mono border bg-background text-foreground focus:outline-none transition-colors";

export default function CSVImportMapper({
  file,
  fixedType,
  typeOptions,
  showQuantity,
  quantityLabel,
  showIsin,
  showFolioNumber,
  storageKey,
  onMapped,
  onClose,
}: Props) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [autoKeys, setAutoKeys] = useState<Set<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);

  const fieldDefs = getFieldDefs(fixedType, showIsin, showFolioNumber, typeOptions, quantityLabel);
  const requiredFields = fieldDefs.filter((f) => f.required);
  const canProceed = requiredFields.every((f) => !!mapping[f.key]);

  // Derived notes
  const stockPriceNote =
    fixedType === "STOCK" && !!mapping["priceCol"] && !mapping["currentValue"]
      ? mapping["priceCol"]
      : null;
  const mfNavNote =
    fixedType === "MUTUAL_FUND" && !!mapping["currentNav"] && !mapping["currentValue"]
      ? mapping["currentNav"]
      : null;

  // Parse on mount
  useEffect(() => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const hdrs = (results.meta.fields ?? []) as string[];
        const data = results.data as Record<string, string>[];

        if (hdrs.length === 0) {
          setParseError("No columns found in this CSV file.");
          setLoading(false);
          return;
        }

        setHeaders(hdrs);
        setRawData(data);

        // Auto-map
        const { mapping: auto, autoKeys: ak } = autoMap(hdrs, fieldDefs);

        // Overlay saved mapping (only for headers that exist in this file)
        let savedMapping: Partial<Mapping> = {};
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) savedMapping = JSON.parse(raw) as Mapping;
        } catch { /* ignore */ }

        const merged: Mapping = { ...auto };
        const sk = new Set<string>();
        for (const [fieldKey, savedHeader] of Object.entries(savedMapping)) {
          if (typeof savedHeader === "string" && hdrs.includes(savedHeader)) {
            if (!ak.has(fieldKey)) {
              merged[fieldKey] = savedHeader;
              sk.add(fieldKey);
            }
          }
        }

        setMapping(merged);
        setAutoKeys(ak);
        setSavedKeys(sk);
        setLoading(false);
      },
      error: () => {
        setParseError("Could not parse the CSV. Make sure it is a valid CSV file.");
        setLoading(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key: string, value: string) {
    setMapping((prev) => ({ ...prev, [key]: value }));
    // If manually changed, remove auto/saved badge
    setAutoKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
    setSavedKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
  }

  function handleProceed() {
    if (!canProceed) return;
    try { localStorage.setItem(storageKey, JSON.stringify(mapping)); } catch { /* ignore */ }
    const rows = transformRows(rawData, mapping, fixedType, typeOptions);
    onMapped(rows);
  }

  // Live preview
  const previewSlice = rawData.slice(0, 3);
  const previewRaws = previewSlice.map((row) => previewRawRow(row, mapping));
  const previewComputed = previewRaws.map(computedPreview);
  const mappedFieldKeys = fieldDefs.filter((f) => mapping[f.key]);
  const showComputedInvested = previewComputed.some((c) => c.invested);
  const showComputedCurrent = previewComputed.some((c) => c.current);

  // ── Error state ─────────────────────────────────────────────────────────────

  if (parseError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm border border-edge bg-surface p-6 space-y-4">
          <h2 className="text-[10px] uppercase tracking-widest text-muted">CSV Parse Error</h2>
          <p className="text-xs text-loss">{parseError}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm border border-edge bg-surface p-6">
          <p className="text-xs text-muted animate-pulse">Reading CSV columns…</p>
        </div>
      </div>
    );
  }

  // ── Main mapper UI ───────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl border border-edge bg-surface max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-edge flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[10px] uppercase tracking-widest text-muted font-semibold">
              Map your CSV columns
            </h2>
            <p className="text-[10px] text-muted/50 mt-0.5">
              {headers.length} column{headers.length !== 1 ? "s" : ""} detected
              &nbsp;·&nbsp;{rawData.length} row{rawData.length !== 1 ? "s" : ""}
              &nbsp;·&nbsp;{file.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors text-sm ml-4 shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">

          {/* ── Mapper grid ──────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-2">
            <div className="grid grid-cols-[180px_1fr_40px] gap-x-3 gap-y-2.5 items-start">

              {/* Column labels */}
              <div className="text-[9px] uppercase tracking-widest text-muted/50 pb-1">App field</div>
              <div className="text-[9px] uppercase tracking-widest text-muted/50 pb-1">CSV column</div>
              <div />

              {fieldDefs.map((field) => {
                const val = mapping[field.key] ?? "";
                const isAuto = autoKeys.has(field.key);
                const isSaved = savedKeys.has(field.key);

                return [
                  // Field label
                  <div key={`${field.key}-label`} className="pt-1.5 leading-snug">
                    <span className="text-xs text-foreground">{field.label}</span>
                    {field.required && <span className="text-loss text-xs ml-0.5">*</span>}
                    {field.hint && (
                      <p className="text-[9px] text-muted/50 mt-0.5 leading-snug">{field.hint}</p>
                    )}
                  </div>,

                  // CSV column selector
                  <select
                    key={`${field.key}-select`}
                    value={val}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className={`${selCls} ${
                      val && isAuto
                        ? "border-amber/50 bg-amber/3 text-foreground"
                        : val && isSaved
                        ? "border-edge/70 bg-edge/10 text-foreground"
                        : val
                        ? "border-edge/60 text-foreground"
                        : "border-edge text-muted"
                    }`}
                  >
                    <option value="" style={{ background: "var(--surface)" }}>— Skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h} style={{ background: "var(--surface)" }}>
                        {h}
                      </option>
                    ))}
                  </select>,

                  // Badge
                  <div key={`${field.key}-badge`} className="pt-1.5 text-right">
                    {isAuto && val && (
                      <span className="text-[8px] uppercase tracking-widest text-amber/60 font-mono">auto</span>
                    )}
                    {isSaved && val && (
                      <span className="text-[8px] uppercase tracking-widest text-muted/40 font-mono">saved</span>
                    )}
                  </div>,
                ];
              })}
            </div>
          </div>

          {/* Price / NAV note */}
          {(stockPriceNote || mfNavNote) && (
            <div className="mx-5 mt-1 mb-3 px-3 py-2 border border-amber/20 bg-amber/5 flex items-start gap-2">
              <span className="text-amber text-xs shrink-0">ℹ</span>
              <p className="text-[10px] text-muted leading-snug">
                {stockPriceNote && (
                  <>Current Value will be calculated as Quantity ×{" "}
                    <span className="font-mono text-foreground">{stockPriceNote}</span></>
                )}
                {mfNavNote && (
                  <>Current Value will be calculated as Units ×{" "}
                    <span className="font-mono text-foreground">{mfNavNote}</span></>
                )}
              </p>
            </div>
          )}

          {/* ── Preview ──────────────────────────────────────────────────── */}
          {mappedFieldKeys.length > 0 && rawData.length > 0 && (
            <div className="px-5 pb-5">
              <p className="text-[9px] uppercase tracking-widest text-muted/60 mb-2 mt-1">
                Preview — first {previewSlice.length} row{previewSlice.length !== 1 ? "s" : ""}
              </p>
              <div className="overflow-x-auto border border-edge">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-edge bg-surface/60">
                      {mappedFieldKeys.map((f) => (
                        <th
                          key={f.key}
                          className="px-3 py-1.5 text-left text-[9px] uppercase tracking-widest text-muted font-medium whitespace-nowrap"
                        >
                          {f.label}
                        </th>
                      ))}
                      {showComputedInvested && (
                        <th className="px-3 py-1.5 text-right text-[9px] uppercase tracking-widest text-amber/60 font-medium whitespace-nowrap">
                          Invested (calc)
                        </th>
                      )}
                      {showComputedCurrent && (
                        <th className="px-3 py-1.5 text-right text-[9px] uppercase tracking-widest text-amber/60 font-medium whitespace-nowrap">
                          Current (calc)
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRaws.map((rawRow, i) => {
                      const comp = previewComputed[i];
                      return (
                        <tr key={i} className="border-b border-edge last:border-0">
                          {mappedFieldKeys.map((f) => (
                            <td
                              key={f.key}
                              className="px-3 py-1.5 font-mono text-[10px] text-foreground whitespace-nowrap"
                            >
                              {rawRow[f.key] || (
                                <span className="text-muted/25">—</span>
                              )}
                            </td>
                          ))}
                          {showComputedInvested && (
                            <td className="px-3 py-1.5 font-mono text-[10px] text-amber/70 text-right whitespace-nowrap">
                              {comp.invested || <span className="text-muted/25">—</span>}
                            </td>
                          )}
                          {showComputedCurrent && (
                            <td className="px-3 py-1.5 font-mono text-[10px] text-amber/70 text-right whitespace-nowrap">
                              {comp.current || <span className="text-muted/25">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-edge flex items-center justify-between shrink-0">
          <p className="text-[10px] text-muted/50">
            {rawData.length} row{rawData.length !== 1 ? "s" : ""} will proceed to review
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleProceed}
              disabled={!canProceed}
              className="px-4 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Proceed to Review →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
