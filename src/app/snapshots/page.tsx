"use client";

import { useState, useEffect, useCallback } from "react";
import { formatINR } from "@/lib/utils";

type Snapshot = {
  id: string;
  date: string;
  totalValue: number;
  breakdown: Record<string, { invested: number; current: number }>;
};

const TYPE_SHORT: Record<string, string> = {
  STOCK: "STK",
  MUTUAL_FUND: "MF",
  FD: "FD",
  GOLD: "GOLD",
  REAL_ESTATE: "RE",
  OTHER: "OTH",
  RD: "RD",
  EPFO: "EPFO",
  US_STOCK: "US",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/snapshots");
      if (!res.ok) throw new Error();
      const data: Snapshot[] = await res.json();
      // Sort newest first
      setSnapshots(data.slice().sort((a, b) => b.date.localeCompare(a.date)));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  async function handleTakeSnapshot() {
    setTaking(true);
    try {
      const res = await fetch("/api/snapshots", { method: "POST" });
      if (!res.ok) throw new Error();
      await fetchSnapshots();
    } catch {
      // silently fail
    } finally {
      setTaking(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/snapshots/${id}`, { method: "DELETE" });
      await fetchSnapshots();
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selected);
      await fetch("/api/snapshots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelected(new Set());
      await fetchSnapshots();
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(snapshots.map((s) => s.id)) : new Set());
  }

  const allSelected = snapshots.length > 0 && snapshots.every((s) => selected.has(s.id));
  const someSelected = selected.size > 0;

  return (
    <main className="p-6 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-edge">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Snapshots</h1>
        <button
          onClick={handleTakeSnapshot}
          disabled={taking}
          className="px-4 py-2 text-[11px] uppercase tracking-widest border border-amber/50 text-amber hover:bg-amber/10 transition-colors disabled:opacity-40"
        >
          {taking ? "Taking…" : "Take Snapshot Now"}
        </button>
      </div>

      {/* Bulk delete bar */}
      {someSelected && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 border border-edge bg-surface">
          <span className="text-xs text-muted">{selected.size} selected</span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest border border-loss/50 text-loss hover:bg-loss/10 transition-colors disabled:opacity-40"
          >
            {bulkDeleting ? "Deleting…" : "Delete selected"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[10px] text-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-xs text-muted py-8 text-center">Loading…</p>
      )}

      {/* Empty state */}
      {!loading && snapshots.length === 0 && (
        <div className="border border-edge px-4 py-16 text-center">
          <p className="text-sm text-muted mb-4">
            No snapshots yet. Take your first snapshot to start tracking net worth over time.
          </p>
          <button
            onClick={handleTakeSnapshot}
            disabled={taking}
            className="px-4 py-2 text-[11px] uppercase tracking-widest border border-amber/50 text-amber hover:bg-amber/10 transition-colors disabled:opacity-40"
          >
            {taking ? "Taking…" : "Take Snapshot Now"}
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && snapshots.length > 0 && (
        <div className="overflow-x-auto border border-edge">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface text-muted uppercase text-[10px] tracking-widest border-b border-edge">
                <th className="px-3 py-2.5 w-9">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="accent-amber"
                  />
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Total Value</th>
                <th className="px-4 py-2.5 text-left font-medium">Breakdown</th>
                <th className="px-4 py-2.5 text-right font-medium">Change vs Prev</th>
                <th className="px-4 py-2.5 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap, idx) => {
                const prevSnap = snapshots[idx + 1]; // older one (sorted newest-first)
                const delta = prevSnap ? snap.totalValue - prevSnap.totalValue : null;
                const deltaPct = delta != null && prevSnap && prevSnap.totalValue > 0
                  ? (delta / prevSnap.totalValue) * 100
                  : null;
                const isSelected = selected.has(snap.id);
                const isDeleting = deletingId === snap.id;

                const breakdownPills = Object.entries(snap.breakdown)
                  .filter(([, v]) => v.current > 0)
                  .map(([type, v]) => {
                    const label = TYPE_SHORT[type] ?? type;
                    const val = v.current;
                    let display: string;
                    if (val >= 1_00_00_000) display = `${(val / 1_00_00_000).toFixed(1)}Cr`;
                    else if (val >= 1_00_000) display = `${(val / 1_00_000).toFixed(1)}L`;
                    else if (val >= 1_000) display = `${(val / 1_000).toFixed(1)}K`;
                    else display = formatINR(val);
                    return { label, display };
                  });

                return (
                  <tr
                    key={snap.id}
                    className={`border-b border-edge transition-colors ${isSelected ? "bg-amber/3" : "hover:bg-white/1.5"}`}
                  >
                    <td className="px-3 py-2.5 text-center w-9">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(snap.id)}
                        className="accent-amber"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-sm text-foreground whitespace-nowrap">
                      {formatDate(snap.date)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-amber tabular-nums whitespace-nowrap">
                      ₹{formatINR(snap.totalValue)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {breakdownPills.map(({ label, display }) => (
                          <span key={label} className="text-[9px] font-mono text-muted/60 whitespace-nowrap">
                            {label} ₹{display}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      {delta == null ? (
                        <span className="text-muted/40">—</span>
                      ) : (
                        <span className={delta >= 0 ? "text-gain" : "text-loss"}>
                          {delta >= 0 ? "+" : ""}₹{formatINR(Math.abs(delta))}{" "}
                          ({deltaPct != null ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}%` : ""})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {deletingId === snap.id ? (
                        <span className="text-[10px] text-muted">Deleting…</span>
                      ) : deletingId === `confirm-${snap.id}` ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleDelete(snap.id)}
                            disabled={!!isDeleting}
                            className="text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity"
                          >
                            Yes
                          </button>
                          <span className="text-muted/30">·</span>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-[10px] uppercase tracking-wider text-muted hover:text-foreground transition-colors"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeletingId(`confirm-${snap.id}`)}
                          className="text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity"
                          title="Delete snapshot"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
