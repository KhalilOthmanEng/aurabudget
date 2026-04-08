import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { format, parseISO } from "date-fns";
import clsx from "clsx";
import {
  fetchTransactions,
  fetchTransaction,
  deleteTransaction,
  updateTransaction,
  createTransaction,
  fetchCategories,
  fetchSubCategories,
  createItem,
  updateItem,
  deleteItem,
} from "../lib/api";

const PAGE_SIZE = 20;

const MONTHS = [
  "All Months", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD"];

/* ═══════════════════════════════════════════════════════════════════
   RECORDS PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function Records() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef(null);
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterCategory, setFilterCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedTx, setSelectedTx] = useState(null);
  const [txDetail, setTxDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [error, setError] = useState(null);
  const [totalShown, setTotalShown] = useState(0);

  useEffect(() => {
    fetchCategories()
      .then((data) => setCategories(Array.isArray(data) ? data : data.categories || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async (reset = true) => {
    setLoading(true);
    try {
      const newOffset = reset ? 0 : offset;
      const month = filterMonth > 0 ? filterMonth : undefined;
      const data = await fetchTransactions(PAGE_SIZE + 1, newOffset, month, filterYear);
      const rows = Array.isArray(data) ? data : [];
      const hasMoreRows = rows.length > PAGE_SIZE;
      const visible = rows.slice(0, PAGE_SIZE);

      setHasMore(hasMoreRows);
      if (reset) {
        setTransactions(visible);
        setOffset(PAGE_SIZE);
        setTotalShown(visible.length);
      } else {
        setTransactions((prev) => [...prev, ...visible]);
        setOffset((prev) => prev + PAGE_SIZE);
        setTotalShown((prev) => prev + visible.length);
      }
    } catch (e) {
      setError("Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear, offset]);

  // Reset & reload when filters change
  useEffect(() => {
    load(true);
  }, [filterMonth, filterYear]);

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    // Debounce: only filter 250 ms after the user stops typing
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  // Memoize filtered list so it only recomputes when data or search term changes
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return transactions.filter((tx) => {
      const matchSearch = !q
        || (tx.merchant || "").toLowerCase().includes(q)
        || (tx.main_category || "").toLowerCase().includes(q);
      const matchCat = !filterCategory || tx.main_category === filterCategory;
      return matchSearch && matchCat;
    });
  }, [transactions, debouncedSearch, filterCategory]);

  const handleSelect = async (tx) => {
    if (selectedTx === tx.id) {
      setSelectedTx(null);
      setTxDetail(null);
      return;
    }
    setSelectedTx(tx.id);
    setTxDetail(null);
    setDetailLoading(true);
    try {
      const detail = await fetchTransaction(tx.id);
      setTxDetail(detail);
    } catch {
      setTxDetail(tx);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (tx) => {
    try {
      await deleteTransaction(tx.id);
      setDeleteConfirm(null);
      setSelectedTx(null);
      setTxDetail(null);
      load(true);
    } catch (e) {
      setError(`Failed to delete: ${e.message}`);
      setDeleteConfirm(null);
    }
  };

  const handleEditSave = async (id, data) => {
    await updateTransaction(id, data);
    setEditModal(null);
    load(true);
  };

  const handleAddSave = async (data) => {
    await createTransaction(data);
    setAddModal(false);
    load(true);
  };

  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  return (
    <div className="p-6 pb-12 max-w-[960px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-aura-text tracking-tight">
            Records
          </h1>
          <p className="text-sm text-aura-subtle mt-0.5">
            Full transaction history — search, filter, edit, and manage.
          </p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="px-5 py-2.5 rounded-xl bg-aura-teal text-aura-bg font-display font-semibold text-sm hover:bg-emerald-400 transition-colors"
        >
          + Add Transaction
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-5 p-4 rounded-xl border bg-red-500/10 border-red-500/20 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-300 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Filters bar */}
      <div className="mb-5 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-aura-subtle" />
          <input
            value={search}
            onChange={handleSearch}
            placeholder="Search merchant or category..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-aura-card border border-aura-border text-sm text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
          />
        </div>

        {/* Month picker */}
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(Number(e.target.value))}
          className="px-3 py-2 rounded-xl bg-aura-card border border-aura-border text-sm text-aura-text focus:outline-none focus:border-aura-teal"
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>

        {/* Year picker */}
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(Number(e.target.value))}
          className="px-3 py-2 rounded-xl bg-aura-card border border-aura-border text-sm text-aura-text focus:outline-none focus:border-aura-teal"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-xl bg-aura-card border border-aura-border text-sm text-aura-text focus:outline-none focus:border-aura-teal"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
          ))}
        </select>
      </div>

      {/* Transaction list */}
      {loading && transactions.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-aura-subtle">Loading transactions...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 text-center">
          <span className="text-4xl mb-3">📋</span>
          <p className="text-sm text-aura-subtle mb-1">No transactions found.</p>
          <p className="text-xs text-aura-muted">Try adjusting the filters or add a new transaction.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx) => {
            const isOpen = selectedTx === tx.id;
            const color = tx.main_category_color || "#6b7280";
            const icon = tx.main_category_icon || "❓";
            const dateStr = tx.transaction_date
              ? format(parseISO(String(tx.transaction_date)), "dd MMM yyyy")
              : "—";

            return (
              <div key={tx.id} className="animate-fade-in">
                <div
                  className={clsx(
                    "bg-aura-card border border-aura-border rounded-2xl overflow-hidden transition-all",
                    isOpen && "shadow-card"
                  )}
                  style={{ borderLeftColor: color, borderLeftWidth: "4px" }}
                >
                  {/* Row */}
                  <div
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-aura-surface/40 transition-colors select-none"
                    onClick={() => handleSelect(tx)}
                  >
                    <span className="text-xl flex-shrink-0">{icon}</span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-sm text-aura-text truncate">
                          {tx.merchant || "Unknown"}
                        </span>
                        {tx.items_count > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-aura-tealDim text-aura-teal font-mono">
                            {tx.items_count} item{tx.items_count !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-aura-subtle">{dateStr}</span>
                        {tx.main_category && (
                          <span className="text-[11px] text-aura-muted">{tx.main_category}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-display font-bold text-base text-aura-text">
                        {tx.currency} {Number(tx.total_amount).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditModal(tx); }}
                          className="p-1.5 rounded-lg text-aura-subtle hover:text-aura-teal hover:bg-aura-tealDim transition-colors"
                          title="Edit"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(tx); }}
                          className="p-1.5 rounded-lg text-aura-subtle hover:text-aura-red hover:bg-aura-redDim transition-colors"
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className={clsx("text-aura-subtle transition-transform", isOpen && "rotate-180")}>
                        <ChevronIcon />
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-aura-border bg-aura-surface/30 px-4 py-3">
                      {detailLoading ? (
                        <p className="text-xs text-aura-subtle py-2">Loading details...</p>
                      ) : (
                        <ItemsList
                          tx={txDetail || tx}
                          items={txDetail?.items || []}
                          onRefresh={async () => {
                            setDetailLoading(true);
                            try {
                              const d = await fetchTransaction(tx.id);
                              setTxDetail(d);
                            } finally {
                              setDetailLoading(false);
                            }
                            load(true);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => load(false)}
            className="px-6 py-2.5 rounded-xl bg-aura-card border border-aura-border text-sm text-aura-subtle hover:text-aura-text hover:border-aura-teal transition-colors"
          >
            Load more
          </button>
        </div>
      )}
      {loading && transactions.length > 0 && (
        <div className="mt-4 flex justify-center">
          <p className="text-xs text-aura-subtle">Loading...</p>
        </div>
      )}

      {/* Modals */}
      {deleteConfirm && (
        <DeleteConfirmModal
          tx={deleteConfirm}
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      {editModal && (
        <TransactionModal
          mode="edit"
          tx={editModal}
          categories={categories}
          onSave={(data) => handleEditSave(editModal.id, data)}
          onClose={() => setEditModal(null)}
        />
      )}
      {addModal && (
        <TransactionModal
          mode="add"
          categories={categories}
          onSave={handleAddSave}
          onClose={() => setAddModal(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ITEMS LIST (inline edit / add / delete per receipt item)
   ═══════════════════════════════════════════════════════════════════ */
function ItemsList({ tx, items: initialItems, onRefresh }) {
  const [items, setItems] = useState(initialItems);
  const [subCategories, setSubCategories] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "1", unit_price: "", total_price: "", sub_category: "" });

  // Keep items in sync when parent refreshes
  useEffect(() => { setItems(initialItems); }, [initialItems]);

  // Load subcategories for the transaction's category
  useEffect(() => {
    if (!tx?.main_category) return;
    fetchCategories().then((cats) => {
      const list = Array.isArray(cats) ? cats : cats.categories || [];
      const cat = list.find((c) => c.name === tx.main_category);
      if (cat) {
        fetchSubCategories(cat.id).then((subs) => {
          setSubCategories(Array.isArray(subs) ? subs : subs.subcategories || []);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [tx?.main_category]);

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValues({
      name: item.name,
      quantity: String(item.quantity ?? 1),
      unit_price: item.unit_price != null ? String(item.unit_price) : "",
      total_price: String(item.total_price),
      sub_category: item.sub_category || "",
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditValues({}); };

  const saveEdit = async (itemId) => {
    setSaving(true);
    try {
      const payload = {
        name: editValues.name.trim() || undefined,
        quantity: editValues.quantity !== "" ? parseFloat(editValues.quantity) : undefined,
        unit_price: editValues.unit_price !== "" ? parseFloat(editValues.unit_price) : undefined,
        total_price: parseFloat(editValues.total_price),
        sub_category: editValues.sub_category,
      };
      const updated = await updateItem(tx.id, itemId, payload);
      setItems((prev) => prev.map((it) => it.id === itemId ? updated : it));
      setEditingId(null);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId) => {
    setSaving(true);
    try {
      await deleteItem(tx.id, itemId);
      setItems((prev) => prev.filter((it) => it.id !== itemId));
      setConfirmDelete(null);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim() || !newItem.total_price) return;
    setSaving(true);
    try {
      const payload = {
        name: newItem.name.trim(),
        quantity: parseFloat(newItem.quantity) || 1,
        unit_price: newItem.unit_price !== "" ? parseFloat(newItem.unit_price) : undefined,
        total_price: parseFloat(newItem.total_price),
        sub_category: newItem.sub_category || undefined,
      };
      const created = await createItem(tx.id, payload);
      setItems((prev) => [...prev, created]);
      setNewItem({ name: "", quantity: "1", unit_price: "", total_price: "", sub_category: "" });
      setAddingNew(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const currency = tx?.currency || "EUR";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium text-aura-subtle uppercase tracking-wider">Items</p>
        <button
          onClick={() => setAddingNew((v) => !v)}
          className="text-[11px] px-2 py-0.5 rounded-md bg-aura-tealDim text-aura-teal hover:bg-aura-teal/30 transition-colors"
        >
          {addingNew ? "Cancel" : "+ Add item"}
        </button>
      </div>

      {items.length === 0 && !addingNew && (
        <p className="text-xs text-aura-muted py-1 mb-1">No item breakdown yet.</p>
      )}

      <div className="space-y-1">
        {items.map((item) =>
          editingId === item.id ? (
            /* ── Edit row ── */
            <div key={item.id} className="py-2 px-2 rounded-xl bg-aura-card/80 border border-aura-teal/30 space-y-2">
              <input
                autoFocus
                value={editValues.name}
                onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Item name"
                className="w-full bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editValues.total_price}
                  onChange={(e) => setEditValues((v) => ({ ...v, total_price: e.target.value }))}
                  placeholder="Total price"
                  className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editValues.unit_price}
                  onChange={(e) => setEditValues((v) => ({ ...v, unit_price: e.target.value }))}
                  placeholder="Unit price"
                  className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
                />
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={editValues.quantity}
                  onChange={(e) => setEditValues((v) => ({ ...v, quantity: e.target.value }))}
                  placeholder="Qty"
                  className="w-16 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
                />
              </div>
              {subCategories.length > 0 && (
                <select
                  value={editValues.sub_category}
                  onChange={(e) => setEditValues((v) => ({ ...v, sub_category: e.target.value }))}
                  className="w-full bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text focus:outline-none focus:border-aura-teal"
                >
                  <option value="">— No subcategory —</option>
                  {subCategories.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={cancelEdit} className="text-[11px] px-3 py-1 rounded-lg bg-aura-surface border border-aura-border text-aura-subtle hover:text-aura-text transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => saveEdit(item.id)}
                  disabled={saving || !editValues.name?.trim() || !editValues.total_price}
                  className="text-[11px] px-3 py-1 rounded-lg bg-aura-teal text-aura-bg font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-40"
                >
                  {saving ? "..." : "Save"}
                </button>
              </div>
            </div>
          ) : confirmDelete === item.id ? (
            /* ── Delete confirm inline ── */
            <div key={item.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-aura-redDim border border-aura-red/20">
              <span className="text-xs text-red-400">Delete "{item.name}"?</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={saving}
                  className="text-[10px] px-2 py-0.5 rounded bg-aura-red/30 text-aura-red hover:bg-aura-red/50 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="text-[10px] px-2 py-0.5 rounded bg-aura-surface text-aura-subtle hover:text-aura-text transition-colors"
                >
                  No
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal row ── */
            <div
              key={item.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg group hover:bg-aura-card/60 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-aura-muted text-xs">·</span>
                <span
                  className="text-xs text-aura-text cursor-pointer hover:text-aura-teal transition-colors truncate"
                  onClick={() => startEdit(item)}
                  title="Click to edit"
                >
                  {item.name}
                </span>
                {item.sub_category && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-aura-surface text-aura-subtle border border-aura-border flex-shrink-0">
                    {item.sub_category}
                  </span>
                )}
                {item.quantity !== 1 && (
                  <span className="text-[11px] text-aura-muted flex-shrink-0">×{item.quantity}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-xs font-mono text-aura-text">
                  {currency} {Number(item.total_price).toFixed(2)}
                </span>
                <button
                  onClick={() => startEdit(item)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-aura-subtle hover:text-aura-teal transition-all"
                  title="Edit item"
                >
                  <PencilIcon />
                </button>
                <button
                  onClick={() => setConfirmDelete(item.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-aura-subtle hover:text-aura-red transition-all"
                  title="Delete item"
                >
                  <XIcon />
                </button>
              </div>
            </div>
          )
        )}

        {/* ── New item row ── */}
        {addingNew && (
          <div className="py-2 px-2 mt-1 rounded-xl bg-aura-card/80 border border-aura-border space-y-2">
            <input
              autoFocus
              value={newItem.name}
              onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))}
              placeholder="Item name"
              className="w-full bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={newItem.total_price}
                onChange={(e) => setNewItem((v) => ({ ...v, total_price: e.target.value }))}
                placeholder="Total price"
                className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newItem.unit_price}
                onChange={(e) => setNewItem((v) => ({ ...v, unit_price: e.target.value }))}
                placeholder="Unit price"
                className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
              />
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={newItem.quantity}
                onChange={(e) => setNewItem((v) => ({ ...v, quantity: e.target.value }))}
                placeholder="Qty"
                className="w-16 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
              />
            </div>
            {subCategories.length > 0 && (
              <select
                value={newItem.sub_category}
                onChange={(e) => setNewItem((v) => ({ ...v, sub_category: e.target.value }))}
                className="w-full bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text focus:outline-none focus:border-aura-teal"
              >
                <option value="">— No subcategory —</option>
                {subCategories.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setAddingNew(false); setNewItem({ name: "", quantity: "1", unit_price: "", total_price: "", sub_category: "" }); }}
                className="text-[11px] px-3 py-1 rounded-lg bg-aura-surface border border-aura-border text-aura-subtle hover:text-aura-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                disabled={saving || !newItem.name.trim() || !newItem.total_price}
                className="text-[11px] px-3 py-1 rounded-lg bg-aura-teal text-aura-bg font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-40"
              >
                {saving ? "..." : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   TRANSACTION MODAL (Add / Edit)
   ═══════════════════════════════════════════════════════════════════ */
function TransactionModal({ mode, tx, categories, onSave, onClose }) {
  const today = new Date().toISOString().split("T")[0];
  const [merchant, setMerchant] = useState(tx?.merchant || "");
  const [amount, setAmount] = useState(tx ? String(tx.total_amount) : "");
  const [currency, setCurrency] = useState(tx?.currency || "EUR");
  const [txDate, setTxDate] = useState(
    tx?.transaction_date ? String(tx.transaction_date) : today
  );
  const [category, setCategory] = useState(tx?.main_category || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!merchant.trim()) { setError("Merchant name is required."); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError("Amount must be a positive number."); return; }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        merchant: merchant.trim(),
        total_amount: parsedAmount,
        currency,
        transaction_date: txDate,
        main_category: category || undefined,
      });
    } catch (err) {
      setError(err.message || "Failed to save.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-aura-card border border-aura-border rounded-2xl shadow-deep p-6 w-full max-w-md mx-4 animate-fade-in"
      >
        <h2 className="font-display font-bold text-lg text-aura-text mb-5">
          {mode === "add" ? "Add Transaction" : "Edit Transaction"}
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Merchant */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-aura-subtle mb-1.5">Merchant</label>
          <input
            ref={inputRef}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="e.g. Lidl, Amazon..."
            className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
          />
        </div>

        {/* Amount + Currency */}
        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-aura-subtle mb-1.5">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-aura-subtle mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text focus:outline-none focus:border-aura-teal"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-aura-subtle mb-1.5">Date</label>
          <input
            type="date"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text focus:outline-none focus:border-aura-teal"
          />
        </div>

        {/* Category */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-aura-subtle mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text focus:outline-none focus:border-aura-teal"
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-aura-surface border border-aura-border text-sm text-aura-subtle hover:text-aura-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-aura-teal text-aura-bg font-display font-semibold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : mode === "add" ? "Add" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DELETE CONFIRMATION MODAL
   ═══════════════════════════════════════════════════════════════════ */
function DeleteConfirmModal({ tx, onConfirm, onCancel }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-aura-card border border-aura-border rounded-2xl shadow-deep p-6 w-full max-w-sm mx-4 animate-fade-in">
        <h2 className="font-display font-bold text-lg text-aura-text mb-3">Delete Transaction</h2>
        <p className="text-sm text-aura-subtle mb-4">
          Are you sure you want to delete this transaction? This action cannot be undone.
        </p>
        <div className="p-3 rounded-xl bg-aura-surface border border-aura-border mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{tx.main_category_icon || "❓"}</span>
            <span className="text-sm font-display font-semibold text-aura-text">{tx.merchant || "Unknown"}</span>
          </div>
          <span className="text-sm font-mono text-aura-text">{tx.currency} {Number(tx.total_amount).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-aura-surface border border-aura-border text-sm text-aura-subtle hover:text-aura-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl bg-aura-red text-white font-display font-semibold text-sm hover:bg-red-500 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ICONS
   ═══════════════════════════════════════════════════════════════════ */
function SearchIcon({ className }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
