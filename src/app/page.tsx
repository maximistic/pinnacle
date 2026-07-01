"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { relativeTime, formatINR } from "@/lib/utils";

type Holding = {
  id: string;
  type: string;
  name: string;
  quantity: number | null;
  investedValue: number;
  currentValue: number;
  isin: string | null;
  notes: string | null;
  updatedAt: string;
};

type BreakdownEntry = { invested: number; current: number };

type Snapshot = {
  id: string;
  date: string;
  totalValue: number;
  breakdown: Record<string, BreakdownEntry>;
};

const TYPE_LABELS: Record<string, string> = {
  STOCK: "Stocks",
  MUTUAL_FUND: "Mutual Funds",
  FD: "Fixed Deposits",
  GOLD: "Gold",
  REAL_ESTATE: "Real Estate",
  OTHER: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  STOCK: "#3b82f6",
  MUTUAL_FUND: "#a855f7",
  FD: "#f97316",
  GOLD: "#eab308",
  REAL_ESTATE: "#10b981",
  OTHER: "#6b7280",
};

const CHART_STYLE = {
  fontSize: 11,
  fontFamily: "var(--font-ibm-plex-mono)",
  background: "#131615",
  border: "1px solid #262A28",
  borderRadius: 2,
  color: "#E4E6E1",
};

function fmt(n: number) {
  return formatINR(n);
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportAllCSV(holdings: Holding[]) {
  const today = new Date().toISOString().slice(0, 10);
  const headers = ["Type", "Name", "ISIN", "Qty/Units", "Invested Value (Rs)", "Current Value (Rs)", "Gain/Loss (Rs)", "Gain/Loss %", "Notes", "Last Updated"];
  const rows = holdings.map((h) => {
    const gain    = h.currentValue - h.investedValue;
    const gainPct = h.investedValue > 0 ? ((gain / h.investedValue) * 100).toFixed(2) : "0.00";
    return [
      csvEscape(TYPE_LABELS[h.type] ?? h.type),
      csvEscape(h.name),
      csvEscape(h.isin ?? ""),
      h.quantity ?? "",
      h.investedValue.toFixed(2),
      h.currentValue.toFixed(2),
      gain.toFixed(2),
      gainPct,
      csvEscape(h.notes ?? ""),
      new Date(h.updatedAt).toLocaleDateString("en-IN"),
    ].join(",");
  });
  const content = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `pinnacle-full-portfolio-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtShort(n: number) {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function todayUTCString() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function StatCard({
  label,
  value,
  sub,
  gainColor,
}: {
  label: string;
  value: string;
  sub?: string;
  gainColor?: "gain" | "loss";
}) {
  return (
    <div className="border border-edge bg-surface p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-2">{label}</div>
      <div
        className={`font-mono text-xl font-medium tabular-nums ${
          gainColor === "gain" ? "text-gain" : gainColor === "loss" ? "text-loss" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div
          className={`font-mono text-xs tabular-nums mt-1 ${
            gainColor === "gain" ? "text-gain" : gainColor === "loss" ? "text-loss" : "text-muted"
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedThisSession, setSavedThisSession] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/holdings").then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Holding[]>; }),
      fetch("/api/snapshots").then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Snapshot[]>; }),
    ])
      .then(([h, s]) => { setHoldings(h); setSnapshots(s); })
      .catch(() => setError("Could not load portfolio data."))
      .finally(() => setLoading(false));
  }, []);

  const alreadySavedToday =
    snapshots.length > 0 &&
    snapshots[snapshots.length - 1].date.slice(0, 10) === todayUTCString();

  async function handleSaveSnapshot() {
    setSnapshotStatus("saving");
    try {
      const res = await fetch("/api/snapshots", { method: "POST" });
      if (!res.ok) throw new Error();
      const snap: Snapshot = await res.json();
      setSnapshots((prev) => {
        const filtered = prev.filter((s) => s.id !== snap.id);
        return [...filtered, snap].sort((a, b) => a.date.localeCompare(b.date));
      });
      setSavedThisSession(true);
      setSnapshotStatus("saved");
    } catch {
      setSnapshotStatus("error");
    }
  }

  const totalInvested = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrent  = holdings.reduce((s, h) => s + h.currentValue, 0);
  const lastUpdatedAt = holdings.length
    ? holdings.reduce((latest, h) => (h.updatedAt > latest ? h.updatedAt : latest), holdings[0].updatedAt)
    : null;
  const totalGain = totalCurrent - totalInvested;
  const gainPct   = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const byType = Object.entries(
    holdings.reduce<Record<string, { invested: number; current: number }>>((acc, h) => {
      if (!acc[h.type]) acc[h.type] = { invested: 0, current: 0 };
      acc[h.type].invested += h.investedValue;
      acc[h.type].current  += h.currentValue;
      return acc;
    }, {})
  )
    .map(([type, { invested, current }]) => ({
      type,
      label: TYPE_LABELS[type] ?? type,
      color: TYPE_COLORS[type] ?? "#6b7280",
      invested,
      current,
    }))
    .sort((a, b) => b.current - a.current);

  const chartData = byType.map((d) => ({ name: d.label, value: d.current, color: d.color }));

  // Net worth trend
  const trendData = snapshots.map((s) => ({
    date: fmtDate(s.date),
    value: s.totalValue,
  }));

  // Stacked area — collect all types present across all snapshots
  const allTypes = Array.from(
    new Set(snapshots.flatMap((s) => Object.keys(s.breakdown)))
  );
  const stackedData = snapshots.map((s) => {
    const row: Record<string, number | string> = { date: fmtDate(s.date) };
    for (const t of allTypes) row[t] = s.breakdown[t]?.current ?? 0;
    return row;
  });

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-xs text-muted">Loading portfolio…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <p className="text-xs text-loss">{error}</p>
      </main>
    );
  }

  const snapshotDisabled = savedThisSession || alreadySavedToday || snapshotStatus === "saving";

  return (
    <main className="p-6 text-foreground">
      {/* Page label */}
      <div className="mb-5 pb-4 border-b border-edge">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted mb-4">Dashboard</p>

        {/* Ticker strip + snapshot button */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-mono text-4xl font-medium tabular-nums text-foreground">
            ₹{fmt(totalCurrent)}
          </span>
          <span
            className={`font-mono text-sm tabular-nums flex items-center gap-1.5 ${
              totalGain >= 0 ? "text-gain" : "text-loss"
            }`}
          >
            <span className="text-base leading-none">{totalGain >= 0 ? "▲" : "▼"}</span>
            <span>
              {gainPct >= 0 ? "+" : ""}
              {gainPct.toFixed(2)}%
            </span>
            <span className="font-sans text-[10px] uppercase tracking-wider text-muted ml-1">
              overall
            </span>
          </span>

          <div className="ml-auto flex items-center gap-2">
            {holdings.length > 0 && (
              <button
                onClick={() => exportAllCSV(holdings)}
                className="px-3 py-1.5 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                Export All
              </button>
            )}
          <button
            onClick={handleSaveSnapshot}
            disabled={snapshotDisabled}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-widest border transition-colors ${
              snapshotStatus === "saved" || (alreadySavedToday && snapshotStatus !== "error")
                ? "border-gain/40 text-gain cursor-default"
                : snapshotStatus === "error"
                ? "border-loss/40 text-loss hover:bg-loss/10 cursor-pointer"
                : snapshotDisabled
                ? "border-edge text-muted/40 cursor-default"
                : "border-amber/60 text-amber hover:bg-amber/10"
            }`}
          >
            {snapshotStatus === "saving"
              ? "Saving…"
              : snapshotStatus === "saved" || (alreadySavedToday && snapshotStatus !== "error")
              ? "✓ Snapshot saved today"
              : snapshotStatus === "error"
              ? "Error — retry?"
              : "Save Today's Snapshot"}
          </button>
          </div>
        </div>

        {lastUpdatedAt && (
          <p className="mt-2 text-[10px] text-muted/60">
            Portfolio last updated:{" "}
            <span className="text-muted">{relativeTime(lastUpdatedAt)}</span>
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Portfolio Value"  value={`₹${fmt(totalCurrent)}`} />
        <StatCard label="Total Invested"   value={`₹${fmt(totalInvested)}`} />
        <StatCard
          label="Overall Gain / Loss"
          value={`${totalGain >= 0 ? "+" : ""}₹${fmt(totalGain)}`}
          sub={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`}
          gainColor={totalGain >= 0 ? "gain" : "loss"}
        />
      </div>

      {holdings.length === 0 ? (
        <div className="border border-edge px-4 py-12 text-center text-xs text-muted">
          No holdings yet. Add some from the Stocks, Mutual Funds, or Others pages.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Allocation row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Donut chart */}
            <div className="border border-edge bg-surface p-4">
              <h2 className="text-[10px] uppercase tracking-widest text-muted mb-4">
                Allocation
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown) => [`₹${fmt(value as number)}`, "Current Value"]}
                    contentStyle={CHART_STYLE}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    formatter={(value: string) => (
                      <span style={{ fontSize: 11, color: "#7A827C" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Breakdown table */}
            <div className="border border-edge overflow-hidden self-start">
              <div className="px-4 py-2.5 border-b border-edge bg-surface">
                <h2 className="text-[10px] uppercase tracking-widest text-muted">
                  Breakdown by Type
                </h2>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-surface text-muted uppercase text-[10px] tracking-widest border-b border-edge">
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-right font-medium">Invested (₹)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Current (₹)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Alloc %</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.map((row) => (
                    <tr key={row.type} className="border-b border-edge hover:bg-white/1.5 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-sm text-foreground">{row.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums">
                        {fmt(row.invested)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums">
                        {fmt(row.current)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-muted tabular-nums">
                        {totalCurrent > 0 ? ((row.current / totalCurrent) * 100).toFixed(1) : "0.0"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-edge bg-surface">
                    <td className="px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted font-semibold">
                      Total
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums font-medium">
                      {fmt(totalInvested)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-amber tabular-nums font-medium">
                      {fmt(totalCurrent)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted tabular-nums">
                      100%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Net worth trend */}
          <div className="border border-edge bg-surface p-4">
            <h2 className="text-[10px] uppercase tracking-widest text-muted mb-4">
              Net Worth Trend
            </h2>
            {trendData.length < 2 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted/60 border border-dashed border-edge">
                Save at least 2 snapshots to see the trend chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262A28" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#7A827C", fontSize: 10, fontFamily: "var(--font-ibm-plex-mono)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtShort}
                    tick={{ fill: "#7A827C", fontSize: 10, fontFamily: "var(--font-ibm-plex-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [`₹${fmt(value as number)}`, "Portfolio Value"]}
                    contentStyle={CHART_STYLE}
                    labelStyle={{ color: "#7A827C", fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#D9A441"
                    strokeWidth={2}
                    dot={{ fill: "#D9A441", r: 3 }}
                    activeDot={{ r: 5, fill: "#D9A441" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Allocation over time */}
          <div className="border border-edge bg-surface p-4">
            <h2 className="text-[10px] uppercase tracking-widest text-muted mb-4">
              Allocation Over Time
            </h2>
            {stackedData.length < 2 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted/60 border border-dashed border-edge">
                Save at least 2 snapshots to see the allocation chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stackedData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262A28" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#7A827C", fontSize: 10, fontFamily: "var(--font-ibm-plex-mono)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtShort}
                    tick={{ fill: "#7A827C", fontSize: 10, fontFamily: "var(--font-ibm-plex-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      `₹${fmt(value as number)}`,
                      TYPE_LABELS[name as string] ?? (name as string),
                    ]}
                    contentStyle={CHART_STYLE}
                    labelStyle={{ color: "#7A827C", fontSize: 10 }}
                  />
                  {allTypes.map((t) => (
                    <Area
                      key={t}
                      type="monotone"
                      dataKey={t}
                      stackId="1"
                      stroke={TYPE_COLORS[t] ?? "#6b7280"}
                      fill={TYPE_COLORS[t] ?? "#6b7280"}
                      fillOpacity={0.35}
                      strokeWidth={1.5}
                    />
                  ))}
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    formatter={(value: string) => (
                      <span style={{ fontSize: 11, color: "#7A827C" }}>
                        {TYPE_LABELS[value] ?? value}
                      </span>
                    )}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
