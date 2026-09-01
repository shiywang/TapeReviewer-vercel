import { useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import AppShell from "./components/AppShell";
import AuthGate from "./components/AuthGate";
import TradeFormModal from "./components/TradeFormModal";
import { BrandProvider } from "./lib/brand";
import DashboardPage from "./pages/DashboardPage";
import DayPage from "./pages/DayPage";
import ImportPage from "./pages/ImportPage";
import SettingsPage from "./pages/SettingsPage";
import TagsPage from "./pages/TagsPage";
import TradeRedirectPage from "./pages/TradeRedirectPage";

export default function App() {
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  return (
    <BrandProvider>
      <AuthGate>
        <Routes>
          <Route element={<AppShell onAddTrade={() => setAddOpen(true)} />}>
            <Route path="/" element={<DashboardPage refreshKey={refreshKey} />} />
            <Route path="/day/:date" element={<DayPage refreshKey={refreshKey} />} />
            <Route path="/trades/:id" element={<TradeRedirectPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <TradeFormModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setRefreshKey((k) => k + 1);
            navigate("/");
          }}
        />
      </AuthGate>
    </BrandProvider>
  );
}
