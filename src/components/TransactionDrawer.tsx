"use client";

import { useEffect, useState } from "react";
import type { Holding } from "@/components/HoldingsTable";

type Transaction = {
  id: string;
  holdingId: string;
  date: string;
  description: string;
  amount: number | null;
  units: number | null;
  nav: number | null;
  balance: number | null;
  type: string | null;
};

type Props = {
  holding: Holding | null;
  onClose: () => void;
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TransactionDrawer({ holding, onClose }: Props) {
  const isOpen = holding !== null;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Fetch transactions when holding changes
  useEffect(() => {
    if (!holding) { setTransactions([]); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/holdings/${holding.id}/transactions`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Transaction[]>; })
      .then(setTransactions)
      .catch(() => setError("Could not load transaction history."))
      .finally(() => setLoading(false));
  }, [holding?.id]);

  const gain       = holding ? holding.currentValue - holding.investedValue : 0;
  const gainPct    = holding?.investedValue ? (gain / holding.investedValue) * 100 : 0;
  const avgNav     = holding?.quantity ? holding.currentValue / holding.quantity : null;

  return (
    <>
      {/* Dim overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-[540px] max-w-[95vw] flex flex-col bg-surface border-l border-edge shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {holding && (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-edge flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Mutual Fund</p>
                <h2 className="text-sm font-medium text-foreground leading-snug break-words">
                  {holding.name}
                </h2>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                  {holding.folioNumber && (
                    <span className="text-[10px] font-mono text-muted">
                      Folio: {holding.folioNumber}
                    </span>
                  )}
                  {holding.isin && (
                    <span className="text-[10px] font-mono text-muted">
                      ISIN: {holding.isin}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 text-muted hover:text-foreground transition-colors text-sm leading-none mt-0.5"
              >
                ✕
              </button>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-edge shrink-0">
              <div className="px-4 py-3 border-r border-edge">
                <p className="text-[9px] uppercase tracking-widest text-muted mb-1">Units</p>
                <p className="font-mono text-sm text-foreground tabular-nums">
                  {holding.quantity != null ? holding.quantity.toLocaleString("en-IN", { maximumFractionDigits: 4 }) : "—"}
                </p>
              </div>
              <div className="px-4 py-3 border-r border-edge">
                <p className="text-[9px] uppercase tracking-widest text-muted mb-1">Avg NAV</p>
                <p className="font-mono text-sm text-foreground tabular-nums">
                  {avgNav != null ? fmt(avgNav) : "—"}
                </p>
              </div>
              <div className="px-4 py-3 border-r border-edge">
                <p className="text-[9px] uppercase tracking-widest text-muted mb-1">Invested</p>
                <p className="font-mono text-sm text-foreground tabular-nums">₹{fmt(holding.investedValue)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[9px] uppercase tracking-widest text-muted mb-1">Gain / Loss</p>
                <p className={`font-mono text-sm tabular-nums font-medium ${gain >= 0 ? "text-gain" : "text-loss"}`}>
                  {gain >= 0 ? "+" : ""}₹{fmt(gain)}
                </p>
                <p className={`font-mono text-[10px] tabular-nums ${gain >= 0 ? "text-gain" : "text-loss"}`}>
                  {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Transactions */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-2.5 rounded-sm bg-edge animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
                  ))}
                </div>
              ) : error ? (
                <div className="p-6 text-xs text-loss">{error}</div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-muted/60 leading-relaxed">
                    No transaction history yet.
                    <br />
                    Upload a detailed CAS to see transaction history.
                  </p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-surface z-10">
                    <tr className="border-b border-edge text-muted text-[9px] uppercase tracking-widest">
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Date</th>
                      <th className="px-4 py-2.5 text-left font-medium">Description</th>
                      <th className="px-4 py-2.5 text-right font-medium">Units</th>
                      <th className="px-4 py-2.5 text-right font-medium">NAV</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount (₹)</th>
                      <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn) => (
                      <tr key={txn.id} className="border-b border-edge hover:bg-white/1.5 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted whitespace-nowrap tabular-nums">
                          {fmtDate(txn.date)}
                        </td>
                        <td className="px-4 py-2.5 text-foreground max-w-[180px]">
                          <span className="block leading-snug">{txn.description}</span>
                          {txn.type && (
                            <span className="text-[9px] text-muted/60 uppercase tracking-wider">{txn.type}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[10px] tabular-nums text-foreground">
                          {txn.units != null
                            ? (txn.units >= 0 ? "+" : "") + txn.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[10px] tabular-nums text-muted">
                          {txn.nav != null ? fmt(txn.nav) : "—"}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-[10px] tabular-nums ${
                          txn.amount == null ? "text-muted" :
                          txn.amount >= 0 ? "text-foreground" : "text-loss"
                        }`}>
                          {txn.amount != null
                            ? (txn.amount >= 0 ? "" : "−") + "₹" + fmt(Math.abs(txn.amount))
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[10px] tabular-nums text-muted">
                          {txn.balance != null
                            ? txn.balance.toLocaleString("en-IN", { maximumFractionDigits: 4 })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer count */}
            {!loading && transactions.length > 0 && (
              <div className="px-5 py-2.5 border-t border-edge shrink-0">
                <p className="text-[10px] text-muted/60">
                  {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
