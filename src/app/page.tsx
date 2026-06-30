"use client";

import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type Holding = {
  id: string;
  type: string;
  investedValue: number;
  currentValue: number;
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

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  useEffect(() => {
    fetch("/api/holdings")
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Holding[]>; })
      .then(setHoldings)
      .catch(() => setError("Could not load portfolio data."))
      .finally(() => setLoading(false));
  }, []);

  const totalInvested = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrent  = holdings.reduce((s, h) => s + h.currentValue,  0);
  const totalGain     = totalCurrent - totalInvested;
  const gainPct       = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

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

  return (
    <main className="p-6 text-foreground">
      {/* Page label */}
      <div className="mb-5 pb-4 border-b border-edge">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted mb-4">Dashboard</p>

        {/* Ticker strip */}
        <div className="flex items-baseline gap-4 flex-wrap">
          <span className="font-mono text-4xl font-medium tabular-nums text-foreground">
            ₹{fmt(totalCurrent)}
          </span>
          <span
            className={`font-mono text-sm tabular-nums flex items-center gap-1.5 ${
              totalGain >= 0 ? "text-gain" : "text-loss"
            }`}
          >
            <span className="text-base leading-none">
              {totalGain >= 0 ? "▲" : "▼"}
            </span>
            <span>
              {gainPct >= 0 ? "+" : ""}
              {gainPct.toFixed(2)}%
            </span>
            <span className="font-sans text-[10px] uppercase tracking-wider text-muted ml-1">
              overall
            </span>
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Portfolio Value"   value={`₹${fmt(totalCurrent)}`} />
        <StatCard label="Total Invested"    value={`₹${fmt(totalInvested)}`} />
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
                  contentStyle={{
                    fontSize: 11,
                    fontFamily: "var(--font-ibm-plex-mono)",
                    background: "#131615",
                    border: "1px solid #262A28",
                    borderRadius: 2,
                    color: "#E4E6E1",
                  }}
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
      )}
    </main>
  );
}
