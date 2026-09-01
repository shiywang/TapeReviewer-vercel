export type Verdict = "followed_plan" | "broke_rules" | "no_edge";

export interface Tag {
  id: number;
  name: string;
  kind: string;
  color?: string;
}

export interface TagStatRow {
  tag: Tag;
  trade_count: number;
  net_pnl: number;
  win_count: number;
  loss_count: number;
  trade_win_pct: number;
  avg_pnl: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
}

export interface KindStatRow {
  kind: string;
  tag_count: number;
  trade_count: number;
  net_pnl: number;
  win_count: number;
  loss_count: number;
  trade_win_pct: number;
  avg_pnl: number;
  profit_factor: number;
}

export interface TagStatsResponse {
  date_from: string | null;
  date_to: string | null;
  trade_count: number;
  net_pnl: number;
  tags: TagStatRow[];
  kinds: KindStatRow[];
  kind_options: string[];
  untagged: {
    trade_count: number;
    net_pnl: number;
    trade_win_pct: number;
  };
}

export interface Trade {
  id: number;
  account_id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  opened_at: string;
  closed_at: string;
  qty: number;
  avg_entry: number;
  avg_exit: number;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  net_roi: number;
  notes: string;
  profit_target?: number | null;
  stop_loss?: number | null;
  reviewed: boolean;
  video_path?: string | null;
  video_marker_sec?: number | null;
  tags?: Tag[];
  executions?: Execution[];
}

export interface Execution {
  id: number;
  trade_id: number;
  executed_at: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fee: number;
}

export interface Kpis {
  net_pnl: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
  trade_win_pct: number;
  profit_factor: number;
  day_win_pct: number;
  avg_win: number;
  avg_loss: number;
}

export interface CalendarCell {
  date: string;
  day: number;
  net_pnl: number;
  trade_count: number;
  win_pct: number;
  intensity: number;
}

export interface CalendarResponse {
  year: number;
  month: number;
  cells: CalendarCell[];
  weeks: { week: number; net_pnl: number }[];
  month_net_pnl: number;
  start_weekday: number;
}

export interface DashboardResponse {
  kpis: Kpis;
  cumulative: { date: string; cumulative: number }[];
  recent_trades: Trade[];
  account: Account;
}

export interface Account {
  id: number;
  name: string;
  currency: string;
  timezone: string;
}

export interface DayMedia {
  id: number;
  day_journal_id: number;
  relative_path: string;
  media_type: string;
}

export interface DayJournal {
  id: number;
  account_id: number;
  trade_date: string;
  verdict: Verdict | null;
  notes: string;
}

export interface DayResponse {
  date: string;
  summary: Kpis;
  trades: Trade[];
  journal: DayJournal;
  media: DayMedia | null;
  account: Account;
}

export interface MediaItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

export interface DasTradePreview {
  index: number;
  symbol: string;
  side: "LONG" | "SHORT";
  opened_at: string;
  closed_at: string;
  qty: number;
  avg_entry: number;
  avg_exit: number;
  fees: number;
  gross_pnl: number;
  net_pnl: number;
  net_roi: number;
  fill_count: number;
  source_file: string;
  trade_date: string;
  valid: boolean;
  errors: string[];
}

export interface ImportBatch {
  id: number;
  account_id: number;
  source: "das" | "csv";
  fingerprint: string;
  trade_fingerprint?: string | null;
  label: string;
  trade_count: number;
  live_trade_count?: number;
  net_pnl: number;
  created_at: string;
}

export interface DasImportPreview {
  broker: string;
  detected: boolean;
  files: { filename: string; executions: number; headers: string[] }[];
  execution_count: number;
  trade_count: number;
  valid_count: number;
  trades: DasTradePreview[];
  net_pnl_total: number;
  fingerprint: string;
  trade_fingerprint: string;
  label: string;
  already_imported: boolean;
  existing_batch: ImportBatch | null;
}
