"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relativeTime } from "@/lib/utils";
import CSVImportMapper, { type ImportRow } from "@/components/CSVImportMapper";

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

// ── CSV utilities ─────────────────────────────────────────────────────────────

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      fields.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  notes: string;
};

type FormErrors = Partial<
  Record<"name" | "quantity" | "investedValue" | "currentValue", string>
>;

type ExtraCols = { avgLabel: string; currentLabel: string };
type BulkModal = "confirm" | "deleting" | "result" | null;

type ImportModal = "preview" | "importing" | "done" | null;

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
  onRowClick?: (holding: Holding) => void;
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
  onRowClick,
}: Props) {
  const showTypeColumn = !!typeOptions;
  const hasExtraCols   = !!extraCols && showQuantity;
  const defaultType    = typeOptions?.[0]?.value ?? fixedType ?? "";
  const sortKey        = `pinnacle-sort-${title}`;
  const filterKey      = filterTypes?.join(",");
  const importStorageKey =
    fixedType === "STOCK"        ? "pinnacle-csv-mapping-stocks" :
    fixedType === "MUTUAL_FUND"  ? "pinnacle-csv-mapping-mf"     :
    "pinnacle-csv-mapping-others";

  // ── State ─────────────────────────────────────────────────────────────────

  function makeEmptyForm(): FormState {
    return { type: defaultType, name: "", quantity: "", investedValue: "", currentValue: "", isin: "", folioNumber: "", notes: "" };
  }

  const [holdings,     setHoldings]     = useState<Holding[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [modalMode,    setModalMode]    = useState<null | "add" | string>(null);
  const [form,         setForm]         = useState<FormState>(makeEmptyForm);
  const [formErrors,   setFormErrors]   = useState<FormErrors>({});
  const [submitError,  setSubmitError]  = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [mergeMessage, setMergeMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort,   setSort]   = useState<SortState>(() => loadSort(sortKey));

  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [bulkModal,    setBulkModal]    = useState<BulkModal>(null);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkFailed,   setBulkFailed]   = useState<string[]>([]);

  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [deleteError,  setDeleteError]  = useState<{ holding: Holding; msg: string } | null>(null);

  // Notes inline edit
  const [editingNotes, setEditingNotes] = useState<{ id: string; value: string } | null>(null);

  // CSV import
  const [mapperFile,     setMapperFile]     = useState<File | null>(null);
  const [importRows,     setImportRows]     = useState<ImportRow[]>([]);
  const [importModal,    setImportModal]    = useState<ImportModal>(null);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, current: "" });
  const [importSummary,  setImportSummary]  = useState<{ saved: number; merged: number; failed: { name: string; error: string }[] } | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────

  const selectAllRef  = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

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
      const ag = a.investedValue ? (a.currentValue - a.investedValue) / a.investedValue : 0;
      const bg = b.investedValue ? (b.currentValue - b.investedValue) / b.investedValue : 0;
      return (ag - bg) * m;
    });

    return result;
  }, [holdings, search, sort]);

  const colCount =
    1 +
    (showTypeColumn ? 1 : 0) +
    1 +                        // Name
    1 +                        // Notes
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
    if (selectAllRef.current) selectAllRef.current.indeterminate = someDisplayedSelected;
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
      notes: h.notes ?? "",
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
        notes: form.notes.trim() || null,
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

  // ── Notes inline edit ─────────────────────────────────────────────────────

  async function handleNotesSave(id: string, newValue: string, original: string | null) {
    setEditingNotes(null);
    const trimmed = newValue.trim();
    if (trimmed === (original ?? "")) return;
    try {
      const res = await fetch(`/api/holdings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: trimmed || null }),
      });
      if (!res.ok) throw new Error();
      const updated: Holding = await res.json();
      setHoldings((prev) => prev.map((h) => h.id === id ? { ...h, notes: updated.notes } : h));
    } catch { /* ignore */ }
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  function handleExport() {
    const today = new Date().toISOString().slice(0, 10);
    const slug  = title.toLowerCase().replace(/\s+/g, "-");

    const headers: string[] = [];
    if (showTypeColumn) headers.push("Type");
    headers.push("Name");
    if (showIsin) headers.push("ISIN");
    if (showFolioNumber) headers.push("Folio Number");
    if (showQuantity) headers.push(quantityLabel ?? "Qty/Units");
    if (hasExtraCols) { headers.push(extraCols!.avgLabel); headers.push(extraCols!.currentLabel); }
    headers.push("Invested Value (Rs)", "Current Value (Rs)", "Gain/Loss (Rs)", "Gain/Loss %", "Notes", "Last Updated");

    const csvRows = displayed.map((h) => {
      const gain    = h.currentValue - h.investedValue;
      const gainPct = h.investedValue > 0 ? ((gain / h.investedValue) * 100).toFixed(2) : "0.00";
      const typeLabel = typeOptions?.find((o) => o.value === h.type)?.label ?? h.type;

      const cols: (string | number)[] = [];
      if (showTypeColumn) cols.push(csvEscape(typeLabel));
      cols.push(csvEscape(h.name));
      if (showIsin) cols.push(csvEscape(h.isin ?? ""));
      if (showFolioNumber) cols.push(csvEscape(h.folioNumber ?? ""));
      if (showQuantity) cols.push(h.quantity ?? "");
      if (hasExtraCols) {
        cols.push(h.quantity ? (h.investedValue / h.quantity).toFixed(4) : "");
        cols.push(h.quantity ? (h.currentValue / h.quantity).toFixed(4) : "");
      }
      cols.push(
        h.investedValue.toFixed(2),
        h.currentValue.toFixed(2),
        gain.toFixed(2),
        gainPct,
        csvEscape(h.notes ?? ""),
        new Date(h.updatedAt).toLocaleDateString("en-IN"),
      );
      return cols.join(",");
    });

    downloadCSV([headers.join(","), ...csvRows].join("\n"), `pinnacle-${slug}-${today}.csv`);
  }

  // ── CSV import ────────────────────────────────────────────────────────────

  function handleImportFile(file: File) {
    setImportSummary(null);
    setMapperFile(file);
    if (importFileRef.current) importFileRef.current.value = "";
  }

  function handleMapped(rows: ImportRow[]) {
    setImportRows(rows);
    setMapperFile(null);
    setImportModal("preview");
  }

  function computeImportStatus(row: ImportRow): "new" | "merge" {
    if (row.isin && holdings.some((h) => h.isin === row.isin)) return "merge";
    if (row.name && holdings.some((h) => h.name.toLowerCase() === row.name.toLowerCase())) return "merge";
    return "new";
  }

  function updateImportRow(idx: number, patch: Partial<ImportRow>) {
    setImportRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  async function handleImportConfirm() {
    const toImport = importRows.filter((r) => r.include);
    if (!toImport.length) return;

    setImportModal("importing");
    setImportProgress({ done: 0, total: toImport.length, current: toImport[0]?.name ?? "" });

    let saved = 0;
    let merged = 0;
    const failed: { name: string; error: string }[] = [];

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      setImportProgress({ done: i + 1, total: toImport.length, current: row.name });

      const qty      = parseFloat(row.quantity);
      const invested = parseFloat(row.investedValue);
      const current  = parseFloat(row.currentValue);

      if (!row.name.trim() || isNaN(invested) || isNaN(current)) {
        failed.push({ name: row.name || `Row ${row.idx + 1}`, error: "Missing required fields" });
        continue;
      }

      const rowType =
        fixedType ??
        typeOptions?.find((o) => o.value === row.type || o.label.toLowerCase() === row.type.toLowerCase())?.value ??
        typeOptions?.[0]?.value ??
        row.type;

      const body: Record<string, unknown> = {
        type: rowType,
        name: row.name.trim(),
        investedValue: invested,
        currentValue: current,
      };
      if (showQuantity && row.quantity !== "" && !isNaN(qty) && qty > 0) body.quantity = qty;
      if (showIsin && row.isin) body.isin = row.isin;
      if (showFolioNumber && row.folioNumber) body.folioNumber = row.folioNumber;
      if (row.notes) body.notes = row.notes;

      try {
        const res  = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({})) as { error?: string; merged?: boolean };
        if (!res.ok) {
          failed.push({ name: row.name, error: data.error ?? `HTTP ${res.status}` });
        } else if (data.merged) {
          merged++;
        } else {
          saved++;
        }
      } catch {
        failed.push({ name: row.name, error: "Network error" });
      }
    }

    setImportSummary({ saved, merged, failed });
    setImportModal("done");
    await fetchHoldings();
  }

  function closeImportModal() {
    setImportModal(null);
    setImportRows([]);
    setImportSummary(null);
    setMapperFile(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const importSelectedCount = importRows.filter((r) => r.include).length;
  const importPct = importProgress.total
    ? Math.round((importProgress.done / importProgress.total) * 100)
    : 0;

  return (
    <main className="p-6 text-foreground">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-edge">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">{title}</h1>
        <div className="flex items-center gap-2">
          {holdings.length > 0 && (
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Export CSV
            </button>
          )}
          <button
            onClick={() => importFileRef.current?.click()}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Import CSV
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
          />
          <button
            onClick={openAdd}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold border border-amber text-amber hover:bg-amber/10 transition-colors"
          >
            + {addLabel}
          </button>
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="mb-4 px-3 py-2 text-xs border border-loss/40 text-loss bg-loss/5 flex items-center justify-between">
          <span>{loadError}</span>
          <button onClick={fetchHoldings} className="ml-3 shrink-0 text-[10px] uppercase tracking-wider text-loss hover:opacity-70 transition-opacity">
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

      {/* Delete error banner */}
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

              {showTypeColumn && <th className="px-4 py-2.5 text-left font-medium">Type</th>}

              <th
                className="px-4 py-2.5 text-left font-medium cursor-pointer hover:text-foreground select-none transition-colors"
                onClick={() => toggleSort("name")}
              >
                Name <SortIcon active={sort.field === "name"} dir={sort.dir} />
              </th>

              <th className="px-4 py-2.5 text-left font-medium w-40">Notes</th>

              {showQuantity && <th className="px-4 py-2.5 text-right font-medium">{quantityLabel}</th>}
              {hasExtraCols && (
                <>
                  <th className="px-4 py-2.5 text-right font-medium">{extraCols!.avgLabel}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{extraCols!.currentLabel}</th>
                </>
              )}

              <th className="px-4 py-2.5 text-right font-medium">Invested (₹)</th>

              <th
                className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-foreground select-none transition-colors"
                onClick={() => toggleSort("currentValue")}
              >
                Current (₹) <SortIcon active={sort.field === "currentValue"} dir={sort.dir} />
              </th>

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
            {loading && holdings.length === 0 ? (
              <SkeletonRows cols={colCount} count={5} />

            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-xs text-muted">
                  {search ? `No results for "${search}"` : "No entries yet. Add one above."}
                </td>
              </tr>

            ) : (
              displayed.map((h) => {
                const gain       = h.currentValue - h.investedValue;
                const typeLabel  = typeOptions?.find((o) => o.value === h.type)?.label ?? h.type;
                const isSelected = selectedIds.has(h.id);
                const isDeleting = deletingId === h.id;
                const isEditingThisNote = editingNotes?.id === h.id;

                return (
                  <tr
                    key={h.id}
                    className={`border-b border-edge transition-colors ${isSelected ? "bg-amber/3" : "hover:bg-white/1.5"}`}
                  >
                    <td className="px-3 py-2.5 text-center w-9">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(h.id)} className="accent-amber" />
                    </td>

                    {showTypeColumn && <td className="px-4 py-2.5 text-xs text-muted">{typeLabel}</td>}
                    <td
                      className={`px-4 py-2.5 text-sm text-foreground ${onRowClick ? "cursor-pointer hover:text-amber transition-colors" : ""}`}
                      onClick={onRowClick ? () => onRowClick(h) : undefined}
                    >
                      {h.name}
                    </td>

                    {/* Notes cell */}
                    <td className="px-4 py-2 w-40 max-w-40">
                      {isEditingThisNote ? (
                        <input
                          type="text"
                          autoFocus
                          value={editingNotes.value}
                          onChange={(e) => setEditingNotes({ id: h.id, value: e.target.value })}
                          onBlur={() => handleNotesSave(h.id, editingNotes.value, h.notes)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleNotesSave(h.id, editingNotes.value, h.notes);
                            if (e.key === "Escape") setEditingNotes(null);
                          }}
                          className="w-full px-1.5 py-0.5 text-xs font-sans border border-amber/50 bg-background text-foreground focus:outline-none"
                        />
                      ) : (
                        <span
                          className="block truncate text-xs cursor-default"
                          title={h.notes ?? "Double-click to add a note"}
                          onDoubleClick={() => setEditingNotes({ id: h.id, value: h.notes ?? "" })}
                        >
                          {h.notes ? (
                            <span className="text-muted">{h.notes}</span>
                          ) : (
                            <span className="text-muted/20 select-none">—</span>
                          )}
                        </span>
                      )}
                    </td>

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
                      <button onClick={() => openEdit(h)} className="mr-3 text-[10px] uppercase tracking-wider text-amber hover:opacity-70 transition-opacity">
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
                <td className="px-4 py-2.5" /> {/* Notes */}
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

              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className={`${inputCls} resize-none`}
                  placeholder="Optional notes…"
                />
              </Field>

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

      {/* ── CSV column mapper ────────────────────────────────────────────── */}
      {mapperFile && (
        <CSVImportMapper
          file={mapperFile}
          fixedType={fixedType}
          typeOptions={typeOptions}
          showQuantity={showQuantity}
          quantityLabel={quantityLabel}
          showIsin={showIsin}
          showFolioNumber={showFolioNumber}
          storageKey={importStorageKey}
          onMapped={handleMapped}
          onClose={() => { setMapperFile(null); }}
        />
      )}

      {/* ── CSV import modal ──────────────────────────────────────────────── */}
      {importModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && importModal === "preview") closeImportModal(); }}
        >
          <div className="w-full max-w-5xl border border-edge bg-surface max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-5 py-3.5 border-b border-edge flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-[10px] uppercase tracking-widest text-muted font-semibold">
                  {importModal === "preview" && `Import Preview — ${importSelectedCount} of ${importRows.length} selected`}
                  {importModal === "importing" && "Importing…"}
                  {importModal === "done" && "Import Complete"}
                </h2>
                {importModal === "preview" && (
                  <p className="text-[10px] text-muted/50 mt-0.5">
                    Edit cells directly. Double-check status badges. Deselect rows to skip.
                  </p>
                )}
              </div>
              {importModal !== "importing" && (
                <button
                  onClick={closeImportModal}
                  className="text-muted hover:text-foreground transition-colors text-sm ml-4 shrink-0"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Preview table */}
            {importModal === "preview" && (
              <>
                <div className="overflow-auto flex-1">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-surface z-10">
                      <tr className="text-muted uppercase text-[10px] tracking-widest border-b border-edge">
                        <th className="px-3 py-2 w-9">
                          <input
                            type="checkbox"
                            checked={importRows.length > 0 && importRows.every((r) => r.include)}
                            onChange={(e) => setImportRows((prev) => prev.map((r) => ({ ...r, include: e.target.checked })))}
                            className="accent-amber"
                          />
                        </th>
                        {showTypeColumn && <th className="px-3 py-2 text-left font-medium">Type</th>}
                        <th className="px-3 py-2 text-left font-medium">Name *</th>
                        {showIsin && <th className="px-3 py-2 text-left font-medium">ISIN</th>}
                        {showFolioNumber && <th className="px-3 py-2 text-left font-medium">Folio</th>}
                        {showQuantity && <th className="px-3 py-2 text-right font-medium">{quantityLabel}</th>}
                        <th className="px-3 py-2 text-right font-medium">Invested (₹) *</th>
                        <th className="px-3 py-2 text-right font-medium">Current (₹) *</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, i) => {
                        const status = computeImportStatus(row);
                        return (
                          <tr
                            key={i}
                            className={`border-b border-edge transition-colors ${row.include ? "hover:bg-white/1.5" : "opacity-40"}`}
                          >
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={row.include}
                                onChange={(e) => updateImportRow(i, { include: e.target.checked })}
                                className="accent-amber"
                              />
                            </td>

                            {showTypeColumn && (
                              <td className="px-2 py-1.5">
                                <select
                                  value={row.type}
                                  onChange={(e) => updateImportRow(i, { type: e.target.value })}
                                  className="w-full px-1.5 py-0.5 text-xs border border-edge bg-background text-foreground focus:outline-none focus:border-amber/60 transition-colors"
                                >
                                  {typeOptions?.map((o) => (
                                    <option key={o.value} value={o.value} style={{ background: "#131615" }}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                            )}

                            <td className="px-2 py-1.5 min-w-45">
                              <input
                                type="text"
                                value={row.name}
                                onChange={(e) => updateImportRow(i, { name: e.target.value })}
                                className="w-full px-1.5 py-0.5 text-xs border border-edge bg-background text-foreground focus:outline-none focus:border-amber/60 transition-colors"
                              />
                            </td>

                            {showIsin && (
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.isin}
                                  onChange={(e) => updateImportRow(i, { isin: e.target.value })}
                                  className="w-full px-1.5 py-0.5 text-xs border border-edge bg-background text-foreground focus:outline-none focus:border-amber/60 transition-colors"
                                />
                              </td>
                            )}

                            {showFolioNumber && (
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.folioNumber}
                                  onChange={(e) => updateImportRow(i, { folioNumber: e.target.value })}
                                  className="w-full px-1.5 py-0.5 text-xs border border-edge bg-background text-foreground focus:outline-none focus:border-amber/60 transition-colors"
                                />
                              </td>
                            )}

                            {showQuantity && (
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.quantity}
                                  onChange={(e) => updateImportRow(i, { quantity: e.target.value })}
                                  className="w-full px-1.5 py-0.5 text-xs font-mono text-right border border-edge bg-background text-foreground focus:outline-none focus:border-amber/60 transition-colors"
                                />
                              </td>
                            )}

                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.investedValue}
                                onChange={(e) => updateImportRow(i, { investedValue: e.target.value })}
                                className="w-full px-1.5 py-0.5 text-xs font-mono text-right border border-edge bg-background text-foreground focus:outline-none focus:border-amber/60 transition-colors"
                              />
                            </td>

                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.currentValue}
                                onChange={(e) => updateImportRow(i, { currentValue: e.target.value })}
                                className="w-full px-1.5 py-0.5 text-xs font-mono text-right border border-edge bg-background text-foreground focus:outline-none focus:border-amber/60 transition-colors"
                              />
                            </td>

                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {status === "merge" ? (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-widest border border-amber/40 text-amber bg-amber/5">
                                  will merge
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-widest border border-gain/40 text-gain bg-gain/5">
                                  new
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 border-t border-edge flex items-center justify-between shrink-0">
                  <button
                    onClick={closeImportModal}
                    className="px-4 py-2 text-[10px] uppercase tracking-widest border border-edge text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportConfirm}
                    disabled={importSelectedCount === 0}
                    className="px-4 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    Import {importSelectedCount} holding{importSelectedCount !== 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}

            {/* Progress */}
            {importModal === "importing" && (
              <div className="p-8 space-y-4 flex-1">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-foreground">
                    Saving{" "}
                    <span className="font-mono font-medium text-amber">{importProgress.done}</span>
                    {" "}of{" "}
                    <span className="font-mono font-medium">{importProgress.total}</span>
                  </p>
                  <span className="text-[11px] font-mono text-muted">{importPct}%</span>
                </div>
                <div className="h-px bg-edge overflow-hidden">
                  <div
                    className="h-full bg-amber transition-[width] duration-300 ease-out"
                    style={{ width: `${importPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted truncate">{importProgress.current}</p>
              </div>
            )}

            {/* Done */}
            {importModal === "done" && importSummary && (
              <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div className="flex items-start gap-3 px-4 py-3.5 border border-gain/30 bg-gain/5">
                  <span className="text-gain font-mono text-sm shrink-0">✓</span>
                  <p className="text-sm text-foreground">
                    <span className="font-medium">
                      {importSummary.saved} new
                    </span>
                    {importSummary.merged > 0 && (
                      <span className="text-muted">
                        {" "}+ <span className="text-amber font-medium">{importSummary.merged} merged</span>
                      </span>
                    )}
                  </p>
                </div>

                {importSummary.failed.length > 0 && (
                  <div className="border border-loss/30">
                    <div className="px-4 py-2 bg-loss/5 border-b border-loss/20">
                      <p className="text-[10px] uppercase tracking-widest text-loss font-medium">
                        {importSummary.failed.length} failed
                      </p>
                    </div>
                    <ul className="divide-y divide-edge">
                      {importSummary.failed.map((f, i) => (
                        <li key={i} className="px-4 py-2.5">
                          <p className="text-xs text-foreground">{f.name}</p>
                          <p className="text-[10px] text-loss mt-0.5 font-mono">{f.error}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={closeImportModal}
                  className="px-4 py-2 text-[10px] uppercase tracking-widest font-semibold bg-amber text-background hover:opacity-90 transition-opacity"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
