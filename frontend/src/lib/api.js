/**
 * AuraBudget — REST API Client (Desktop-aware)
 * Detects if running inside Electron and uses the correct backend URL.
 */

// In desktop mode, Electron loads the page from the backend itself,
// so relative URLs work. In dev mode, Vite proxy handles /api.
const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Dashboard Stats ──────────────────────────────────────────────
export const fetchDashboard = () => request("/analytics/dashboard");

// ── Category Spending (donut chart) ──────────────────────────────
export const fetchCategorySpending = (month, year) => {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (year) params.set("year", year);
  const qs = params.toString();
  return request(`/analytics/spending-by-category${qs ? `?${qs}` : ""}`);
};

// ── Daily Spending (area chart) ──────────────────────────────────
export const fetchDailySpend = (days = 30) =>
  request(`/analytics/daily-spend?days=${days}`);

// ── Monthly Spending (bar chart) ─────────────────────────────────
export const fetchMonthlySpend = (months = 6) =>
  request(`/analytics/monthly-spend?months=${months}`);

// ── Cumulative Monthly Spending (line chart) ─────────────────────
export const fetchCumulativeMonthly = (month, year) => {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (year) params.set("year", year);
  const qs = params.toString();
  return request(`/analytics/cumulative-monthly${qs ? `?${qs}` : ""}`);
};

// ── Transactions ─────────────────────────────────────────────────
export const fetchTransactions = (limit = 50, offset = 0, month, year) => {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  if (month) params.set("month", month);
  if (year) params.set("year", year);
  return request(`/transactions/?${params.toString()}`);
};

export const fetchTransaction = (id) => request(`/transactions/${id}`);

export const deleteTransaction = (id) =>
  request(`/transactions/${id}`, { method: "DELETE" });

export const updateTransaction = (id, data) =>
  request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const createTransaction = (data) =>
  request(`/transactions/`, { method: "POST", body: JSON.stringify(data) });

// ── Receipt Items ────────────────────────────────────────────────
export const createItem = (txId, data) =>
  request(`/transactions/${txId}/items/`, { method: "POST", body: JSON.stringify(data) });

export const updateItem = (txId, itemId, data) =>
  request(`/transactions/${txId}/items/${itemId}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteItem = (txId, itemId) =>
  request(`/transactions/${txId}/items/${itemId}`, { method: "DELETE" });

// ── Categories ───────────────────────────────────────────────────
export const fetchCategories = () => request("/categories/");
export const createCategory = (data) =>
  request("/categories/", { method: "POST", body: JSON.stringify(data) });
export const updateCategory = (id, data) =>
  request(`/categories/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteCategory = (id) =>
  request(`/categories/${id}`, { method: "DELETE" });

// ── Subcategories ───────────────────────────────────────────────
export const fetchSubCategories = (catId) =>
  request(`/categories/${catId}/subcategories`);
export const createSubCategory = (catId, data) =>
  request(`/categories/${catId}/subcategories`, { method: "POST", body: JSON.stringify(data) });
export const updateSubCategory = (catId, subId, data) =>
  request(`/categories/${catId}/subcategories/${subId}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSubCategory = (catId, subId) =>
  request(`/categories/${catId}/subcategories/${subId}`, { method: "DELETE" });

// ── Bitcoin / Assets ─────────────────────────────────────────────
export const fetchBtcPrice = () => request("/assets/btc/price");
export const fetchBtcAddress = (address) =>
  request(`/assets/btc/address/${address}`);
export const fetchBtcHistory = (days = 30) =>
  request(`/assets/btc/history?days=${days}`);

// ── Bank Connections ─────────────────────────────────────────────
export const fetchBankInstitutions = (country = "IT") =>
  request(`/assets/bank/institutions?country=${country}`);
export const connectBank = (institutionId, redirect) =>
  request(`/assets/bank/connect?institution_id=${institutionId}&redirect_url=${encodeURIComponent(redirect)}`, { method: "POST" });
export const fetchBankAccounts = (requisitionId) =>
  request(`/assets/bank/accounts/${requisitionId}`);

// ── Settings Status ──────────────────────────────────────────────
export const fetchSettingsStatus = () => request("/settings/status");

// ── Desktop detection ────────────────────────────────────────────
export const isDesktop = () => !!(window.auraDesktop && window.auraDesktop.isDesktop);
