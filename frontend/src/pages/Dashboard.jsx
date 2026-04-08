import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import clsx from "clsx";
import {
  fetchDashboard,
  fetchCategorySpending,
  fetchDailySpend,
  fetchMonthlySpend,
  fetchCumulativeMonthly,
  fetchTransactions,
  fetchTransaction,
  deleteTransaction,
  fetchBtcPrice,
  fetchBtcAddress,
  fetchBtcHistory,
} from "../lib/api";

/* ═══════════════════════════════════════════════════════════════════
   CATEGORY ICON MAP
   ═══════════════════════════════════════════════════════════════════ */
const CAT_ICONS = {
  "Food & Drinks": "🍽️", "Groceries": "🛒", "Shopping": "🛍️",
  "Housing": "🏠", "Transportation": "🚌", "Vehicle": "🚗",
  "Life & Entertainment": "🎭", "Communication, PC": "📱",
  "Financial Expenses": "💰", "Others": "❓",
  "🛒 Grocery": "🛒", "🍽️ Restaurants": "🍽️", "🚗 Transport": "🚗",
  "🏠 Housing": "🏠", "💊 Health": "💊", "🎮 Entertainment": "🎮",
  "👗 Clothing": "👗", "📱 Technology": "📱", "✈️ Travel": "✈️",
  "❓ Other": "❓",
};
function getCatIcon(name) { return CAT_ICONS[name] || "🏷️"; }

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [catSpend, setCatSpend] = useState([]);
  const [monthlySpend, setMonthlySpend] = useState([]);
  const [cumulativeData, setCumulativeData] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedTx, setSelectedTx] = useState(null);
  const [txDetail, setTxDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Bitcoin state
  const [btcPrice, setBtcPrice] = useState(null);
  const [btcWallets, setBtcWallets] = useState([]);
  const [btcInput, setBtcInput] = useState("");
  const [btcLoading, setBtcLoading] = useState(false);
  const [btcHistory, setBtcHistory] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load saved BTC addresses from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aura_btc_addresses") || "[]");
      if (saved.length > 0) {
        // Immediately show placeholders so addresses appear even if fetch is slow
        setBtcWallets(saved.map((addr) => ({ address: addr, balance_btc: null, balance_eur: null, tx_count: null })));
        saved.forEach((addr) => refreshBtcAddress(addr));
      }
    } catch {}
    // Load BTC price history
    fetchBtcHistory(30).then(setBtcHistory).catch(() => {});
  }, []);

  const refreshBtcAddress = async (address) => {
    try {
      const data = await fetchBtcAddress(address);
      setBtcWallets((prev) => prev.map((w) => w.address === address ? data : w));
    } catch (err) {
      console.error("BTC address fetch error:", err);
    }
  };

  const loadBtcAddress = async (address) => {
    if (!address.trim()) return;
    setBtcLoading(true);
    // Save address immediately so it persists even if the API call is slow/fails
    const saved = JSON.parse(localStorage.getItem("aura_btc_addresses") || "[]");
    if (!saved.includes(address)) {
      localStorage.setItem("aura_btc_addresses", JSON.stringify([...saved, address]));
      setBtcWallets((prev) => [...prev.filter((w) => w.address !== address), { address, balance_btc: null, balance_eur: null, tx_count: null }]);
    }
    try {
      const data = await fetchBtcAddress(address);
      setBtcWallets((prev) => prev.map((w) => w.address === address ? data : w));
    } catch (err) {
      console.error("BTC address error:", err);
    } finally {
      setBtcLoading(false);
    }
  };

  const removeBtcWallet = (address) => {
    setBtcWallets((prev) => prev.filter((w) => w.address !== address));
    const saved = JSON.parse(localStorage.getItem("aura_btc_addresses") || "[]");
    localStorage.setItem("aura_btc_addresses", JSON.stringify(saved.filter((a) => a !== address)));
  };

  const loadData = useCallback(async () => {
    try {
      const [s, c, m, cum, t] = await Promise.all([
        fetchDashboard(),
        fetchCategorySpending(),
        fetchMonthlySpend(6),
        fetchCumulativeMonthly(),
        fetchTransactions(100),
      ]);
      setStats(s);
      setCatSpend(c);
      setMonthlySpend(m);
      setCumulativeData(cum);
      setTransactions(t);

      // Also refresh BTC price
      try {
        const price = await fetchBtcPrice();
        setBtcPrice(price);
      } catch {}
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    // 60 s is plenty for a budget app — no need to hammer the backend every 10 s
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleTxClick = async (tx) => {
    if (selectedTx === tx.id) { setSelectedTx(null); setTxDetail(null); return; }
    setSelectedTx(tx.id);
    try { setTxDetail(await fetchTransaction(tx.id)); } catch { setTxDetail(null); }
  };

  const handleDelete = async (id) => {
    try { await deleteTransaction(id); setSelectedTx(null); setTxDetail(null); loadData(); }
    catch (err) { console.error("Delete failed:", err); }
  };

  if (loading) return <LoadingScreen />;

  const visibleTx = showAll ? transactions : transactions.slice(0, 8);
  const totalBtcEur = btcWallets.reduce((s, w) => s + w.balance_eur, 0);

  return (
    <div className="p-6 pb-12 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-display font-bold text-2xl text-aura-text tracking-tight">Dashboard</h1>
          <p className="text-sm text-aura-subtle mt-0.5">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-aura-muted">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-aura-subtle hover:text-aura-teal transition-colors px-2 py-1 rounded-lg hover:bg-aura-tealDim"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
          <div className="flex items-center gap-1.5 text-xs text-aura-subtle">
            <div className="w-2 h-2 rounded-full bg-emerald-400 live-dot" />Live
          </div>
        </div>
      </div>

      {/* ── Stat Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Monthly Spend" value={`€${(stats?.monthly_spend || 0).toFixed(2)}`} change={stats?.monthly_spend_change_pct} icon={<SpendIcon />} color="teal" />
        <StatCard label="Transactions" value={stats?.transaction_count || 0} sub="this month" icon={<TxIcon />} color="blue" />
        <StatCard label="Top Merchant" value={stats?.top_merchant || "—"} sub="most visited" icon={<StarIcon />} color="amber" />
        <StatCard label="Avg per Receipt" value={`€${(stats?.avg_transaction || 0).toFixed(2)}`} sub="this month" icon={<AvgIcon />} color="purple" />
      </div>

      {/* ── Cumulative Monthly Spend (Wallet-style) ───────────── */}
      <div className="mb-6">
        <Card title={`${format(new Date(), "MMMM yyyy")} — Spending`} icon="📊">
          <CumulativeChart data={cumulativeData} />
        </Card>
      </div>

      {/* ── Charts Row: Monthly + Donut ───────────────────────── */}
      <div className="grid grid-cols-12 gap-4 mb-6">
        <div className="col-span-8">
          <Card title="Expenses by Month" icon="📅">
            <div className="h-[260px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySpend} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3d" vertical={false} />
                  <XAxis dataKey="month_label" tick={{ fill: "#7a8aa8", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#1e2a3d" }} />
                  <YAxis tick={{ fill: "#7a8aa8", fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `€${v}`} />
                  <Tooltip content={<CustomTooltip prefix="€" />} />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#00d4aa" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="amount" fill="url(#barGrad)" radius={[6, 6, 0, 0]} name="Spent" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <div className="col-span-4">
          <Card title="By Category" icon="🎯">
            <CategoryDonut data={catSpend} />
          </Card>
        </div>
      </div>

      {/* ── Transactions + Assets ─────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Recent Transactions — 7 cols */}
        <div className="col-span-7">
          <Card
            title="Last Records"
            icon="📋"
            action={transactions.length > 8 && (
              <button onClick={() => setShowAll(!showAll)} className="text-xs text-aura-teal hover:underline">
                {showAll ? "Show less" : `View all (${transactions.length})`}
              </button>
            )}
          >
            <div className={clsx("mt-1 space-y-0.5", showAll && "max-h-[500px] overflow-y-auto pr-1")}>
              {visibleTx.length === 0 && (
                <div className="text-center py-12 text-aura-subtle text-sm">No transactions yet. Send a receipt via Telegram!</div>
              )}
              {visibleTx.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} isOpen={selectedTx === tx.id} detail={selectedTx === tx.id ? txDetail : null}
                  onClick={() => handleTxClick(tx)} onDelete={() => handleDelete(tx.id)} />
              ))}
            </div>
          </Card>
        </div>

        {/* Assets Panel — 5 cols */}
        <div className="col-span-5 space-y-4">
          {/* Bitcoin Tracker */}
          <Card title="Bitcoin Assets" icon="₿">
            <div className="mt-2">
              {/* BTC Price banner */}
              {btcPrice && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/15 mb-3">
                  <div>
                    <div className="text-xs text-aura-subtle">BTC / EUR</div>
                    <div className="font-display font-bold text-lg text-aura-text">€{btcPrice.btc_eur.toLocaleString()}</div>
                  </div>
                  <div className={clsx("text-sm font-medium text-right", btcPrice.eur_24h_change >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {btcPrice.eur_24h_change >= 0 ? "↑" : "↓"} {Math.abs(btcPrice.eur_24h_change).toFixed(1)}%
                    <div className="text-[10px] text-aura-subtle">24h</div>
                  </div>
                </div>
              )}

              {/* BTC Price History Chart */}
              {btcHistory.length > 0 && (
                <BtcHistoryChart data={btcHistory} totalBtc={btcWallets.reduce((s, w) => s + (w.balance_btc || 0), 0)} />
              )}

              {/* Wallets */}
              {btcWallets.map((w) => (
                <div key={w.address} className="p-3 rounded-xl bg-aura-surface border border-aura-border mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-aura-subtle font-mono truncate max-w-[180px]">{w.address}</span>
                    <button onClick={() => removeBtcWallet(w.address)} className="text-xs text-red-400 hover:text-red-300 ml-2 flex-shrink-0">×</button>
                  </div>
                  {w.balance_btc !== null ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-display font-bold text-base text-aura-text">₿ {w.balance_btc.toFixed(8)}</div>
                        <div className="text-xs text-aura-subtle">≈ €{(w.balance_eur || 0).toLocaleString()}</div>
                      </div>
                      <div className="text-xs text-aura-subtle">{w.tx_count} txs</div>
                    </div>
                  ) : (
                    <div className="text-xs text-aura-muted animate-pulse">Loading balance...</div>
                  )}
                </div>
              ))}

              {/* Total BTC Holdings */}
              {btcWallets.filter((w) => w.balance_eur !== null).length > 1 && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/3 mb-3">
                  <span className="text-xs text-aura-subtle">Total Holdings</span>
                  <span className="text-sm font-display font-semibold text-aura-teal">
                    €{totalBtcEur.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Add address input */}
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={btcInput}
                  onChange={(e) => setBtcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && btcInput.trim()) {
                      loadBtcAddress(btcInput.trim());
                      setBtcInput("");
                    }
                  }}
                  placeholder="Enter BTC address..."
                  className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-xs text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
                />
                <button
                  onClick={() => { if (btcInput.trim()) { loadBtcAddress(btcInput.trim()); setBtcInput(""); } }}
                  disabled={btcLoading}
                  className="px-3 py-2 rounded-lg bg-aura-tealDim text-aura-teal text-xs font-medium hover:bg-aura-teal/20 transition-colors disabled:opacity-50"
                >
                  {btcLoading ? "..." : "Track"}
                </button>
              </div>
            </div>
          </Card>

          {/* Bank Connections placeholder */}
          <Card title="Bank Accounts" icon="🏦">
            <div className="mt-2">
              <BankSetupPanel />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   BTC PRICE HISTORY CHART
   ═══════════════════════════════════════════════════════════════════ */
function BtcHistoryChart({ data, totalBtc }) {
  const portfolioData = data.map((d) => ({
    ...d,
    portfolio: totalBtc > 0 ? parseFloat((totalBtc * d.price_eur).toFixed(2)) : null,
  }));

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-aura-subtle uppercase tracking-wider">30-Day Price</span>
        {totalBtc > 0 && (
          <span className="text-[10px] text-amber-400">
            Portfolio: €{(totalBtc * (data[data.length - 1]?.price_eur || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      <div className="h-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={portfolioData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="btcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#00d4aa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3d" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#7a8aa8", fontSize: 9 }} tickLine={false} axisLine={false}
              interval={Math.floor(data.length / 5)} />
            <YAxis tick={{ fill: "#7a8aa8", fontSize: 9 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} width={38} />
            <Tooltip content={<BtcTooltip />} />
            <Area type="monotone" dataKey="price_eur" stroke="#f59e0b" strokeWidth={1.5}
              fill="url(#btcGrad)" dot={false} name="BTC/EUR" />
            {totalBtc > 0 && (
              <Area type="monotone" dataKey="portfolio" stroke="#00d4aa" strokeWidth={1.5}
                fill="url(#portGrad)" dot={false} name="Portfolio" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BtcTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-aura-card border border-aura-border rounded-xl px-2.5 py-1.5 shadow-deep text-xs">
      <p className="text-aura-subtle mb-0.5">{payload[0]?.payload?.date}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: €{typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CUMULATIVE MONTHLY CHART (like Wallet by BudgetBakers)
   ═══════════════════════════════════════════════════════════════════ */
function CumulativeChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center text-sm text-aura-subtle">No spending data this month.</div>;
  }

  const maxCum = data[data.length - 1]?.cumulative || 0;

  return (
    <div className="h-[220px] mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff4d6d" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ff4d6d" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3d" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "#7a8aa8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#1e2a3d" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#7a8aa8", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `€${v}`}
            domain={[0, "auto"]}
          />
          <Tooltip content={<CumulativeTooltip />} />
          {/* Budget reference line — you can customize this */}
          <ReferenceLine y={maxCum} stroke="#2a3a55" strokeDasharray="6 4" label={{ value: `€${maxCum.toFixed(0)}`, position: "right", fill: "#7a8aa8", fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#ff4d6d"
            strokeWidth={2.5}
            fill="url(#cumGrad)"
            name="Cumulative"
            dot={false}
            activeDot={{ r: 4, fill: "#ff4d6d", stroke: "#080b14", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CumulativeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-aura-card border border-aura-border rounded-xl px-3 py-2 shadow-deep">
      <p className="text-xs text-aura-subtle">Day {d.day} — {d.date}</p>
      <p className="text-sm font-medium text-aura-text">Total: €{d.cumulative.toFixed(2)}</p>
      {d.daily_amount > 0 && (
        <p className="text-xs text-aura-subtle">Today: €{d.daily_amount.toFixed(2)}</p>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   BANK SETUP PANEL
   ═══════════════════════════════════════════════════════════════════ */
function BankSetupPanel() {
  return (
    <div className="space-y-3">
      {/* Revolut */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-aura-surface border border-aura-border">
        <div className="w-8 h-8 rounded-lg bg-[#0075EB]/15 flex items-center justify-center text-sm">🔵</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-aura-text">Revolut</div>
          <div className="text-[10px] text-aura-subtle">Open Banking (PSD2)</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-400">Setup needed</span>
      </div>
      {/* Credem */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-aura-surface border border-aura-border">
        <div className="w-8 h-8 rounded-lg bg-[#006633]/15 flex items-center justify-center text-sm">🟢</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-aura-text">Credem</div>
          <div className="text-[10px] text-aura-subtle">Open Banking (PSD2)</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-400">Setup needed</span>
      </div>
      {/* Instructions */}
      <div className="p-3 rounded-xl bg-aura-bg border border-aura-border">
        <p className="text-[11px] text-aura-subtle leading-relaxed">
          To connect banks, add your GoCardless credentials to <code className="text-aura-teal">.env</code>:
        </p>
        <pre className="mt-2 text-[10px] text-aura-muted font-mono leading-relaxed bg-aura-surface rounded-lg p-2 overflow-x-auto">
{`GOCARDLESS_SECRET_ID=xxx
GOCARDLESS_SECRET_KEY=xxx`}
        </pre>
        <p className="text-[10px] text-aura-muted mt-2">
          Sign up at <span className="text-aura-teal">bankaccountdata.gocardless.com</span> or use Enable Banking as alternative.
        </p>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

function Card({ title, icon, action, children }) {
  return (
    <div className="bg-aura-card border border-aura-border rounded-2xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <h3 className="font-display font-semibold text-sm text-aura-text">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, change, sub, icon, color }) {
  const colors = {
    teal:   { bg: "bg-aura-tealDim",  border: "border-emerald-500/10", text: "text-aura-teal" },
    blue:   { bg: "bg-blue-500/8",     border: "border-blue-500/10",    text: "text-blue-400" },
    amber:  { bg: "bg-aura-amberDim", border: "border-amber-500/10",   text: "text-amber-400" },
    purple: { bg: "bg-purple-500/8",   border: "border-purple-500/10",  text: "text-purple-400" },
  };
  const c = colors[color] || colors.teal;
  return (
    <div className={clsx("rounded-2xl p-4 border shadow-card transition-transform hover:scale-[1.02]", "bg-aura-card", c.border)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-aura-subtle font-medium uppercase tracking-wider">{label}</span>
        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", c.bg)}>{icon}</div>
      </div>
      <div className="font-display font-bold text-xl text-aura-text truncate">{value}</div>
      {change !== undefined && (
        <div className={clsx("text-xs mt-1 font-medium", change > 0 ? "text-red-400" : change < 0 ? "text-emerald-400" : "text-aura-subtle")}>
          {change > 0 ? "↑" : change < 0 ? "↓" : "→"} {Math.abs(change).toFixed(1)}% vs last month
        </div>
      )}
      {sub && <div className="text-xs text-aura-subtle mt-1">{sub}</div>}
    </div>
  );
}

function CategoryDonut({ data }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const total = data.reduce((s, d) => s + d.total, 0);
  if (data.length === 0) return <div className="flex items-center justify-center h-[280px] text-aura-subtle text-sm">No data this month.</div>;
  return (
    <div>
      <div className="relative h-[180px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="total" nameKey="category"
              strokeWidth={2} stroke="#080b14"
              onMouseEnter={(_, i) => setActiveIdx(i)} onMouseLeave={() => setActiveIdx(null)}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} opacity={activeIdx === null || activeIdx === i ? 1 : 0.3} style={{ transition: "opacity 0.2s" }} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <div className="text-lg font-display font-bold text-aura-text">€{total.toFixed(0)}</div>
          <div className="text-[10px] text-aura-subtle uppercase tracking-wider">Total</div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
        {data.map((cat, i) => (
          <div key={i} className={clsx("flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-default", activeIdx === i ? "bg-white/5" : "hover:bg-white/3")}
            onMouseEnter={() => setActiveIdx(i)} onMouseLeave={() => setActiveIdx(null)}>
            <div className="cat-dot" style={{ backgroundColor: cat.color }} />
            <span className="text-xs text-aura-text flex-1 truncate">{getCatIcon(cat.category)} {cat.category}</span>
            <span className="text-xs font-medium text-aura-subtle">€{cat.total.toFixed(0)}</span>
            <span className="text-[10px] text-aura-muted w-8 text-right">{cat.percentage.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionRow({ tx, isOpen, detail, onClick, onDelete }) {
  const dateStr = (() => {
    try { const d = parseISO(tx.transaction_date); if (isToday(d)) return "Today"; if (isYesterday(d)) return "Yesterday"; return format(d, "MMM d, yyyy"); }
    catch { return tx.transaction_date; }
  })();
  const icon = tx.main_category_icon || getCatIcon(tx.main_category);
  return (
    <div>
      <button onClick={onClick} className={clsx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left", isOpen ? "bg-white/5" : "hover:bg-white/3")}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: (tx.main_category_color || "#6b7280") + "18" }}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-aura-text truncate pr-2">{tx.merchant || "Unknown"}</span>
            <span className="text-sm font-display font-semibold text-aura-text flex-shrink-0">-€{tx.total_amount.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-xs text-aura-subtle truncate">{tx.main_category || "Uncategorized"}{tx.items_count > 0 && ` · ${tx.items_count} items`}</span>
            <span className="text-[11px] text-aura-muted flex-shrink-0">{dateStr}</span>
          </div>
        </div>
      </button>
      {isOpen && detail && (
        <div className="mx-3 mb-2 p-3 rounded-xl bg-aura-surface border border-aura-border animate-slide-up">
          {detail.items?.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {detail.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-aura-subtle">×{item.quantity}</span>
                    <span className="text-aura-text truncate">{item.name}</span>
                    {item.sub_category && <span className="text-[10px] text-aura-muted bg-aura-card px-1.5 py-0.5 rounded">{item.sub_category}</span>}
                  </div>
                  <span className="text-aura-text font-medium flex-shrink-0 ml-2">€{item.total_price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-aura-border">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
            <span className="text-xs text-aura-subtle">{tx.currency} · {dateStr}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label, prefix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-aura-card border border-aura-border rounded-xl px-3 py-2 shadow-deep">
      <p className="text-xs text-aura-subtle mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium text-aura-text">{p.name}: {prefix}{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</p>
      ))}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center mx-auto mb-4 animate-pulse-slow">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
          </svg>
        </div>
        <p className="text-sm text-aura-subtle">Loading your finances...</p>
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────────────── */
function SpendIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function TxIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function StarIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function AvgIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>; }
