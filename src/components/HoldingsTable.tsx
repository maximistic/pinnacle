"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relativeTime } from "@/lib/utils";

// ── Sort persistence ──────────────────────────────────────────────────────────

type SortField = "name" | "currentValue" | "gainPct";
type SortDir   = "asc" | "desc";
type SortState = { field: SortField; dir: SortDir };

const DEFAULT_SORT: SortState = { field: "name", dir: "asc" };

function loadSort(key: string): SortState {
  if (typeof window === "undefined") return DEFAULT_SORT;
  try {
    const s = localStorage.getItem(key);
    if (s) return JSON.parse(s) as SortState;
  } catch { /* ignore */ }
  return DEFAULT_SORT;
}

function saveSort(key: string, s: SortState) {
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* ignore */ }
}

// ── Public types ──────────────────────────────────────────────────────────────

export type Holding = {
  id: string;
  type: string;
  name: string;
  quantity: number | null;
  investedValue: number;
  currentValue: number;
  notes: string | null;
  source: string;
  isin: string | null;
  folioNumber: string | null;
  updatedAt: string;
};

export type TypeOption = { value: string; label: string };

// ── Internal types ────────────────────────────────────────────────────────────

type FormState = {
  type: string;
  name: string;
  quantity: string;
  investedValue: string;
  currentValue: string;
  isin: string;
  folioNumber: string;
};

type FormErrors = Partial<
  Record<"name" | "quantity" | "investedValue" | "currentValue", string>
>;

type ExtraCols = { avgLabel: string; currentLabel: string };

type BulkModal = "confirm" | "deleting" | "result" | null;

type Props = {
  title: string;
  addLabel: string;
  apiType?: string;
  filterTypes?: string[];
  fixedType?: string;
  typeOptions?: TypeOption[];
  showQuantity?: boolean;
  quantityLabel?: string;
  extraCols?: ExtraCols;
  showIsin?: boolean;
  showFolioNumber?: boolean;
};

// ── Style constants ───────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-amber transition-colors";

const selectCls =
  "w-full px-3 py-2 text-sm font-sans border border-edge bg-background text-foreground focus:outline-none focus:border-amber transition-colors";

// ── Utility functions ─────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcPerUnit(value: number, qty: number | null): string {
  if (qty == null || qty === 0) return "—";
  return fmt(value / qty);
}

function validateForm(form: FormState, showQuantity: boolean): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Name is required";
  if (showQuantity && form.quantity !== "") {
    const qty = parseFloat(form.quantity);
    if (isNaN(qty) || qty <= 0) errors.quantity = "Quantity must be a positive number";
  }
  if (form.investedValue === "") {
    errors.investedValue = "Invested value is required";
  } else if (isNaN(parseFloat(form.investedValue)) || parseFloat(form.investedValue) < 0) {
    errors.investedValue = "Invested value must be non-negative";
  }
  if (form.currentValue === "") {
    errors.currentValue = "Current value is required";
  } else if (isNaN(parseFloat(form.currentValue)) || parseFloat(form.currentValue) < 0) {
    errors.currentValue = "Current value must be non-negative";
  }
  return errors;
}

// ── Internal components ───────────────────────────────────────────────────────

function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-muted mb-1.5">
        {label}{required && <span className="text-loss ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-loss mt-1">{error}</p>}
    </div>
  );
}

function SkeletonRows({ cols, count = 5 }: { cols: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, row) => (
        <tr key={row} className="border-b border-edge">
          {Array.from({ length: cols }, (_, col) => (
            <td key={col} className="px-4 py-3.5">
              <div
                className={`rounded-sm bg-edge animate-pulse ${
                  col === 0 ? "w-3.5 h-3.5" :
                  col === 1 ? "h-2.5 w-20" :
                  col === 2 ? "h-2.5 w-40" :
                  "h-2.5 w-16"
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-[9px] text-muted/30 select-none">↕</span>;
  return (
    <span className="ml-1 text-[9px] text-amber select-none">
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HoldingsTable({
  title,
  addLabel,
  apiType,
  filterTypes,
  fixedType,
  typeOptions,
  showQuantity   = true,
  quantityLabel  = "Qty",
  extraCols,
  showIsin       = false,
  showFolioNumber = false,
}: Props) {
  const showTypeColumn = !!typeOptions;
  const hasExtraCols   = !!extraCols && showQuantity;
  const defaultType    = typeOptions?.[0]?.value ?? fixedType ?? "";
  const sortKey        = `pinnacle-sort-${title}`;

  const filterKey = filterTypes?.join(",");

  // ── State ─────────────────────────────────────────────────────────────────

  function makeEmptyForm(): FormState {
    return { type: defaultType, name: "", quantity: "", investedValue: "", currentValue: "", isin: "", folioNumber: "" };
  }

  const [holdings,    setHoldings]    = useState<Holding[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [modalMode,   setModalMode]   = useState<null | "add" | string>(null);
  const [form,        setForm]        = useState<FormState>(makeEmptyForm);
  const [formErrors,  setFormErrors]  = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [mergeMessage, setMergeMessage] = useState<string | null>(null);

  // Search & sort
  const [search, setSearch] = useState("");
  const [sort,   setSort]   = useState<SortState>(() => loadSort(sortKey));

  // Selection & bulk delete
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [bulkModal,    setBulkModal]    = useState<BulkModal>(null);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkFailed,   setBulkFailed]   = useState<string[]>([]);

  // Individual delete
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [deleteError,  setDeleteError]  = useState<{ holding: Holding; msg: string } | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────

  const selectAllRef = useRef<HTMLInputElement>(null);

  // ── Derived / memoised ────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = q
      ? holdings.filter((h) => h.name.toLowerCase().includes(q))
      : holdings;

    result = [...result].sort((a, b) => {
      const m = sort.dir === "asc" ? 1 : -1;
      if (sort.field === "name")         return a.name.localeCompare(b.name) * m;
      if (sort.field === "currentValue") return (a.currentValue - b.currentValue) * m;
      // gainPct
      const ag = a.investedValue ? (a.currentValue - a.investedValue) / a.investedValue : 0;
      const bg = b.investedValue ? (b.currentValue - b.investedValue) / b.investedValue : 0;
      return (ag - bg) * m;
    });

    return result;
  }, [holdings, search, sort]);

  const colCount =
    1 +                        // checkbox
    (showTypeColumn ? 1 : 0) +
    1 +                        // Name
    (showQuantity ? 1 : 0) +
    (hasExtraCols ? 2 : 0) +
    3 +                        // Invested + Current + Gain/Loss
    1 +                        // Last Updated
    1;                         // Actions

  const totalInvested = displayed.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrent  = displayed.reduce((s, h) => s + h.currentValue,  0);
  const totalGain     = totalCurrent - totalInvested;

  const allDisplayedSelected  = displayed.length > 0 && displayed.every((h) => selectedIds.has(h.id));
  const someDisplayedSelected = displayed.some((h) => selectedIds.has(h.id)) && !allDisplayedSelected;
  const selectedCount         = selectedIds.size;
  const selectedHoldings      = holdings.filter((h) => selectedIds.has(h.id));

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someDisplayedSelected;
    }
  }, [someDisplayedSelected]);

  useEffect(() => {
    if (!mergeMessage) return;
    const t = setTimeout(() => setMergeMessage(null), 5000);
    return () => clearTimeout(t);
  }, [mergeMessage]);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const url = apiType ? `/api/holdings?type=${apiType}` : "/api/holdings";
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data: Holding[] = await res.json();
      const keys = filterKey?.split(",");
      setHoldings(keys ? data.filter((h) => keys.includes(h.type)) : data);
    } catch {
      setLoadError("Could not load holdings.");
    } finally {
      setLoading(false);
    }
  }, [apiType, filterKey]);

  useEffect(() => { fetchHoldings(); }, [fetchHoldings]);

  // ── Sort helper ───────────────────────────────────────────────────────────

  function toggleSort(field: SortField) {
    const next: SortState =
      sort.field === field
        ? { field, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "name" ? "asc" : "desc" };
    setSort(next);
    saveSort(sortKey, next);
  }

  // ── Selection helpers ─────────────────────────────────────────────────────

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayed.forEach((h) => (checked ? next.add(h.id) : next.delete(h.id)));
      return next;
    });
  }

  // ── Form handlers ─────────────────────────────────────────────────────────

  function openAdd() {
    setForm(makeEmptyForm());
    setFormErrors({});
    setSubmitError(null);
    setModalMode("add");
  }

  function openEdit(h: Holding) {
    setForm({
      type: h.type,
      name: h.name,
      quantity: h.quantity != null ? String(h.quantity) : "",
      investedValue: String(h.investedValue),
      currentValue: String(h.currentValue),
      isin: h.isin ?? "",
      folioNumber: h.folioNumber ?? "",
    });
    setFormErrors({});
    setSubmitError(null);
    setModalMode(h.id);
  }

  function closeModal() {
    setModalMode(null);
    setForm(makeEmptyForm());
    setFormErrors({});
    setSubmitError(null);
  }

  function clearFieldError(field: keyof FormErrors) {
    if (formErrors[field]) setFormErrors((p) => ({ ...p, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateForm(form, showQuantity);
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

    setFormErrors({});
    setSubmitError(null);
    setSubmitting(true);

    try {
      const body = {
        type: fixedType ?? form.type,
        name: form.name.trim(),
        quantity: showQuantity && form.quantity !== "" ? parseFloat(form.quantity) : null,
        investedValue: parseFloat(form.investedValue),
        currentValue: parseFloat(form.currentValue),
        isin:         showIsin         ? (form.isin.trim() || null)         : undefined,
        folioNumber:  showFolioNumber  ? (form.folioNumber.trim() || null)  : undefined,
      };

      const isAdd = modalMode === "add";
      const res = await fetch(
        isAdd ? "/api/holdings" : `/api/holdings/${modalMode}`,
        { method: isAdd ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError((data as { error?: string }).error ?? "Something went wrong. Please try again.");
        return;
      }

      const data = await res.json();
      const wasMerged  = isAdd && data.merged === true;
      const mergedName = wasMerged ? (data.name as string) : "";

      closeModal();
      await fetchHoldings();
      if (wasMerged) setMergeMessage(`Merged with existing holding: ${mergedName}`);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Delete handlers ───────────────────────────────────────────────────────

  async function performDelete(h: Holding) {
    setDeletingId(h.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/holdings/${h.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(h.id); return s; });
      await fetchHoldings();
    } catch {
      setDeleteError({ holding: h, msg: "Delete failed. Please try again." });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDelete(h: Holding) {
    if (!confirm(`Delete "${h.name}"? This cannot be undone.`)) return;
    await performDelete(h);
  }

  async function handleBulkDelete() {
    const toDelete = holdings.filter((h) => selectedIds.has(h.id));
    setBulkModal("deleting");
    setBulkProgress({ done: 0, total: toDelete.length });

    const failed: string[] = [];
    for (let i = 0; i < toDelete.length; i++) {
      setBulkProgress({ done: i + 1, total: toDelete.length });
      try {
        const res = await fetch(`/api/holdings/${toDelete[i].id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        failed.push(toDelete[i].name);
      }
    }

    setBulkFailed(failed);
    setBulkModal("result");
    setSelectedIds(new Set());
    await fetchHoldings();
  }

  function closeBulkModal() {
    setBulkModal(null);
    setBulkFailed([]);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 text-foreground">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-edge">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">{title}</h1>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border border-amber text-amber hover:bg-amber/10 transition-colors"
        >
          + {addLabel}
        </button>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="mb-4 px-3 py-2 text-xs border border-loss/40 text-loss bg-loss/5 flex items-center justify-between">
          <span>{loadError}</span>
          <button
            onClick={fetchHoldings}
            className="ml-3 shrink-0 text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}

      {/* Merge message */}
      {mergeMessage && (
        <div className="mb-4 px-3 py-2 text-xs border border-gain/40 text-gain bg-gain/5 flex items-center justify-between">
          <span>{mergeMessage}</span>
          <button onClick={() => setMergeMessage(null)} className="ml-3 text-muted hover:text-foreground transition-colors">×</button>
        </div>
      )}

      {/* ── Search + bulk delete bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="pl-3 pr-7 py-1.5 text-xs border border-edge bg-background text-foreground placeholder:text-muted focus:outline-none focus:border-amber transition-colors w-52"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors text-[10px]"
            >
              ✕
            </button>
          )}
        </div>

        {selectedCount > 0 && (
          <button
            onClick={() => setBulkModal("confirm")}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-medium border border-loss/50 text-loss hover:bg-loss/10 transition-colors"
          >
            Delete {selectedCount} selected
          </button>
        )}
      </div>

      {/* Delete error banner (individual delete) */}
      {deleteError && (
        <div className="mb-3 px-3 py-2 text-xs border border-loss/40 text-loss bg-loss/5 flex items-center justify-between">
          <span>Could not delete &ldquo;{deleteError.holding.name}&rdquo;.</span>
          <div className="flex items-center gap-3 ml-3 shrink-0">
            <button
              onClick={() => { const h = deleteError.holding; setDeleteError(null); performDelete(h); }}
              className="text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity"
            >
              Retry
            </button>
            <button onClick={() => setDeleteError(null)} className="text-muted hover:text-foreground transition-colors">×</button>
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto border border-edge">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface text-muted uppercase text-[10px] tracking-widest border-b border-edge">
              {/* Select-all checkbox */}
              <th className="px-3 py-2.5 w-9">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allDisplayedSelected}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  className="accent-amber"
                  disabled={loading && holdings.length === 0}
                />
              </th>

              {showTypeColumn && (
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
              )}

              {/* Sortable: Name */}
              <th
                className="px-4 py-2.5 text-left font-medium cursor-pointer hover:text-foreground select-none transition-colors"
                onClick={() => toggleSort("name")}
              >
                Name <SortIcon active={sort.field === "name"} dir={sort.dir} />
              </th>

              {showQuantity && (
                <th className="px-4 py-2.5 text-right font-medium">{quantityLabel}</th>
              )}
              {hasExtraCols && (
                <>
                  <th className="px-4 py-2.5 text-right font-medium">{extraCols!.avgLabel}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{extraCols!.currentLabel}</th>
                </>
              )}

              <th className="px-4 py-2.5 text-right font-medium">Invested (₹)</th>

              {/* Sortable: Current Value */}
              <th
                className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-foreground select-none transition-colors"
                onClick={() => toggleSort("currentValue")}
              >
                Current (₹) <SortIcon active={sort.field === "currentValue"} dir={sort.dir} />
              </th>

              {/* Sortable: Gain/Loss % */}
              <th
                className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-foreground select-none transition-colors"
                onClick={() => toggleSort("gainPct")}
              >
                Gain / Loss <SortIcon active={sort.field === "gainPct"} dir={sort.dir} />
              </th>

              <th className="px-4 py-2.5 text-right font-medium">Updated</th>
              <th className="px-4 py-2.5 text-center font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {/* Skeleton on initial load */}
            {loading && holdings.length === 0 ? (
              <SkeletonRows cols={colCount} count={5} />

            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-xs text-muted">
                  {search
                    ? `No results for "${search}"`
                    : "No entries yet. Add one above."}
                </td>
              </tr>

            ) : (
              displayed.map((h) => {
                const gain      = h.currentValue - h.investedValue;
                const typeLabel = typeOptions?.find((o) => o.value === h.type)?.label ?? h.type;
                const isSelected = selectedIds.has(h.id);
                const isDeleting = deletingId === h.id;

                return (
                  <tr
                    key={h.id}
                    className={`border-b border-edge transition-colors ${
                      isSelected ? "bg-amber/3" : "hover:bg-white/1.5"
                    }`}
                  >
                    {/* Row checkbox */}
                    <td className="px-3 py-2.5 text-center w-9">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(h.id)}
                        className="accent-amber"
                      />
                    </td>

                    {showTypeColumn && (
                      <td className="px-4 py-2.5 text-xs text-muted">{typeLabel}</td>
                    )}
                    <td className="px-4 py-2.5 text-sm text-foreground">{h.name}</td>

                    {showQuantity && (
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-muted tabular-nums">
                        {h.quantity != null ? h.quantity : "—"}
                      </td>
                    )}
                    {hasExtraCols && (
                      <>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted tabular-nums">
                          {calcPerUnit(h.investedValue, h.quantity)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted tabular-nums">
                          {calcPerUnit(h.currentValue, h.quantity)}
                        </td>
                      </>
                    )}

                    <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums">
                      {fmt(h.investedValue)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums">
                      {fmt(h.currentValue)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium ${gain >= 0 ? "text-gain" : "text-loss"}`}>
                      {gain >= 0 ? "+" : ""}{fmt(gain)}
                    </td>

                    <td className="px-4 py-2.5 text-right font-mono text-[10px] text-muted tabular-nums whitespace-nowrap">
                      {relativeTime(h.updatedAt)}
                    </td>

                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <button
                        onClick={() => openEdit(h)}
                        className="mr-3 text-[10px] uppercase tracking-wider text-amber hover:opacity-70 transition-opacity"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(h)}
                        disabled={isDeleting}
                        className="text-[10px] uppercase tracking-wider text-loss hover:opacity-70 disabled:opacity-40 transition-opacity"
                      >
                        {isDeleting ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {!loading && displayed.length > 0 && (
            <tfoot>
              <tr className="border-t border-edge bg-surface">
                <td className="px-3 py-2.5" />
                {showTypeColumn && <td className="px-4 py-2.5" />}
                <td className="px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted font-semibold">
                  {search ? `${displayed.length} result${displayed.length !== 1 ? "s" : ""}` : "Total"}
                </td>
                {showQuantity && <td className="px-4 py-2.5" />}
                {hasExtraCols && <><td className="px-4 py-2.5" /><td className="px-4 py-2.5" /></>}
                <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground tabular-nums font-medium">
                  {fmt(totalInvested)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-amber tabular-nums font-medium">
                  {fmt(totalCurrent)}
                </td>
                <td className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium ${totalGain >= 0 ? "text-gain" : "text-loss"}`}>
                  {totalGain >= 0 ? "+" : ""}{fmt(totalGain)}
                </td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Add / Edit modal ──────────────────────────────────────────────── */}
      {modalMode !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-sm border border-edge bg-surface p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-[10px] uppercase tracking-widest text-muted mb-5">
              {modalMode === "add" ? `Add ${addLabel}` : `Edit ${addLabel}`}
            </h2>

            {submitError && (
              <div className="mb-4 px-3 py-2 text-[10px] border border-loss/40 text-loss bg-loss/5">
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {typeOptions && (
                <Field label="Type" required>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className={selectCls}
                  >
                    {typeOptions.map((o) => (
                      <option key={o.value} value={o.value} style={{ background: "#131615" }}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Name" required error={formErrors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); clearFieldError("name"); }}
                  className={inputCls}
                  placeholder="Enter name"
                />
              </Field>

              {showQuantity && (
                <Field label={quantityLabel} error={formErrors.quantity}>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => { setForm((f) => ({ ...f, quantity: e.target.value })); clearFieldError("quantity"); }}
                    step="any" min="0"
                    className={inputCls}
                    placeholder="e.g. 10"
                  />
                </Field>
              )}

              <Field label="Invested Value (₹)" required error={formErrors.investedValue}>
                <input
                  type="number"
                  value={form.investedValue}
                  onChange={(e) => { setForm((f) => ({ ...f, investedValue: e.target.value })); clearFieldError("investedValue"); }}
                  step="any" min="0"
                  className={inputCls}
                  placeholder="e.g. 50000"
                />
              </Field>

              <Field label="Current Value (₹)" required error={formErrors.currentValue}>
                <input
                  type="number"
                  value={form.currentValue}
                  onChange={(e) => { setForm((f) => ({ ...f, currentValue: e.target.value })); clearFieldError("currentValue"); }}
                  step="any" min="0"
                  className={inputCls}
                  placeholder="e.g. 55000"
                />
              </Field>

              {showIsin && (
                <Field label="ISIN">
                  <input
                    type="text"
                    value={form.isin}
                    onChange={(e) => setForm((f) => ({ ...f, isin: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. INE001A01036"
                    maxLength={12}
                  />
                </Field>
              )}

              {showFolioNumber && (
                <Field label="Folio Number">
                  <input
                    type="text"
                    value={form.folioNumber}
                    onChange={(e) => setForm((f) => ({ ...f, folioNumber: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. 1234567/89"
                  />
                </Field>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {submitting ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bulk delete modal ─────────────────────────────────────────────── */}
      {bulkModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget && bulkModal !== "deleting") closeBulkModal(); }}
        >
          <div className="w-full max-w-sm border border-edge bg-surface p-6">

            {/* Confirm */}
            {bulkModal === "confirm" && (
              <>
                <h2 className="text-[10px] uppercase tracking-widest text-muted mb-4">
                  Delete {selectedHoldings.length} holding{selectedHoldings.length !== 1 ? "s" : ""}?
                </h2>
                <ul className="mb-4 space-y-1 max-h-48 overflow-y-auto">
                  {selectedHoldings.map((h) => (
                    <li key={h.id} className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-loss shrink-0">·</span>
                      <span>{h.name}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted mb-5">This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkDelete}
                    className="flex-1 py-2 text-[10px] uppercase tracking-widest font-semibold bg-loss text-background hover:opacity-90 transition-opacity"
                  >
                    Delete {selectedHoldings.length}
                  </button>
                  <button
                    onClick={closeBulkModal}
                    className="flex-1 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Deleting progress */}
            {bulkModal === "deleting" && (
              <div className="py-4 space-y-4">
                <p className="text-sm text-foreground">
                  Deleting{" "}
                  <span className="font-mono font-medium text-amber">{bulkProgress.done}</span>
                  {" "}of{" "}
                  <span className="font-mono font-medium">{bulkProgress.total}</span>
                </p>
                <div className="h-px bg-edge overflow-hidden">
                  <div
                    className="h-full bg-loss transition-[width] duration-300"
                    style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Result */}
            {bulkModal === "result" && (
              <>
                <h2 className="text-[10px] uppercase tracking-widest text-muted mb-4">Done</h2>

                <div className="mb-4 px-3 py-2.5 border border-gain/30 bg-gain/5 text-xs text-foreground">
                  <span className="text-gain font-mono mr-2">✓</span>
                  {bulkProgress.total - bulkFailed.length} of {bulkProgress.total} deleted
                </div>

                {bulkFailed.length > 0 && (
                  <div className="mb-4 border border-loss/30 bg-loss/5">
                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-loss border-b border-loss/20">
                      {bulkFailed.length} failed
                    </p>
                    <ul className="divide-y divide-edge">
                      {bulkFailed.map((name, i) => (
                        <li key={i} className="px-3 py-2 text-xs text-foreground">{name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={closeBulkModal}
                  className="w-full py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 transition-opacity"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
