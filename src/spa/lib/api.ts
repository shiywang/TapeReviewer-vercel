const PASSWORD_KEY = "tr_app_password";

export function getStoredPassword(): string {
  return localStorage.getItem(PASSWORD_KEY) || "";
}

export function setStoredPassword(value: string) {
  if (value) localStorage.setItem(PASSWORD_KEY, value);
  else localStorage.removeItem(PASSWORD_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const password = getStoredPassword();
  if (password) headers.set("X-App-Password", password);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (data.detail) detail = JSON.stringify(data.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  settings: () =>
    request<{
      account: unknown;
      brand?: {
        app_title: string;
        app_tagline: string;
        has_logo: boolean;
        logo_url: string | null;
      };
      auth_enabled: boolean;
      media_dir: string;
      media?: {
        media_dir: string;
        exists: boolean;
        readable: boolean;
        entry_count: number;
        sample_entries: string[];
        hint?: string | null;
        error?: string | null;
      };
    }>("/api/settings"),
  updateSettings: (body: Record<string, string>) =>
    request<{ account: unknown; brand?: import("./brand").Brand }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ brand: import("./brand").Brand }>("/api/settings/logo", { method: "POST", body: fd });
  },
  deleteLogo: () => request<{ brand: import("./brand").Brand }>("/api/settings/logo", { method: "DELETE" }),
  dashboard: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("date_from", from);
    if (to) q.set("date_to", to);
    const qs = q.toString();
    return request<import("../types").DashboardResponse>(`/api/dashboard${qs ? `?${qs}` : ""}`);
  },
  calendar: (year: number, month: number) =>
    request<import("../types").CalendarResponse>(`/api/calendar?year=${year}&month=${month}`),
  day: (date: string) => request<import("../types").DayResponse>(`/api/days/${date}`),
  patchDayJournal: (date: string, body: { verdict?: string | null; notes?: string }) =>
    request<import("../types").DayResponse>(`/api/days/${date}/journal`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  patchDayMedia: (date: string, relative_path: string | null) =>
    request<import("../types").DayResponse>(`/api/days/${date}/media`, {
      method: "PATCH",
      body: JSON.stringify({ relative_path }),
    }),
  trade: (id: number) => request<import("../types").Trade>(`/api/trades/${id}`),
  createTrade: (body: Record<string, unknown>) =>
    request<import("../types").Trade>("/api/trades", { method: "POST", body: JSON.stringify(body) }),
  updateTrade: (id: number, body: Record<string, unknown>) =>
    request<import("../types").Trade>(`/api/trades/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTrade: (id: number) => request(`/api/trades/${id}`, { method: "DELETE" }),
  setTradeVideo: (id: number, video_path: string | null) =>
    request<import("../types").Trade>(`/api/trades/${id}/video`, {
      method: "PATCH",
      body: JSON.stringify({ video_path }),
    }),
  setMarker: (id: number, video_marker_sec: number | null) =>
    request(`/api/trades/${id}/marker`, {
      method: "PATCH",
      body: JSON.stringify({ video_marker_sec }),
    }),
  tags: () => request<{ tags: import("../types").Tag[] }>("/api/tags"),
  tagStats: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("date_from", from);
    if (to) q.set("date_to", to);
    const qs = q.toString();
    return request<import("../types").TagStatsResponse>(`/api/tags/stats${qs ? `?${qs}` : ""}`);
  },
  createTag: (name: string, kind = "general", color = "#0F8A7A") =>
    request<import("../types").Tag>("/api/tags", {
      method: "POST",
      body: JSON.stringify({ name, kind, color }),
    }),
  updateTag: (id: number, body: { name?: string; kind?: string; color?: string }) =>
    request<import("../types").Tag>(`/api/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTag: (id: number) => request(`/api/tags/${id}`, { method: "DELETE" }),
  importCsv: (file: File, mapping?: Record<string, string>) => {
    const fd = new FormData();
    fd.append("file", file);
    const q = new URLSearchParams(mapping || {});
    return request<Record<string, unknown>>(`/api/import/csv?${q}`, { method: "POST", body: fd });
  },
  commitCsv: (body: unknown) =>
    request("/api/import/csv/commit", { method: "POST", body: JSON.stringify(body) }),
  importDas: (files: File[], defaultYear = 2026) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return request<import("../types").DasImportPreview>(
      `/api/import/das?default_year=${defaultYear}`,
      { method: "POST", body: fd },
    );
  },
  commitDas: (body: {
    trades: unknown[];
    account_id?: number;
    fingerprint?: string;
    trade_fingerprint?: string;
    label?: string;
    source?: "das" | "ibkr";
  }) =>
    request<{
      created: number;
      skipped?: number;
      net_pnl_total: number;
      import_batch_id: number | null;
      message?: string;
    }>(
      "/api/import/das/commit",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  ibkrRequest: (scope: "today" | "history" = "today") =>
    request<{ reference_code: string; url: string }>("/api/import/ibkr/request", {
      method: "POST",
      body: JSON.stringify({ scope }),
    }),
  ibkrFetch: (ref: string, url?: string) => {
    const q = new URLSearchParams({ ref });
    if (url) q.set("url", url);
    return request<
      | { status: "pending"; retry_after_ms: number; code: string | null }
      | ({ status: "ready" } & import("../types").DasImportPreview)
    >(`/api/import/ibkr/fetch?${q}`);
  },
  listImports: () =>
    request<{
      imports: import("../types").ImportBatch[];
      counts: { batched: number; orphan_imported: number; total_imported: number };
    }>("/api/imports"),
  deleteImport: (batchId: number) =>
    request<{ deleted_batch_id: number; deleted_trades: number }>(`/api/imports/${batchId}`, {
      method: "DELETE",
    }),
  clearImports: () =>
    request<{ deleted_batches: number; deleted_trades: number }>("/api/imports", {
      method: "DELETE",
    }),
  mediaList: (prefix = "") =>
    request<{
      items: import("../types").MediaItem[];
      status?: {
        media_dir: string;
        exists: boolean;
        readable: boolean;
        entry_count: number;
        sample_entries: string[];
        hint?: string | null;
        error?: string | null;
      };
    }>(`/api/media/list?prefix=${encodeURIComponent(prefix)}`),
};

// Videos are now stored as full external URLs (YouTube, Drive, direct .mp4, etc.),
// so the stored value is already the playable src.
export function mediaUrl(url: string) {
  return url;
}
