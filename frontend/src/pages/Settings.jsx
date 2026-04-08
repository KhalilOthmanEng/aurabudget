import React, { useState, useEffect } from "react";
import clsx from "clsx";
import { fetchSettingsStatus } from "../lib/api";

const isDesktop = () => !!(window.auraDesktop && window.auraDesktop.isDesktop);

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showKeys, setShowKeys] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const s = await fetchSettingsStatus();
      setStatus(s);
    } catch {}

    if (isDesktop()) {
      try {
        const [sets, info] = await Promise.all([
          window.auraDesktop.getSettings(),
          window.auraDesktop.getAppInfo(),
        ]);
        setSettings(sets);
        setAppInfo(info);
      } catch (e) {
        console.error("Failed to load desktop settings:", e);
      }
    }
  };

  const handleSave = async () => {
    if (!isDesktop() || !settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await window.auraDesktop.saveSettings(settings);
      if (result.success) {
        setMessage({ type: "success", text: "Settings saved and applied!" });
        // Re-fetch status after a brief delay to let backend reconfigure
        setTimeout(async () => {
          try {
            const s = await fetchSettingsStatus();
            setStatus(s);
          } catch {}
        }, 500);
      } else {
        setMessage({ type: "error", text: result.error || "Failed to save." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!isDesktop()) return;
    const result = await window.auraDesktop.exportDatabase();
    if (result.success) {
      setMessage({ type: "success", text: `Database exported to ${result.path}` });
    } else if (result.error !== "Cancelled") {
      setMessage({ type: "error", text: result.error });
    }
  };

  const handleImport = async () => {
    if (!isDesktop()) return;
    const result = await window.auraDesktop.importDatabase();
    if (result.success) {
      setMessage({ type: "success", text: "Database imported successfully! Reloading..." });
      setTimeout(() => window.location.reload(), 1500);
    } else if (result.error !== "Cancelled") {
      setMessage({ type: "error", text: result.error });
    }
  };

  const updateField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleShowKey = (key) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6 pb-12 max-w-[900px] mx-auto animate-fade-in">
      <div className="mb-7">
        <h1 className="font-display font-bold text-2xl text-aura-text tracking-tight">Settings</h1>
        <p className="text-sm text-aura-subtle mt-0.5">
          Configure your AuraBudget integrations and preferences.
        </p>
      </div>

      {/* Status message */}
      {message && (
        <div className={clsx(
          "mb-5 p-4 rounded-xl border text-sm",
          message.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
        )}>
          {message.text}
        </div>
      )}

      {/* Integration Status Overview */}
      <Section title="Integration Status" icon="🔌">
        <div className="grid grid-cols-3 gap-3">
          <StatusBadge label="Gemini AI" configured={status?.gemini_configured} desc="Receipt scanning" />
          <StatusBadge label="Telegram Bot" configured={status?.telegram_configured} desc="Receipt ingestion" />
          <StatusBadge label="GoCardless" configured={status?.gocardless_configured} desc="Bank connections" />
        </div>
      </Section>

      {/* Desktop Settings UI */}
      {isDesktop() && settings ? (
        <>
          {/* Gemini AI */}
          <Section title="Gemini AI — Receipt Scanner" icon="🤖">
            <p className="text-xs text-aura-subtle mb-3">
              Powers the AI receipt scanning. Get a free API key from{" "}
              <button onClick={() => window.auraDesktop.openExternal("https://aistudio.google.com/apikey")} className="text-aura-teal hover:underline">
                Google AI Studio
              </button>.
            </p>
            <SecretInput
              label="Gemini API Key"
              value={settings.gemini_api_key}
              show={showKeys.gemini}
              onToggle={() => toggleShowKey("gemini")}
              onChange={(v) => updateField("gemini_api_key", v)}
              placeholder="AIzaSy..."
            />
          </Section>

          {/* Telegram Bot */}
          <Section title="Telegram Bot" icon="📱">
            <p className="text-xs text-aura-subtle mb-3">
              Send receipt photos via Telegram for automatic logging.
              Create a bot via{" "}
              <button onClick={() => window.auraDesktop.openExternal("https://t.me/BotFather")} className="text-aura-teal hover:underline">
                @BotFather
              </button>{" "}
              and get your user ID from{" "}
              <button onClick={() => window.auraDesktop.openExternal("https://t.me/userinfobot")} className="text-aura-teal hover:underline">
                @userinfobot
              </button>.
            </p>
            <div className="space-y-3">
              <SecretInput
                label="Bot Token"
                value={settings.telegram_bot_token}
                show={showKeys.telegram}
                onToggle={() => toggleShowKey("telegram")}
                onChange={(v) => updateField("telegram_bot_token", v)}
                placeholder="123456:ABC-DEF..."
              />
              <InputField
                label="Your Telegram User ID"
                value={settings.telegram_allowed_user_id}
                onChange={(v) => updateField("telegram_allowed_user_id", v)}
                placeholder="7145917690"
                type="text"
              />
            </div>
          </Section>

          {/* GoCardless */}
          <Section title="Bank Connections (GoCardless)" icon="🏦">
            <p className="text-xs text-aura-subtle mb-3">
              Connect your bank accounts via Open Banking (PSD2). Requires a GoCardless Bank Account Data account.
            </p>
            <div className="space-y-3">
              <SecretInput
                label="Secret ID"
                value={settings.gocardless_secret_id}
                show={showKeys.gc_id}
                onToggle={() => toggleShowKey("gc_id")}
                onChange={(v) => updateField("gocardless_secret_id", v)}
                placeholder="Enter Secret ID"
              />
              <SecretInput
                label="Secret Key"
                value={settings.gocardless_secret_key}
                show={showKeys.gc_key}
                onToggle={() => toggleShowKey("gc_key")}
                onChange={(v) => updateField("gocardless_secret_key", v)}
                placeholder="Enter Secret Key"
              />
            </div>
          </Section>

          {/* Preferences */}
          <Section title="Preferences" icon="⚙️">
            <div className="space-y-3">
              <InputField
                label="Monthly Budget (€)"
                value={settings.monthly_budget}
                onChange={(v) => updateField("monthly_budget", Number(v) || 0)}
                type="number"
                placeholder="2000"
              />
              <InputField
                label="Currency"
                value={settings.currency}
                onChange={(v) => updateField("currency", v)}
                placeholder="EUR"
              />
              <ToggleField
                label="Minimize to system tray on close"
                checked={settings.minimize_to_tray}
                onChange={(v) => updateField("minimize_to_tray", v)}
              />
            </div>
          </Section>

          {/* Save Button */}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-aura-teal text-aura-bg font-display font-semibold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <span className="text-xs text-aura-subtle">
              Changes apply instantly
            </span>
          </div>

          {/* Data Management */}
          <Section title="Data Management" icon="💾">
            <div className="flex flex-wrap gap-3">
              <ActionButton label="Export Database" desc="Save a backup of all your data" onClick={handleExport} />
              <ActionButton label="Import Database" desc="Restore from a backup file" onClick={handleImport} danger />
              <ActionButton label="Open Data Folder" desc="View app data on disk" onClick={() => window.auraDesktop.openDataFolder()} />
              <ActionButton label="Restart Backend" desc="Force restart the server" onClick={async () => {
                const r = await window.auraDesktop.restartBackend();
                setMessage(r.success ? { type: "success", text: "Backend restarted!" } : { type: "error", text: r.error });
              }} />
            </div>
          </Section>

          {/* App Info */}
          {appInfo && (
            <Section title="About" icon="ℹ️">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoRow label="Version" value={appInfo.version} />
                <InfoRow label="Platform" value={appInfo.platform} />
                <InfoRow label="Database" value={appInfo.dbPath} mono />
                <InfoRow label="Logs" value={appInfo.logsPath} mono />
              </div>
            </Section>
          )}
        </>
      ) : !isDesktop() ? (
        /* Web mode — show .env instructions */
        <Section title="Configuration" icon="📝">
          <div className="p-4 rounded-xl bg-aura-surface border border-aura-border">
            <p className="text-sm text-aura-text mb-3">
              Running in web mode. Configure settings via the <code className="text-aura-teal">.env</code> file:
            </p>
            <pre className="text-xs text-aura-subtle font-mono leading-relaxed bg-aura-bg rounded-lg p-3 overflow-x-auto">
{`GEMINI_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_ALLOWED_USER_ID=your_id
GOCARDLESS_SECRET_ID=your_id
GOCARDLESS_SECRET_KEY=your_key`}
            </pre>
            <p className="text-xs text-aura-muted mt-3">
              Download the desktop app for a GUI settings experience.
            </p>
          </div>
        </Section>
      ) : (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-aura-subtle">Loading settings...</p>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   SUBCOMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

function Section({ title, icon, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <h2 className="font-display font-semibold text-sm text-aura-text">{title}</h2>
      </div>
      <div className="bg-aura-card border border-aura-border rounded-2xl p-5">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ label, configured, desc }) {
  return (
    <div className={clsx(
      "p-3 rounded-xl border transition-colors",
      configured ? "bg-emerald-500/8 border-emerald-500/15" : "bg-aura-surface border-aura-border"
    )}>
      <div className="flex items-center gap-2 mb-1">
        <div className={clsx("w-2 h-2 rounded-full", configured ? "bg-emerald-400 live-dot" : "bg-aura-muted")} />
        <span className="text-xs font-medium text-aura-text">{label}</span>
      </div>
      <p className="text-[10px] text-aura-subtle">{desc}</p>
      <span className={clsx(
        "inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-md",
        configured ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/10 text-amber-400"
      )}>
        {configured ? "Active" : "Not configured"}
      </span>
    </div>
  );
}

function SecretInput({ label, value, show, onToggle, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-aura-subtle mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal font-mono"
        />
        <button
          onClick={onToggle}
          className="px-3 py-2 rounded-lg bg-aura-surface border border-aura-border text-xs text-aura-subtle hover:text-aura-text transition-colors"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-aura-subtle mb-1.5">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-muted focus:outline-none focus:border-aura-teal"
      />
    </div>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs text-aura-subtle group-hover:text-aura-text transition-colors">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative w-10 h-5 rounded-full transition-colors",
          checked ? "bg-aura-teal" : "bg-aura-muted"
        )}
      >
        <div className={clsx(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )} />
      </button>
    </label>
  );
}

function ActionButton({ label, desc, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex-1 min-w-[180px] p-3 rounded-xl border text-left transition-colors",
        danger
          ? "bg-red-500/5 border-red-500/15 hover:bg-red-500/10"
          : "bg-aura-surface border-aura-border hover:bg-aura-card"
      )}
    >
      <div className={clsx("text-xs font-medium", danger ? "text-red-400" : "text-aura-text")}>{label}</div>
      <div className="text-[10px] text-aura-subtle mt-0.5">{desc}</div>
    </button>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="col-span-2 flex items-center justify-between py-1.5 border-b border-aura-border/50">
      <span className="text-aura-subtle">{label}</span>
      <span className={clsx("text-aura-text truncate max-w-[400px]", mono && "font-mono text-[10px]")}>{value}</span>
    </div>
  );
}
