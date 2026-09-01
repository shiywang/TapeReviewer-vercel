import { FormEvent, useEffect, useState } from "react";
import { api, getStoredPassword, setStoredPassword } from "../lib/api";
import { BrandMark, useBrand } from "../lib/brand";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { brand, setBrand } = useBrand();
  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState(getStoredPassword());
  const [error, setError] = useState("");

  const probe = async (): Promise<boolean> => {
    setChecking(true);
    setError("");
    try {
      const settings = await api.settings();
      if (settings.brand) setBrand(settings.brand);
      setLocked(false);
      return true;
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        setLocked(true);
        return false;
      }
      setLocked(false);
      return true;
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStoredPassword(password);
    const ok = await probe();
    if (!ok) setError("Incorrect password");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-muted">
        Connecting to {brand.app_title}…
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-panel">
          <div className="rounded-lg bg-ink p-4 text-white">
            <BrandMark size="lg" />
          </div>
          <p className="mt-3 text-sm text-muted">Enter the LAN app password to continue.</p>
          <input
            type="password"
            autoFocus
            className="mt-4 w-full rounded-lg border border-line px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="mt-2 text-sm text-loss">{error}</p>}
          <button type="submit" className="mt-4 w-full rounded-lg bg-signal py-2 text-sm font-semibold text-white">
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
