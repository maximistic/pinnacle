"use client";

import { useEffect, useRef, useState } from "react";

// Minimal shape of an existing MF holding — only what's needed for matching
type ExistingHolding = {
  id: string;
  name: string;
  isin: string | null;
};

export type ParsedTransaction = {
  date: string;
  description: string;
  amount: number | null;
  units: number | null;
  nav: number | null;
  balance: number | null;
  type: string | null;
};

export type ParsedFund = {
  schemeName: string;
  isin: string | null;
  folioNumber: string;
  units: number;
  investedValue: number;
  currentValue: number;
  currentNav: number;
  transactions?: ParsedTransaction[];
};

type RowState = {
  checked: boolean;
  schemeName: string;
  folioNumber: string;
  units: string;
  investedValue: string;
  currentValue: string;
  currentNav: string;
  isin: string | null;
  match: ExistingHolding | null;
  transactions?: ParsedTransaction[];
};

type Props = {
  funds: ParsedFund[];
  onSave: (rows: ParsedFund[]) => void;
};

const cellR =
  "w-full bg-transparent border border-transparent focus:border-amber/40 focus:bg-surface focus:outline-none px-1.5 py-1 text-xs font-mono text-right tabular-nums transition-colors";
const cellL =
  "w-full bg-transparent border border-transparent focus:border-amber/40 focus:bg-surface focus:outline-none px-1.5 py-1 text-sm font-sans transition-colors";
const cellLMono =
  "w-full bg-transparent border border-transparent focus:border-amber/40 focus:bg-surface focus:outline-none px-1.5 py-1 text-xs font-mono transition-colors";

function findMatch(
  fund: ParsedFund,
  holdings: ExistingHolding[]
): ExistingHolding | null {
  if (fund.isin) {
    const m = holdings.find((h) => h.isin && h.isin === fund.isin);
    if (m) return m;
  }
  const name = fund.schemeName.toLowerCase().trim();
  return holdings.find((h) => h.name.toLowerCase().trim() === name) ?? null;
}

function buildRows(
  funds: ParsedFund[],
  holdings: ExistingHolding[]
): RowState[] {
  return funds.map((f) => ({
    checked: true,
    schemeName: f.schemeName,
    folioNumber: f.folioNumber,
    units: String(f.units),
    investedValue: String(f.investedValue),
    currentValue: String(f.currentValue),
    currentNav: String(f.currentNav),
    isin: f.isin,
    match: findMatch(f, holdings),
    transactions: f.transactions,
  }));
}

export default function CASReviewTable({ funds, onSave }: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoadingHoldings(true);
    fetch("/api/holdings?type=MUTUAL_FUND")
      .then((r) => r.json())
      .then((data: ExistingHolding[]) => setRows(buildRows(funds, data)))
      .catch(() => setRows(buildRows(funds, [])))
      .finally(() => setLoadingHoldings(false));
  }, [funds]);

  const checkedCount = rows.filter((r) => r.checked).length;
  const allChecked = rows.length > 0 && checkedCount === rows.length;
  const someChecked = checkedCount > 0 && checkedCount < rows.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  function update<K extends keyof RowState>(
    idx: number,
    key: K,
    value: RowState[K]
  ) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, checked })));
  }

  function handleSave() {
    const approved = rows
      .filter((r) => r.checked)
      .map(
        (r): ParsedFund => ({
          schemeName: r.schemeName.trim(),
          isin: r.isin,
          folioNumber: r.folioNumber.trim(),
          units: parseFloat(r.units) || 0,
          investedValue: parseFloat(r.investedValue) || 0,
          currentValue: parseFloat(r.currentValue) || 0,
          currentNav: parseFloat(r.currentNav) || 0,
          transactions: r.transactions,
        })
      );
    onSave(approved);
  }

  if (loadingHoldings) {
    return (
      <div className="text-xs text-muted py-8 text-center animate-pulse">
        Checking against existing holdings…
      </div>
    );
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-muted">
          {checkedCount} of {rows.length} fund
          {rows.length !== 1 ? "s" : ""} selected — edit any field inline before
          saving
        </p>
        <button
          onClick={handleSave}
          disabled={checkedCount === 0}
          className="px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-30 transition-opacity"
        >
          Confirm &amp; Save
        </button>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto border border-edge">
        <table className="w-full border-collapse" style={{ minWidth: 920 }}>
          <thead>
            <tr className="bg-surface border-b border-edge text-muted text-[10px] uppercase tracking-widest">
              <th className="px-3 py-2.5 w-9">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="accent-amber"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Scheme Name</th>
              <th className="px-3 py-2.5 text-left font-medium">Folio No</th>
              <th className="px-3 py-2.5 text-right font-medium">Units</th>
              <th className="px-3 py-2.5 text-right font-medium">Invested (₹)</th>
              <th className="px-3 py-2.5 text-right font-medium">Current (₹)</th>
              <th className="px-3 py-2.5 text-right font-medium">NAV</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-edge transition-colors ${
                  row.checked ? "hover:bg-white/1.5" : "opacity-40"
                }`}
              >
                {/* Checkbox */}
                <td className="px-3 py-1.5 text-center w-9">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => update(i, "checked", e.target.checked)}
                    className="accent-amber"
                  />
                </td>

                {/* Scheme Name */}
                <td className="px-1.5 py-1 min-w-60">
                  <input
                    type="text"
                    value={row.schemeName}
                    onChange={(e) => update(i, "schemeName", e.target.value)}
                    className={cellL}
                  />
                </td>

                {/* Folio No */}
                <td className="px-1.5 py-1 min-w-27.5">
                  <input
                    type="text"
                    value={row.folioNumber}
                    onChange={(e) => update(i, "folioNumber", e.target.value)}
                    className={cellLMono}
                  />
                </td>

                {/* Units */}
                <td className="px-1.5 py-1 w-24">
                  <input
                    type="number"
                    value={row.units}
                    onChange={(e) => update(i, "units", e.target.value)}
                    step="any"
                    min="0"
                    className={cellR}
                  />
                </td>

                {/* Invested */}
                <td className="px-1.5 py-1 w-28">
                  <input
                    type="number"
                    value={row.investedValue}
                    onChange={(e) =>
                      update(i, "investedValue", e.target.value)
                    }
                    step="any"
                    min="0"
                    className={cellR}
                  />
                </td>

                {/* Current */}
                <td className="px-1.5 py-1 w-28">
                  <input
                    type="number"
                    value={row.currentValue}
                    onChange={(e) =>
                      update(i, "currentValue", e.target.value)
                    }
                    step="any"
                    min="0"
                    className={cellR}
                  />
                </td>

                {/* NAV */}
                <td className="px-1.5 py-1 w-24">
                  <input
                    type="number"
                    value={row.currentNav}
                    onChange={(e) => update(i, "currentNav", e.target.value)}
                    step="any"
                    min="0"
                    className={cellR}
                  />
                </td>

                {/* Status badge */}
                <td className="px-3 py-1.5 min-w-45">
                  {row.match ? (
                    <span className="inline-flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase tracking-widest text-amber/70">
                        Will merge with existing:
                      </span>
                      <span className="text-[10px] font-medium text-amber leading-tight">
                        {row.match.name}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 bg-gain/10 text-gain border border-gain/30">
                      New holding
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom save button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={checkedCount === 0}
          className="px-6 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-30 transition-opacity"
        >
          Confirm &amp; Save
        </button>
      </div>
    </div>
  );
}
