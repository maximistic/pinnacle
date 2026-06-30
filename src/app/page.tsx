"use client";

import { useEffect, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    <div className="rounded border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={`text-2xl font-bold tabular-nums ${
          gainColor === "gain"
            ? "text-emerald-600"
            : gainColor === "loss"
            ? "text-red-500"
            : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div
          className={`text-xs mt-0.5 ${
            gainColor === "gain"
              ? "text-emerald-600"
              : gainColor === "loss"
              ? "text-red-500"
              : "text-neutral-500"
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
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Holding[]>;
      })
      .then(setHoldings)
      .catch(() => setError("Could not load portfolio data."))
      .finally(() => setLoading(false));
  }, []);

  const totalInvested = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalGain = totalCurrent - totalInvested;
  const gainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const byType = Object.entries(
    holdings.reduce<Record<string, { invested: number; current: number }>>(
      (acc, h) => {
        if (!acc[h.type]) acc[h.type] = { invested: 0, current: 0 };
        acc[h.type].invested += h.investedValue;
        acc[h.type].current += h.currentValue;
        return acc;
      },
      {}
    )
  )
    .map(([type, { invested, current }]) => ({
      type,
      label: TYPE_LABELS[type] ?? type,
      color: TYPE_COLORS[type] ?? "#6b7280",
      invested,
      current,
    }))
    .sort((a, b) => b.current - a.current);

  const chartData = byType.map((d) => ({
    name: d.label,
    value: d.current,
    color: d.color,
  }));

  if (loading) {
    return (
      <main className="p-6 text-foreground">
        <p className="text-neutral-400 text-sm">Loading portfolio…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 text-foreground">
        <p className="text-red-500 text-sm">{error}</p>
      </main>
    );
  }

  return (
    <main className="p-6 text-foreground">
      <h1 className="text-lg font-semibold tracking-tight mb-5">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Portfolio Value" value={`₹${fmt(totalCurrent)}`} />
        <StatCard label="Total Invested" value={`₹${fmt(totalInvested)}`} />
        <StatCard
          label="Overall Gain / Loss"
          value={`${totalGain >= 0 ? "+" : ""}₹${fmt(totalGain)}`}
          sub={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`}
          gainColor={totalGain >= 0 ? "gain" : "loss"}
        />
      </div>

      {holdings.length === 0 ? (
        <div className="rounded border border-neutral-200 dark:border-neutral-800 px-4 py-12 text-center text-neutral-400 text-sm">
          No holdings yet. Add some from the Stocks, Mutual Funds, or Others pages.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Donut chart */}
          <div className="rounded border border-neutral-200 dark:border-neutral-800 p-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-3">
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
                  formatter={(value: unknown) => [
                    `₹${fmt(value as number)}`,
                    "Current Value",
                  ]}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 4,
                    border: "1px solid #e5e7eb",
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: 12 }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown table */}
          <div className="rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden self-start">
            <div className="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                Breakdown by Type
              </h2>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 uppercase text-xs tracking-wider">
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Invested (₹)</th>
                  <th className="px-4 py-2 text-right font-medium">Current (₹)</th>
                  <th className="px-4 py-2 text-right font-medium">Alloc %</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((row, i) => (
                  <tr
                    key={row.type}
                    className={`border-t border-neutral-200 dark:border-neutral-800 ${
                      i % 2 !== 0 ? "bg-neutral-50 dark:bg-neutral-900/40" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmt(row.invested)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmt(row.current)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                      {totalCurrent > 0
                        ? ((row.current / totalCurrent) * 100).toFixed(1)
                        : "0.0"}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 font-semibold">
                  <td className="px-4 py-2 text-xs uppercase tracking-wider text-neutral-500">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmt(totalInvested)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmt(totalCurrent)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
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
