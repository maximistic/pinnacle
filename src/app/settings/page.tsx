"use client";

import { useState, useEffect, useCallback } from "react";
import { formatINR } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Settings = Record<string, string>;

type RecurringRule = {
  id: string;
  name: string;
  ruleType: string;
  amount: number;
  frequency: string;
  status: string;
  startDate: string;
  dayOfMonth: number;
  lastRunDate: string | null;
  holding: { name: string; type: string } | null;
};

type Holding = {
  id: string;
  type: string;
  name: string;
  isin: string | null;
  folioNumber: string | null;
  quantity: number | null;
  investedValue: number;
  currentValue: number;
  notes: string | null;
  updatedAt: string;
};

type Snapshot = {
  id: string;
  date: string;
  totalValue: number;
  breakdown: Record<string, { invested: number; current: number }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function clientNextDue(startDate: string, dayOfMonth: number, lastRunDate: string | null): string | null {
  function clamp(y: number, m: number, d: number): Date {
    const max = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, max)));
  }
  const start = new Date(startDate);
  if (!lastRunDate) {
    const candidate = clamp(start.getUTCFullYear(), start.getUTCMonth(), dayOfMonth);
    const next = candidate >= start ? candidate : clamp(start.getUTCFullYear(), start.getUTCMonth() + 1, dayOfMonth);
    return next.toISOString().slice(0, 10);
  }
  const last = new Date(lastRunDate);
  const m = last.getUTCMonth() + 1;
  const next = clamp(last.getUTCFullYear() + Math.floor(m / 12), m % 12, dayOfMonth);
  return next.toISOString().slice(0, 10);
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Style constants ────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 text-sm border border-edge bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-amber transition-colors";

const selectCls =
  "px-3 py-2 text-sm border border-edge bg-background text-foreground focus:outline-none focus:border-amber transition-colors";

const btnPrimary =
  "px-4 py-2 text-[11px] uppercase tracking-widest border border-amber/50 text-amber hover:bg-amber/10 transition-colors disabled:opacity-40";

const btnDanger =
  "px-4 py-2 text-[11px] uppercase tracking-widest border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

const sectionHeading = "text-[10px] uppercase tracking-[0.2em] text-muted mb-3";

// ── Main component ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Section A state
  const [settings, setSettings] = useState<Settings>({ snapshotFrequency: "OFF" });
  const [snapshotFreq, setSnapshotFreq] = useState("OFF");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<string | null>(null);

  // Section B state
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<string | null>(null);

  // Section C state
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmHoldings, setConfirmHoldings] = useState("");
  const [confirmSnapshots, setConfirmSnapshots] = useState("");
  const [confirmReset, setConfirmReset] = useState("");
  const [wipingTarget, setWipingTarget] = useState<string | null>(null);
  const [wipeResult, setWipeResult] = useState<Record<string, string>>({});

  // ── Fetch data ─────────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data: Settings = await res.json();
      setSettings(data);
      setSnapshotFreq(data.snapshotFrequency ?? "OFF");
    } catch { /* ignore */ }
  }, []);

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshots");
      if (!res.ok) return;
      const data: Snapshot[] = await res.json();
      if (data.length > 0) {
        const sorted = data.slice().sort((a, b) => b.date.localeCompare(a.date));
        setLastSnapshot(sorted[0].date);
      } else {
        setLastSnapshot(null);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await fetch("/api/recurring");
      if (!res.ok) return;
      const data: RecurringRule[] = await res.json();
      setRules(data);
    } catch { /* ignore */ } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchSnapshots();
    fetchRules();
  }, [fetchSettings, fetchSnapshots, fetchRules]);

  // ── Section A handlers ─────────────────────────────────────────────────────

  async function handleSaveSettings() {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotFrequency: snapshotFreq }),
      });
      if (!res.ok) throw new Error();
      setSettings((prev) => ({ ...prev, snapshotFrequency: snapshotFreq }));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch { /* ignore */ } finally {
      setSavingSettings(false);
    }
  }

  // ── Section B handlers ─────────────────────────────────────────────────────

  async function handleToggleRule(rule: RecurringRule) {
    setTogglingId(rule.id);
    const newStatus = rule.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/recurring/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      await fetchRules();
    } catch { /* ignore */ } finally {
      setTogglingId(null);
    }
  }

  async function handleDeleteRule(id: string) {
    setDeletingRuleId(id);
    try {
      const res = await fetch(`/api/recurring/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConfirmDeleteRuleId(null);
      await fetchRules();
    } catch { /* ignore */ } finally {
      setDeletingRuleId(null);
    }
  }

  // ── Section C — Export handlers ────────────────────────────────────────────

  async function handleExportHoldings() {
    const res = await fetch("/api/holdings");
    if (!res.ok) return;
    const holdings: Holding[] = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    const headers = ["Type", "Name", "ISIN", "Folio", "Qty", "Invested (₹)", "Current (₹)", "Gain/Loss (₹)", "Gain/Loss (%)"];
    const rows = holdings.map((h) => {
      const gain = h.currentValue - h.investedValue;
      const gainPct = h.investedValue > 0 ? ((gain / h.investedValue) * 100).toFixed(2) : "0.00";
      return [
        csvEscape(h.type),
        csvEscape(h.name),
        csvEscape(h.isin ?? ""),
        csvEscape(h.folioNumber ?? ""),
        h.quantity ?? "",
        formatINR(h.investedValue),
        formatINR(h.currentValue),
        formatINR(gain),
        gainPct,
      ].join(",");
    });
    downloadCSV([headers.join(","), ...rows].join("\n"), `pinnacle-portfolio-${today}.csv`);
  }

  async function handleExportSnapshots() {
    const res = await fetch("/api/snapshots");
    if (!res.ok) return;
    const snaps: Snapshot[] = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    const allTypes = Array.from(new Set(snaps.flatMap((s) => Object.keys(s.breakdown))));
    const headers = ["Date", "Total Value", ...allTypes.map((t) => `${t}_current`)];
    const rows = snaps.map((s) => {
      const date = new Date(s.date).toLocaleDateString("en-IN");
      const cols = [date, formatINR(s.totalValue), ...allTypes.map((t) => formatINR(s.breakdown[t]?.current ?? 0))];
      return cols.join(",");
    });
    downloadCSV([headers.join(","), ...rows].join("\n"), `pinnacle-snapshots-${today}.csv`);
  }

  // ── Section C — Danger zone ────────────────────────────────────────────────

  async function handleWipe(target: string) {
    setWipingTarget(target);
    try {
      const res = await fetch("/api/admin/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) throw new Error();
      setWipeResult((prev) => ({ ...prev, [target]: "Done" }));
      // Reset confirm inputs
      if (target === "holdings") setConfirmHoldings("");
      if (target === "snapshots") setConfirmSnapshots("");
      if (target === "all") setConfirmReset("");
      // Refresh data
      if (target === "snapshots" || target === "all") fetchSnapshots();
      if (target === "holdings" || target === "all") fetchRules();
      if (target === "all") fetchSettings();
    } catch {
      setWipeResult((prev) => ({ ...prev, [target]: "Error" }));
    } finally {
      setWipingTarget(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 text-foreground max-w-3xl">
      <div className="mb-5 pb-4 border-b border-edge">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Settings</h1>
      </div>

      {/* ── Section A: Snapshot Settings ──────────────────────────────────── */}
      <section className="mb-8">
        <p className={sectionHeading}>Snapshot Settings</p>
        <div className="border border-edge bg-surface p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-foreground mb-0.5">Auto-snapshot frequency</p>
              <p className="text-[10px] text-muted">Automatically take a snapshot on this schedule.</p>
            </div>
            <select
              value={snapshotFreq}
              onChange={(e) => setSnapshotFreq(e.target.value)}
              className={selectCls}
              style={{ background: "var(--surface)" }}
            >
              <option value="OFF" style={{ background: "var(--surface)" }}>Off</option>
              <option value="DAILY" style={{ background: "var(--surface)" }}>Daily</option>
              <option value="WEEKLY" style={{ background: "var(--surface)" }}>Weekly (Monday)</option>
              <option value="MONTHLY" style={{ background: "var(--surface)" }}>Monthly (1st)</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted">
              Last snapshot:{" "}
              <span className="text-foreground">
                {lastSnapshot
                  ? new Date(lastSnapshot).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                  : "Never taken"}
              </span>
            </p>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings || snapshotFreq === settings.snapshotFrequency}
              className={btnPrimary}
            >
              {savingSettings ? "Saving…" : settingsSaved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
      </section>

      {/* ── Section B: Recurring Rules ────────────────────────────────────── */}
      <section className="mb-8">
        <p className={sectionHeading}>Recurring Rules</p>
        <div className="border border-edge overflow-hidden">
          {rulesLoading ? (
            <p className="px-4 py-8 text-xs text-muted text-center">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="px-4 py-8 text-xs text-muted text-center">No recurring rules yet.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface text-muted uppercase text-[10px] tracking-widest border-b border-edge">
                  <th className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount (₹)</th>
                  <th className="px-4 py-2.5 text-left font-medium">Freq</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Holding</th>
                  <th className="px-4 py-2.5 text-left font-medium">Next Run</th>
                  <th className="px-4 py-2.5 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const nextRun = rule.frequency === "MONTHLY"
                    ? clientNextDue(rule.startDate, rule.dayOfMonth, rule.lastRunDate)
                    : null;
                  const isToggling = togglingId === rule.id;
                  const isDeleting = deletingRuleId === rule.id;
                  const isConfirmDelete = confirmDeleteRuleId === rule.id;

                  return (
                    <tr key={rule.id} className="border-b border-edge hover:bg-white/1.5 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-foreground">{rule.name}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{rule.ruleType}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                        {formatINR(rule.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">{rule.frequency}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 border ${
                            rule.status === "ACTIVE"
                              ? "border-gain/40 text-gain bg-gain/5"
                              : "border-muted/20 text-muted bg-white/3"
                          }`}
                        >
                          {rule.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {rule.holding ? rule.holding.name : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted">
                        {nextRun ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {isConfirmDelete ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              disabled={isDeleting}
                              className="text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity"
                            >
                              {isDeleting ? "…" : "Yes"}
                            </button>
                            <span className="text-muted/30">·</span>
                            <button
                              onClick={() => setConfirmDeleteRuleId(null)}
                              className="text-[10px] uppercase tracking-wider text-muted hover:text-foreground transition-colors"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleRule(rule)}
                              disabled={isToggling}
                              className="mr-3 text-[10px] uppercase tracking-wider text-amber hover:opacity-70 disabled:opacity-40 transition-opacity"
                            >
                              {isToggling ? "…" : rule.status === "ACTIVE" ? "Pause" : "Resume"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteRuleId(rule.id)}
                              className="text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Section C: Data Management ────────────────────────────────────── */}
      <section className="mb-8">
        <p className={sectionHeading}>Data Management</p>
        <div className="border border-edge bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground">Export full portfolio (CSV)</p>
              <p className="text-[10px] text-muted">All holdings with invested/current values.</p>
            </div>
            <button onClick={handleExportHoldings} className={btnPrimary}>
              Export
            </button>
          </div>
          <div className="border-t border-edge pt-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground">Export snapshots (CSV)</p>
              <p className="text-[10px] text-muted">Net worth history with breakdown by type.</p>
            </div>
            <button onClick={handleExportSnapshots} className={btnPrimary}>
              Export
            </button>
          </div>
        </div>
      </section>

      {/* ── Danger Zone ───────────────────────────────────────────────────── */}
      <section>
        <button
          onClick={() => setDangerOpen((o) => !o)}
          className="text-[10px] uppercase tracking-[0.2em] text-red-400/70 hover:text-red-400 transition-colors mb-3 flex items-center gap-2"
        >
          <span>{dangerOpen ? "▾" : "▸"}</span>
          <span>⚠ {dangerOpen ? "Hide" : "Show"} Danger Zone</span>
        </button>

        {dangerOpen && (
          <div className="border border-red-500/30 bg-red-500/3 p-4 space-y-6">

            {/* Delete all holdings */}
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Delete All Holdings</p>
              <p className="text-[10px] text-muted mb-3">
                Deletes all holdings, transactions, and recurring rules permanently.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={confirmHoldings}
                  onChange={(e) => setConfirmHoldings(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className={`${inputCls} max-w-xs`}
                />
                <button
                  onClick={() => handleWipe("holdings")}
                  disabled={confirmHoldings !== "DELETE" || wipingTarget === "holdings"}
                  className={btnDanger}
                >
                  {wipingTarget === "holdings" ? "Deleting…" : "Delete All Holdings"}
                </button>
                {wipeResult.holdings && (
                  <span className="text-[10px] text-muted">{wipeResult.holdings}</span>
                )}
              </div>
            </div>

            <div className="border-t border-red-500/20" />

            {/* Delete all snapshots */}
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Delete All Snapshots</p>
              <p className="text-[10px] text-muted mb-3">
                Deletes all net worth snapshots permanently.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={confirmSnapshots}
                  onChange={(e) => setConfirmSnapshots(e.target.value)}
                  placeholder='Type "DELETE SNAPSHOTS" to confirm'
                  className={`${inputCls} max-w-xs`}
                />
                <button
                  onClick={() => handleWipe("snapshots")}
                  disabled={confirmSnapshots !== "DELETE SNAPSHOTS" || wipingTarget === "snapshots"}
                  className={btnDanger}
                >
                  {wipingTarget === "snapshots" ? "Deleting…" : "Delete All Snapshots"}
                </button>
                {wipeResult.snapshots && (
                  <span className="text-[10px] text-muted">{wipeResult.snapshots}</span>
                )}
              </div>
            </div>

            <div className="border-t border-red-500/20" />

            {/* Reset everything */}
            <div>
              <p className="text-xs font-medium text-red-400 mb-1">Reset Everything</p>
              <p className="text-[10px] text-muted mb-3">
                Permanently deletes ALL data: holdings, transactions, recurring rules, snapshots, and settings.
                This cannot be undone.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={confirmReset}
                  onChange={(e) => setConfirmReset(e.target.value)}
                  placeholder='Type "RESET PINNACLE" to confirm'
                  className={`${inputCls} max-w-xs`}
                />
                <button
                  onClick={() => handleWipe("all")}
                  disabled={confirmReset !== "RESET PINNACLE" || wipingTarget === "all"}
                  className="px-4 py-2 text-[11px] uppercase tracking-widest border border-red-600/60 text-red-400 hover:bg-red-600/15 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {wipingTarget === "all" ? "Resetting…" : "Reset Pinnacle"}
                </button>
                {wipeResult.all && (
                  <span className="text-[10px] text-muted">{wipeResult.all}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
