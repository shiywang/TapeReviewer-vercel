import { FormEvent, useEffect, useState } from "react";
import { api, getStoredPassword, setStoredPassword } from "../lib/api";
import { useBrand, type Brand } from "../lib/brand";

export default function SettingsPage() {
  const { brand, setBrand, refreshBrand } = useBrand();
  const [name, setName] = useState("Main");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [currency, setCurrency] = useState("USD");
  const [appTitle, setAppTitle] = useState(brand.app_title);
  const [appTagline, setAppTagline] = useState(brand.app_tagline);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [password, setPassword] = useState(getStoredPassword());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(brand.logo_url);

  useEffect(() => {
    api
      .settings()
      .then((res) => {
        const account = res.account as { name: string; timezone: string; currency: string };
        setName(account.name);
        setTimezone(account.timezone);
        setCurrency(account.currency);
        setAuthEnabled(res.auth_enabled);
        if (res.brand) {
          setAppTitle(res.brand.app_title);
          setAppTagline(res.brand.app_tagline);
          setPreviewUrl(res.brand.logo_url ? `${res.brand.logo_url}?t=${Date.now()}` : null);
          setBrand(res.brand as Brand);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"));
  }, [setBrand]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      const res = await api.updateSettings({
        account_name: name,
        timezone,
        currency,
        app_title: appTitle,
        app_tagline: appTagline,
      });
      setStoredPassword(password);
      if (res.brand) setBrand(res.brand as Brand);
      await refreshBrand();
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onLogo = async (file: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await api.uploadLogo(file);
      setBrand(res.brand);
      setPreviewUrl(`${res.brand.logo_url}?t=${Date.now()}`);
      setMessage("Logo updated.");
      await refreshBrand();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!confirm("Remove custom logo and use the text title?")) return;
    setLogoBusy(true);
    try {
      const res = await api.deleteLogo();
      setBrand(res.brand);
      setPreviewUrl(null);
      setMessage("Logo removed.");
      await refreshBrand();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Branding and account defaults.</p>
      </div>

      <form onSubmit={save} className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-panel">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Brand</div>
          <div className="mt-3 flex items-center gap-4 rounded-lg bg-ink p-4 text-white">
            {previewUrl ? (
              <img src={previewUrl} alt="Logo preview" className="h-12 w-auto max-w-[160px] object-contain" />
            ) : (
              <span className="font-display text-2xl font-bold">{appTitle || "TapeReviewer"}</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-white">
              {logoBusy ? "Uploading…" : "Upload logo"}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.svg,image/*"
                className="hidden"
                disabled={logoBusy}
                onChange={(e) => onLogo(e.target.files?.[0] || null)}
              />
            </label>
            {previewUrl && (
              <button
                type="button"
                disabled={logoBusy}
                onClick={removeLogo}
                className="rounded-lg border border-loss/40 px-3 py-2 text-sm font-semibold text-loss"
              >
                Remove logo
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">PNG, JPG, WebP, GIF, or SVG · max 2MB. Shown in the sidebar and header.</p>
        </div>

        <label className="block text-sm">
          App title
          <input
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            value={appTitle}
            onChange={(e) => setAppTitle(e.target.value)}
            placeholder="TapeReviewer"
          />
        </label>
        <label className="block text-sm">
          Tagline
          <input
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            value={appTagline}
            onChange={(e) => setAppTagline(e.target.value)}
            placeholder="Review the tape. Keep the edge."
          />
        </label>

        <hr className="border-line" />

        <label className="block text-sm">
          Account name
          <input
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Timezone
          <input
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Currency
          <input
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </label>
        <div className="rounded-lg bg-paper px-3 py-2 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Trade videos</div>
          <p className="mt-1 text-xs text-muted">
            Videos are linked per trade by URL (YouTube, Google Drive, or a direct{" "}
            <code className="font-mono">.mp4</code>). Open a day, pick a trade, then{" "}
            <span className="font-semibold text-ink">Link video URL</span>.
          </p>
        </div>
        <label className="block text-sm">
          App password (browser)
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={authEnabled ? "Required — matches APP_PASSWORD" : "Optional unless APP_PASSWORD is set"}
          />
        </label>
        <button type="submit" className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white">
          Save settings
        </button>
        {message && <p className="text-sm text-signal">{message}</p>}
        {error && <p className="text-sm text-loss">{error}</p>}
      </form>
    </div>
  );
}
