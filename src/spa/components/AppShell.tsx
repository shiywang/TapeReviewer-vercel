import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BrandMark, useBrand } from "../lib/brand";
import { todayISO } from "../lib/format";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: `/day/${todayISO()}`, label: "Day / Trade" },
  { to: "/tags", label: "Tags" },
  { to: "/import", label: "Import" },
  { to: "/settings", label: "Settings" },
];

export default function AppShell({ onAddTrade }: { onAddTrade: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { brand } = useBrand();

  const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="mt-8 flex flex-col gap-1">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive ? "bg-signal/20 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-ink px-5 py-6 text-white lg:flex">
        <BrandMark showTagline onClick={() => navigate("/")} />
        <button
          type="button"
          onClick={onAddTrade}
          className="mt-6 rounded-lg bg-signal px-3 py-2.5 text-sm font-semibold text-white shadow-panel transition hover:brightness-110"
        >
          + Add Trade
        </button>
        <NavItems />
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink px-4 py-3 text-white lg:hidden">
        <button type="button" onClick={() => setDrawerOpen(true)} className="text-sm font-medium">
          Menu
        </button>
        <BrandMark size="sm" />
        <button type="button" onClick={onAddTrade} className="rounded-md bg-signal px-2.5 py-1 text-xs font-semibold">
          + Trade
        </button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-ink/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-ink px-5 py-6 text-white shadow-xl">
            <BrandMark showTagline />
            <NavItems onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-line bg-surface lg:hidden">
        {[
          { to: "/", label: "Dashboard", end: true },
          { to: `/day/${todayISO()}`, label: "Day" },
          { to: "/import", label: "Import" },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-xs font-semibold ${isActive ? "text-signal" : "text-muted"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="min-w-0 flex-1 px-4 py-5 pb-20 lg:px-8 lg:pb-8">
        <Outlet context={{ brand }} />
      </main>
    </div>
  );
}
