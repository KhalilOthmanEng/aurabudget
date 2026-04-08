import React, { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchSubCategories,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
} from "../lib/api";

/* ═══════════════════════════════════════════════════════════════════
   COLOR PRESETS
   ═══════════════════════════════════════════════════════════════════ */
const COLOR_PRESETS = [
  "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#3b82f6",
  "#06b6d4", "#f97316", "#6366f1", "#ef4444", "#6b7280",
];

/* ═══════════════════════════════════════════════════════════════════
   CATEGORIES PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [subCategories, setSubCategories] = useState({});
  const [subLoading, setSubLoading] = useState({});
  const [modal, setModal] = useState(null); // { type: "add" | "edit", category?: obj }
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await fetchCategories();
      setCategories(Array.isArray(data) ? data : data.categories || []);
    } catch (e) {
      setError("Failed to load categories.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async (catId) => {
    if (expanded === catId) {
      setExpanded(null);
      return;
    }
    setExpanded(catId);
    if (!subCategories[catId]) {
      setSubLoading((p) => ({ ...p, [catId]: true }));
      try {
        const subs = await fetchSubCategories(catId);
        setSubCategories((p) => ({
          ...p,
          [catId]: Array.isArray(subs) ? subs : subs.subcategories || [],
        }));
      } catch {
        setSubCategories((p) => ({ ...p, [catId]: [] }));
      } finally {
        setSubLoading((p) => ({ ...p, [catId]: false }));
      }
    }
  };

  const handleDeleteCategory = async (cat) => {
    const txCount = cat.transaction_count || cat.transactions_count || 0;
    if (txCount > 0) {
      setError(`Cannot delete "${cat.name}" — it has ${txCount} transaction(s). Reassign them first.`);
      setDeleteConfirm(null);
      return;
    }
    try {
      await deleteCategory(cat.id);
      setDeleteConfirm(null);
      if (expanded === cat.id) setExpanded(null);
      await loadCategories();
    } catch (e) {
      setError(`Failed to delete category: ${e.message}`);
      setDeleteConfirm(null);
    }
  };

  const handleModalSave = async (data) => {
    try {
      if (modal.type === "add") {
        await createCategory(data);
      } else {
        await updateCategory(modal.category.id, data);
      }
      setModal(null);
      await loadCategories();
    } catch (e) {
      throw e;
    }
  };

  const handleAddSub = async (catId, name) => {
    await createSubCategory(catId, { name });
    const subs = await fetchSubCategories(catId);
    setSubCategories((p) => ({
      ...p,
      [catId]: Array.isArray(subs) ? subs : subs.subcategories || [],
    }));
  };

  const handleEditSub = async (catId, subId, name) => {
    await updateSubCategory(catId, subId, { name });
    const subs = await fetchSubCategories(catId);
    setSubCategories((p) => ({
      ...p,
      [catId]: Array.isArray(subs) ? subs : subs.subcategories || [],
    }));
  };

  const handleDeleteSub = async (catId, subId) => {
    await deleteSubCategory(catId, subId);
    const subs = await fetchSubCategories(catId);
    setSubCategories((p) => ({
      ...p,
      [catId]: Array.isArray(subs) ? subs : subs.subcategories || [],
    }));
  };

  const clearError = () => setError(null);

  return (
    <div className="p-6 pb-12 max-w-[900px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-aura-text tracking-tight">
            Categories
          </h1>
          <p className="text-sm text-aura-subtle mt-0.5">
            Manage your spending categories and subcategories.
          </p>
        </div>
        <button
          onClick={() => setModal({ type: "add" })}
          className="px-5 py-2.5 rounded-xl bg-aura-teal text-aura-bg font-display font-semibold text-sm hover:bg-emerald-400 transition-colors"
        >
          + Add Category
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-5 p-4 rounded-xl border bg-red-500/10 border-red-500/20 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="ml-3 text-red-400 hover:text-red-300 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-aura-subtle">Loading categories...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && categories.length === 0 && (
        <div className="flex flex-col items-center justify-center h-60 text-center">
          <span className="text-4xl mb-3">📂</span>
          <p className="text-sm text-aura-subtle mb-4">No categories yet. Create your first category to get started.</p>
          <button
            onClick={() => setModal({ type: "add" })}
            className="px-5 py-2.5 rounded-xl bg-aura-teal text-aura-bg font-display font-semibold text-sm hover:bg-emerald-400 transition-colors"
          >
            + Add Category
          </button>
        </div>
      )}

      {/* Category grid */}
      {!loading && categories.length > 0 && (
        <div className="space-y-3">
          {categories.map((cat) => {
            const isExpanded = expanded === cat.id;
            const color = cat.color || "#6b7280";
            const icon = cat.icon || "🏷️";
            const subCount = cat.subcategory_count ?? cat.subcategories_count ?? (subCategories[cat.id]?.length || 0);
            const txCount = cat.transaction_count ?? cat.transactions_count ?? 0;

            return (
              <div key={cat.id} className="animate-fade-in">
                {/* Category card */}
                <div
                  className={clsx(
                    "bg-aura-card border border-aura-border rounded-2xl overflow-hidden transition-all",
                    isExpanded && "shadow-card"
                  )}
                  style={{ borderLeftColor: color, borderLeftWidth: "4px" }}
                >
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer select-none hover:bg-aura-surface/40 transition-colors"
                    onClick={() => handleExpand(cat.id)}
                  >
                    {/* Icon + Name */}
                    <span className="text-2xl flex-shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-display font-semibold text-sm text-aura-text truncate">
                          {cat.name}
                        </h3>
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-aura-subtle">
                          {subCount} subcategor{subCount === 1 ? "y" : "ies"}
                        </span>
                        <span className="text-[11px] text-aura-subtle">
                          {txCount} transaction{txCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setModal({ type: "edit", category: cat }); }}
                        className="p-2 rounded-lg text-aura-subtle hover:text-aura-teal hover:bg-aura-tealDim transition-colors"
                        title="Edit category"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(cat); }}
                        className="p-2 rounded-lg text-aura-subtle hover:text-aura-red hover:bg-aura-redDim transition-colors"
                        title="Delete category"
                      >
                        <TrashIcon />
                      </button>
                      <div className={clsx(
                        "ml-1 text-aura-subtle transition-transform",
                        isExpanded && "rotate-180"
                      )}>
                        <ChevronIcon />
                      </div>
                    </div>
                  </div>

                  {/* Expanded subcategories */}
                  {isExpanded && (
                    <div className="border-t border-aura-border bg-aura-surface/30 px-4 py-3">
                      {subLoading[cat.id] ? (
                        <p className="text-xs text-aura-subtle py-2">Loading subcategories...</p>
                      ) : (
                        <SubCategoryList
                          catId={cat.id}
                          items={subCategories[cat.id] || []}
                          onAdd={handleAddSub}
                          onEdit={handleEditSub}
                          onDelete={handleDeleteSub}
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

      {/* Category modal (add / edit) */}
      {modal && (
        <CategoryModal
          mode={modal.type}
          category={modal.category}
          onSave={handleModalSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <DeleteConfirmModal
          category={deleteConfirm}
          onConfirm={() => handleDeleteCategory(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SUBCATEGORY LIST
   ═══════════════════════════════════════════════════════════════════ */
function SubCategoryList({ catId, items, onAdd, onEdit, onDelete }) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const editRef = useRef(null);
  const addRef = useRef(null);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onAdd(catId, trimmed);
      setNewName("");
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
      if (addRef.current) addRef.current.focus();
    }
  };

  const handleEditSave = async (subId) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await onEdit(catId, subId, trimmed);
    } catch (e) {
      console.error(e);
    }
    setEditingId(null);
  };

  const handleDeleteConfirm = async (subId) => {
    try {
      await onDelete(catId, subId);
    } catch (e) {
      console.error(e);
    }
    setConfirmDelete(null);
  };

  return (
    <div>
      {items.length === 0 && (
        <p className="text-xs text-aura-subtle py-1 mb-2">No subcategories yet.</p>
      )}

      <div className="space-y-1">
        {items.map((sub) => (
          <div
            key={sub.id}
            className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-aura-card/60 transition-colors"
          >
            <span className="text-aura-muted text-xs">--</span>

            {editingId === sub.id ? (
              <input
                ref={editRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditSave(sub.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => handleEditSave(sub.id)}
                className="flex-1 bg-aura-bg border border-aura-border rounded-md px-2 py-1 text-xs text-aura-text focus:outline-none focus:border-aura-teal"
              />
            ) : (
              <span
                className="flex-1 text-xs text-aura-text cursor-pointer hover:text-aura-teal transition-colors"
                onClick={() => { setEditingId(sub.id); setEditValue(sub.name); }}
                title="Click to edit"
              >
                {sub.name}
              </span>
            )}

            {confirmDelete === sub.id ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDeleteConfirm(sub.id)}
                  className="text-[10px] px-2 py-0.5 rounded bg-aura-red/20 text-aura-red hover:bg-aura-red/30 transition-colors"
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
            ) : (
              <button
                onClick={() => setConfirmDelete(sub.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-aura-subtle hover:text-aura-red transition-all"
                title="Delete subcategory"
              >
                <XIcon />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add subcategory */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-aura-border/50">
        <input
          ref={addRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="New subcategory..."
          disabled={adding}
          className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal disabled:opacity-50"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="px-3 py-1.5 rounded-lg bg-aura-teal/15 text-aura-teal text-xs font-medium hover:bg-aura-teal/25 transition-colors disabled:opacity-40"
        >
          {adding ? "..." : "Add"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CATEGORY MODAL (Add / Edit)
   ═══════════════════════════════════════════════════════════════════ */
function CategoryModal({ mode, category, onSave, onClose }) {
  const [name, setName] = useState(category?.name || "");
  const [icon, setIcon] = useState(category?.icon || "");
  const [color, setColor] = useState(category?.color || COLOR_PRESETS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (nameRef.current) nameRef.current.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), icon: icon || undefined, color });
    } catch (err) {
      setError(err.message || "Failed to save.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-aura-card border border-aura-border rounded-2xl shadow-deep p-6 w-full max-w-md mx-4 animate-fade-in"
      >
        <h2 className="font-display font-bold text-lg text-aura-text mb-5">
          {mode === "add" ? "Add Category" : "Edit Category"}
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Name */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-aura-subtle mb-1.5">Name</label>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Food & Drinks"
            className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
          />
        </div>

        {/* Icon */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-aura-subtle mb-1.5">Icon (emoji)</label>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="e.g. 🍽️"
            className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
          />
        </div>

        {/* Color */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-aura-subtle mb-2">Color</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={clsx(
                  "w-8 h-8 rounded-lg transition-all",
                  color === c
                    ? "ring-2 ring-aura-text ring-offset-2 ring-offset-aura-card scale-110"
                    : "hover:scale-105"
                )}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
            />
            <span className="text-xs text-aura-subtle font-mono">{color}</span>
          </div>
        </div>

        {/* Preview */}
        <div className="mb-5 p-3 rounded-xl bg-aura-surface border border-aura-border flex items-center gap-3">
          <span className="text-xl">{icon || "🏷️"}</span>
          <span className="font-display font-semibold text-sm text-aura-text">
            {name || "Category Name"}
          </span>
          <div className="w-3 h-3 rounded-full ml-auto" style={{ backgroundColor: color }} />
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
            {saving ? "Saving..." : mode === "add" ? "Create" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DELETE CONFIRMATION MODAL
   ═══════════════════════════════════════════════════════════════════ */
function DeleteConfirmModal({ category, onConfirm, onCancel }) {
  const txCount = category.transaction_count ?? category.transactions_count ?? 0;
  const hasTransactions = txCount > 0;

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-aura-card border border-aura-border rounded-2xl shadow-deep p-6 w-full max-w-sm mx-4 animate-fade-in">
        <h2 className="font-display font-bold text-lg text-aura-text mb-3">
          Delete Category
        </h2>

        {hasTransactions ? (
          <div className="mb-5">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 mb-3">
              This category has {txCount} transaction{txCount === 1 ? "" : "s"}. You must reassign or delete them before removing this category.
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl">{category.icon || "🏷️"}</span>
              <span className="font-display font-semibold text-sm text-aura-text">{category.name}</span>
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <p className="text-sm text-aura-subtle mb-3">
              Are you sure you want to delete this category? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-aura-surface border border-aura-border">
              <span className="text-xl">{category.icon || "🏷️"}</span>
              <span className="font-display font-semibold text-sm text-aura-text">{category.name}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-aura-surface border border-aura-border text-sm text-aura-subtle hover:text-aura-text transition-colors"
          >
            {hasTransactions ? "Close" : "Cancel"}
          </button>
          {!hasTransactions && (
            <button
              onClick={onConfirm}
              className="px-5 py-2 rounded-xl bg-aura-red text-white font-display font-semibold text-sm hover:bg-red-500 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ICONS (inline SVG)
   ═══════════════════════════════════════════════════════════════════ */
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
