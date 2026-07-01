"use client";

import { useEffect, useState } from "react";
import type { Holding } from "@/components/HoldingsTable";

// ── Types ──────────────────────────────────────────────────────────────────────

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

type RecurringRule = {
  id: string;
  name: string;
  ruleType: string;
  amount: number;
  dayOfMonth: number;
  startDate: string;
  lastRunDate: string | null;
  status: string;
  notes: string | null;
  holdingId: string | null;
};

type SipFormState = {
  amount: string;
  dayOfMonth: string;
  startDate: string;
  notes: string;
};

type Props = {
  holding: Holding | null;
  onClose: () => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtRuleDate(d: string | null | undefined): string {
  if (!d) return "Not yet";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// Pure date math — compute next due date client-side (MONTHLY only)
function clientNextDue(rule: RecurringRule): Date {
  const dom = rule.dayOfMonth;
  const start = new Date(rule.startDate);

  function clampDay(year: number, month0: number, day: number): Date {
    const maxDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month0, Math.min(day, maxDay)));
  }

  function addMonths(base: Date, months: number): Date {
    const m = base.getUTCMonth() + months;
    return clampDay(
      base.getUTCFullYear() + Math.floor(m / 12),
      ((m % 12) + 12) % 12,
      dom
    );
  }

  if (!rule.lastRunDate) {
    const candidate = clampDay(start.getUTCFullYear(), start.getUTCMonth(), dom);
    return candidate >= start ? candidate : addMonths(candidate, 1);
  }

  return addMonths(new Date(rule.lastRunDate), 1);
}

// ── Style constants ────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-amber transition-colors";

// ── Main component ─────────────────────────────────────────────────────────────

export default function TransactionDrawer({ holding, onClose }: Props) {
  const isOpen = holding !== null;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // SIP state
  const [sipRule,          setSipRule]          = useState<RecurringRule | null>(null);
  const [sipLoading,       setSipLoading]       = useState(false);
  const [sipFormOpen,      setSipFormOpen]      = useState(false);
  const [sipEditMode,      setSipEditMode]      = useState(false);
  const [sipForm,          setSipForm]          = useState<SipFormState>({ amount: "", dayOfMonth: "1", startDate: "", notes: "" });
  const [sipSaving,        setSipSaving]        = useState(false);
  const [sipError,         setSipError]         = useState<string | null>(null);
  const [sipDeleteConfirm, setSipDeleteConfirm] = useState(false);

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

  // Reset SIP state and fetch when holding changes
  useEffect(() => {
    setSipRule(null);
    setSipFormOpen(false);
    setSipEditMode(false);
    setSipDeleteConfirm(false);
    setSipError(null);
    if (!holding?.id || holding.type !== "MUTUAL_FUND") return;
    fetchSip(holding.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding?.id]);

  async function fetchSip(holdingId: string) {
    setSipLoading(true);
    try {
      const res = await fetch(`/api/recurring?holdingId=${holdingId}`);
      if (!res.ok) throw new Error();
      const rules: RecurringRule[] = await res.json();
      const sip = rules.find((r) => r.ruleType === "SIP") ?? null;
      setSipRule(sip);
    } catch {
      // ignore — SIP section will just show "no SIP"
    } finally {
      setSipLoading(false);
    }
  }

  async function handleSipCreate() {
    if (!holding) return;
    setSipSaving(true);
    setSipError(null);
    try {
      const amount = parseFloat(sipForm.amount);
      const dom    = parseInt(sipForm.dayOfMonth, 10);
      if (!sipForm.amount || isNaN(amount) || amount <= 0) { setSipError("Amount must be a positive number."); setSipSaving(false); return; }
      if (!sipForm.startDate) { setSipError("Start date is required."); setSipSaving(false); return; }
      if (isNaN(dom) || dom < 1 || dom > 28) { setSipError("Day of month must be between 1 and 28."); setSipSaving(false); return; }

      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: holding.name,
          ruleType: "SIP",
          amount,
          startDate: sipForm.startDate,
          dayOfMonth: dom,
          frequency: "MONTHLY",
          holdingId: holding.id,
          notes: sipForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setSipError(d.error ?? "Failed to create SIP.");
        return;
      }
      setSipFormOpen(false);
      setSipForm({ amount: "", dayOfMonth: "1", startDate: "", notes: "" });
      await fetchSip(holding.id);
    } catch {
      setSipError("Network error.");
    } finally {
      setSipSaving(false);
    }
  }

  async function handleSipUpdate() {
    if (!holding || !sipRule) return;
    setSipSaving(true);
    setSipError(null);
    try {
      const amount = parseFloat(sipForm.amount);
      const dom    = parseInt(sipForm.dayOfMonth, 10);
      if (!sipForm.amount || isNaN(amount) || amount <= 0) { setSipError("Amount must be a positive number."); setSipSaving(false); return; }
      if (isNaN(dom) || dom < 1 || dom > 28) { setSipError("Day of month must be between 1 and 28."); setSipSaving(false); return; }

      const res = await fetch(`/api/recurring/${sipRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          dayOfMonth: dom,
          notes: sipForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setSipError(d.error ?? "Failed to update SIP.");
        return;
      }
      setSipFormOpen(false);
      setSipEditMode(false);
      await fetchSip(holding.id);
    } catch {
      setSipError("Network error.");
    } finally {
      setSipSaving(false);
    }
  }

  async function handleSipPause() {
    if (!holding || !sipRule) return;
    try {
      await fetch(`/api/recurring/${sipRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      });
      await fetchSip(holding.id);
    } catch { /* ignore */ }
  }

  async function handleSipResume() {
    if (!holding || !sipRule) return;
    try {
      await fetch(`/api/recurring/${sipRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      await fetchSip(holding.id);
    } catch { /* ignore */ }
  }

  async function handleSipDelete() {
    if (!holding || !sipRule) return;
    try {
      await fetch(`/api/recurring/${sipRule.id}`, { method: "DELETE" });
      setSipRule(null);
      setSipDeleteConfirm(false);
    } catch { /* ignore */ }
  }

  const gain    = holding ? holding.currentValue - holding.investedValue : 0;
  const gainPct = holding?.investedValue ? (gain / holding.investedValue) * 100 : 0;
  const avgNav  = holding?.quantity ? holding.currentValue / holding.quantity : null;

  const typeLabel =
    holding?.type === "MUTUAL_FUND" ? "Mutual Fund" :
    holding?.type === "RD"          ? "Recurring Deposit" :
    holding?.type === "EPFO"        ? "EPFO" :
    holding?.type === "US_STOCK"    ? "US Stock" :
    holding?.type ?? "";

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
                <p className="text-[9px] uppercase tracking-[0.18em] text-muted mb-1">{typeLabel}</p>
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

            {/* SIP Configuration — only for Mutual Funds */}
            {holding.type === "MUTUAL_FUND" && (
              <div className="border-b border-edge shrink-0">
                <div className="px-5 py-2.5 flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-widest text-muted font-semibold">SIP Configuration</span>
                  {sipLoading && (
                    <span className="text-[9px] text-muted/50 font-mono animate-pulse">loading…</span>
                  )}
                </div>

                {!sipLoading && (
                  <div className="px-5 pb-3">
                    {!sipRule && !sipFormOpen && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted/60">No SIP set up</span>
                        <button
                          onClick={() => {
                            setSipFormOpen(true);
                            setSipEditMode(false);
                            setSipForm({ amount: "", dayOfMonth: "1", startDate: "", notes: "" });
                            setSipError(null);
                          }}
                          className="text-[10px] uppercase tracking-widest text-amber hover:opacity-70 transition-opacity"
                        >
                          Set up SIP
                        </button>
                      </div>
                    )}

                    {sipRule && !sipFormOpen && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${sipRule.status === "ACTIVE" ? "bg-gain animate-pulse" : "bg-muted/30"}`} />
                          <span className={`text-[10px] uppercase tracking-widest font-medium ${sipRule.status === "ACTIVE" ? "text-gain" : "text-muted"}`}>
                            SIP {sipRule.status === "ACTIVE" ? "Active" : "Paused"}
                          </span>
                        </div>
                        <p className="text-xs text-foreground font-mono">
                          ₹{fmt(sipRule.amount)} on the {ordinal(sipRule.dayOfMonth)} of every month
                        </p>
                        <div className="flex gap-4 text-[10px] font-mono text-muted">
                          <span>Next: {fmtRuleDate(clientNextDue(sipRule).toISOString())}</span>
                          <span>Last run: {fmtRuleDate(sipRule.lastRunDate)}</span>
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                          {sipRule.status === "ACTIVE" ? (
                            <button
                              onClick={handleSipPause}
                              className="text-[10px] uppercase tracking-widest text-muted hover:text-foreground transition-colors"
                            >
                              Pause
                            </button>
                          ) : (
                            <button
                              onClick={handleSipResume}
                              className="text-[10px] uppercase tracking-widest text-gain hover:opacity-70 transition-opacity"
                            >
                              Resume
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSipFormOpen(true);
                              setSipEditMode(true);
                              setSipForm({
                                amount: String(sipRule.amount),
                                dayOfMonth: String(sipRule.dayOfMonth),
                                startDate: sipRule.startDate.slice(0, 10),
                                notes: sipRule.notes ?? "",
                              });
                              setSipError(null);
                            }}
                            className="text-[10px] uppercase tracking-widest text-amber hover:opacity-70 transition-opacity"
                          >
                            Edit
                          </button>
                          {!sipDeleteConfirm ? (
                            <button
                              onClick={() => setSipDeleteConfirm(true)}
                              className="text-[10px] uppercase tracking-widest text-loss hover:opacity-70 transition-opacity"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="flex items-center gap-2 text-[10px]">
                              <span className="text-loss">Confirm?</span>
                              <button onClick={handleSipDelete} className="text-loss underline hover:opacity-70 transition-opacity">Yes</button>
                              <button onClick={() => setSipDeleteConfirm(false)} className="text-muted underline hover:opacity-70 transition-opacity">No</button>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {sipFormOpen && (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-[10px] uppercase tracking-widest text-muted mb-1">
                            Monthly Amount (₹) <span className="text-loss">*</span>
                          </label>
                          <input
                            type="number"
                            value={sipForm.amount}
                            onChange={(e) => setSipForm((f) => ({ ...f, amount: e.target.value }))}
                            placeholder="e.g. 5000"
                            min="0"
                            step="any"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-widest text-muted mb-1">
                            Day of Month (1–28) <span className="text-loss">*</span>
                          </label>
                          <input
                            type="number"
                            value={sipForm.dayOfMonth}
                            onChange={(e) => setSipForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                            placeholder="e.g. 5"
                            min="1"
                            max="28"
                            className={inputCls}
                          />
                        </div>
                        {!sipEditMode && (
                          <div>
                            <label className="block text-[10px] uppercase tracking-widest text-muted mb-1">
                              Start Date <span className="text-loss">*</span>
                            </label>
                            <input
                              type="date"
                              value={sipForm.startDate}
                              onChange={(e) => setSipForm((f) => ({ ...f, startDate: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-[10px] uppercase tracking-widest text-muted mb-1">Notes</label>
                          <input
                            type="text"
                            value={sipForm.notes}
                            onChange={(e) => setSipForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional…"
                            className={inputCls}
                          />
                        </div>
                        {sipError && (
                          <p className="text-[10px] text-loss">{sipError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            disabled={sipSaving}
                            onClick={sipEditMode ? handleSipUpdate : handleSipCreate}
                            className="flex-1 py-1.5 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-40 transition-opacity"
                          >
                            {sipSaving ? "Saving…" : "Save SIP"}
                          </button>
                          <button
                            onClick={() => { setSipFormOpen(false); setSipEditMode(false); setSipError(null); }}
                            className="flex-1 py-1.5 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
