import React from "react";
import clsx from "clsx";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: DashIcon },
  { id: "transactions", label: "Records", icon: ListIcon },
  { id: "categories", label: "Categories", icon: GridIcon },
  { id: "settings", label: "Settings", icon: GearIcon },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-aura-surface border-r border-aura-border flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 pt-6 pb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-glow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <div>
            <h1 className="font-display font-bold text-base text-aura-text tracking-tight leading-none">
              AuraBudget
            </h1>
            <span className="text-[10px] text-aura-subtle tracking-wider uppercase">
              Finance Tracker
            </span>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-aura-tealDim text-aura-teal shadow-sm"
                  : "text-aura-subtle hover:text-aura-text hover:bg-aura-card"
              )}
            >
              <item.icon active={isActive} />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-aura-teal live-dot" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Telegram status */}
      <div className="px-4 pb-5">
        <div className="p-3 rounded-xl bg-aura-card border border-aura-border">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 live-dot" />
            <span className="text-xs font-medium text-aura-text">Telegram Bot</span>
          </div>
          <p className="text-[11px] text-aura-subtle leading-relaxed">
            Send receipts via Telegram to log expenses automatically.
          </p>
        </div>
      </div>
    </aside>
  );
}

/* ── Icon components ─────────────────────────────────────────────── */

function DashIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={active ? "#00d4aa" : "currentColor"} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </svg>
  );
}

function ListIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={active ? "#00d4aa" : "currentColor"} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill={active ? "#00d4aa" : "currentColor"} />
      <circle cx="4" cy="12" r="1" fill={active ? "#00d4aa" : "currentColor"} />
      <circle cx="4" cy="18" r="1" fill={active ? "#00d4aa" : "currentColor"} />
    </svg>
  );
}

function GridIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={active ? "#00d4aa" : "currentColor"} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function GearIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={active ? "#00d4aa" : "currentColor"} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
