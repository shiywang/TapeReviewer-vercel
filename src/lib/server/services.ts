// Port of app/services.py — trades, days, dashboard, calendar, tags. Uses supabase-js.
// Tables are small (single user), so we fetch and compute in memory, exactly like
// the original Python did.
import { supabase } from "./supabase";
import { ApiError } from "./http";
import {
  calendarMonth,
  computePnl,
  cumulativeSeries,
  round2,
  round4,
  summarizeTrades,
  tradeDate,
} from "./analytics";

const nowIso = () => new Date().toISOString();

export interface Tag {
  id: number;
  name: string;
  kind: string;
  color: string;
}

export async function getAccount(accountId = 1) {
  const { data, error } = await supabase()
    .from("account")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new ApiError(error.message, 500);
  if (!data) throw new ApiError("Account not found", 500);
  return data;
}

export async function listTrades(
  accountId = 1,
  dateFrom?: string | null,
  dateTo?: string | null,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase().from("trade").select("*").eq("account_id", accountId);
  if (error) throw new ApiError(error.message, 500);
  let trades = (data || []) as Record<string, unknown>[];
  if (dateFrom) trades = trades.filter((t) => tradeDate(String(t.closed_at)) >= dateFrom);
  if (dateTo) trades = trades.filter((t) => tradeDate(String(t.closed_at)) <= dateTo);
  trades.sort((a, b) => (String(a.closed_at) > String(b.closed_at) ? -1 : String(a.closed_at) < String(b.closed_at) ? 1 : 0));
  return trades;
}

/** tags for many trades, grouped by trade_id (avoids N+1). */
async function tagsForTrades(tradeIds: number[]): Promise<Map<number, Tag[]>> {
  const out = new Map<number, Tag[]>();
  if (!tradeIds.length) return out;
  const { data, error } = await supabase()
    .from("trade_tag")
    .select("trade_id, tag:tag(*)")
    .in("trade_id", tradeIds);
  if (error) throw new ApiError(error.message, 500);
  for (const row of data || []) {
    const r = row as unknown as { trade_id: number; tag: Tag | null };
    if (!r.tag) continue;
    const arr = out.get(r.trade_id) || [];
    arr.push(r.tag);
    out.set(r.trade_id, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => (a.name < b.name ? -1 : 1));
  return out;
}

export async function getTradeTags(tradeId: number): Promise<Tag[]> {
  return (await tagsForTrades([tradeId])).get(tradeId) || [];
}

export async function getTrade(tradeId: number): Promise<Record<string, unknown> | null> {
  const sb = supabase();
  const { data: trade } = await sb.from("trade").select("*").eq("id", tradeId).maybeSingle();
  if (!trade) return null;
  const { data: executions } = await sb
    .from("execution")
    .select("*")
    .eq("trade_id", tradeId)
    .order("executed_at", { ascending: true });
  return {
    ...trade,
    reviewed: !!trade.reviewed,
    tags: await getTradeTags(tradeId),
    executions: executions || [],
  };
}

async function setTradeTags(tradeId: number, tagIds: number[]) {
  const sb = supabase();
  await sb.from("trade_tag").delete().eq("trade_id", tradeId);
  if (tagIds.length) {
    const rows = [...new Set(tagIds)].map((tag_id) => ({ trade_id: tradeId, tag_id }));
    await sb.from("trade_tag").upsert(rows, { ignoreDuplicates: true });
  }
}

export interface TradeCreate {
  symbol: string;
  side?: "LONG" | "SHORT";
  opened_at: string;
  closed_at: string;
  qty: number;
  avg_entry: number;
  avg_exit: number;
  fees?: number;
  notes?: string;
  profit_target?: number | null;
  stop_loss?: number | null;
  account_id?: number;
  import_batch_id?: number | null;
  tag_ids?: number[];
}

export async function createTrade(payload: TradeCreate): Promise<Record<string, unknown>> {
  const side = payload.side ?? "LONG";
  const fees = payload.fees ?? 0;
  const [gross, net, roi] = computePnl(side, payload.qty, payload.avg_entry, payload.avg_exit, fees);
  const sb = supabase();
  const { data: trade, error } = await sb
    .from("trade")
    .insert({
      account_id: payload.account_id ?? 1,
      import_batch_id: payload.import_batch_id ?? null,
      symbol: payload.symbol.toUpperCase(),
      side,
      opened_at: payload.opened_at,
      closed_at: payload.closed_at,
      qty: payload.qty,
      avg_entry: payload.avg_entry,
      avg_exit: payload.avg_exit,
      gross_pnl: round2(gross),
      fees,
      net_pnl: round2(net),
      net_roi: round4(roi),
      notes: payload.notes ?? "",
      profit_target: payload.profit_target ?? null,
      stop_loss: payload.stop_loss ?? null,
    })
    .select("id")
    .single();
  if (error) throw new ApiError(error.message, 500);
  const tradeId = (trade as { id: number }).id;

  const buySide = side === "LONG" ? "BUY" : "SELL";
  const sellSide = side === "LONG" ? "SELL" : "BUY";
  await sb.from("execution").insert([
    { trade_id: tradeId, executed_at: payload.opened_at, side: buySide, qty: payload.qty, price: payload.avg_entry, fee: fees / 2 },
    { trade_id: tradeId, executed_at: payload.closed_at, side: sellSide, qty: payload.qty, price: payload.avg_exit, fee: fees / 2 },
  ]);
  if (payload.tag_ids && payload.tag_ids.length) await setTradeTags(tradeId, payload.tag_ids);
  return (await getTrade(tradeId))!;
}

/** Video is now an external URL (was a NAS relative path). */
export function normalizeVideoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.trim();
  if (!clean) return null;
  if (!/^https?:\/\/.+/i.test(clean)) {
    throw new ApiError("Video must be a full http(s) URL", 400);
  }
  return clean;
}

const TRADE_UPDATE_COLUMNS = new Set([
  "symbol",
  "side",
  "opened_at",
  "closed_at",
  "qty",
  "avg_entry",
  "avg_exit",
  "fees",
  "notes",
  "profit_target",
  "stop_loss",
  "reviewed",
  "video_path",
  "video_marker_sec",
]);

export async function updateTrade(
  tradeId: number,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const existing = await getTrade(tradeId);
  if (!existing) return null;

  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) continue;
    if (key === "tag_ids") continue;
    if (TRADE_UPDATE_COLUMNS.has(key)) fields[key] = payload[key];
  }
  const tagIds = "tag_ids" in payload ? (payload.tag_ids as number[] | null) : undefined;

  if ("reviewed" in fields) fields.reviewed = !!fields.reviewed;
  if ("video_path" in fields) fields.video_path = normalizeVideoUrl(fields.video_path as string | null);

  const pick = <T>(key: string, fallback: T): T => (key in fields ? (fields[key] as T) : fallback);
  const symbol = String(pick("symbol", existing.symbol)).toUpperCase();
  const side = pick("side", existing.side) as string;
  const qty = Number(pick("qty", existing.qty));
  const avgEntry = Number(pick("avg_entry", existing.avg_entry));
  const avgExit = Number(pick("avg_exit", existing.avg_exit));
  const fees = Number(pick("fees", existing.fees));
  const [gross, net, roi] = computePnl(side, qty, avgEntry, avgExit, fees);

  fields.symbol = symbol;
  fields.gross_pnl = round2(gross);
  fields.net_pnl = round2(net);
  fields.net_roi = round4(roi);
  fields.updated_at = nowIso();

  const { error } = await supabase().from("trade").update(fields).eq("id", tradeId);
  if (error) throw new ApiError(error.message, 500);

  if (tagIds !== undefined && tagIds !== null) await setTradeTags(tradeId, tagIds);
  return getTrade(tradeId);
}

export async function deleteTrade(tradeId: number): Promise<boolean> {
  const { data } = await supabase().from("trade").delete().eq("id", tradeId).select("id");
  return (data || []).length > 0;
}

async function enrich(trades: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const tagMap = await tagsForTrades(trades.map((t) => Number(t.id)));
  return trades.map((t) => ({ ...t, reviewed: !!t.reviewed, tags: tagMap.get(Number(t.id)) || [] }));
}

export async function dashboard(dateFrom: string | null, dateTo: string | null, accountId = 1) {
  const trades = await listTrades(accountId, dateFrom, dateTo);
  const summary = summarizeTrades(trades as never);
  const recent = await enrich(trades.slice(0, 15));
  return {
    kpis: summary,
    cumulative: cumulativeSeries(trades as never),
    recent_trades: recent,
    account: await getAccount(accountId),
  };
}

export async function getCalendar(year: number, month: number, accountId = 1) {
  const trades = await listTrades(accountId);
  return calendarMonth(trades as never, year, month);
}

export async function ensureDayJournal(tradeDateStr: string, accountId = 1) {
  const sb = supabase();
  const { data: existing } = await sb
    .from("day_journal")
    .select("*")
    .eq("account_id", accountId)
    .eq("trade_date", tradeDateStr)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await sb
    .from("day_journal")
    .insert({ account_id: accountId, trade_date: tradeDateStr, notes: "" })
    .select("*")
    .single();
  if (error) throw new ApiError(error.message, 500);
  return data;
}

export async function getDay(day: string, accountId = 1) {
  const all = await listTrades(accountId);
  const dayTrades = all.filter((t) => tradeDate(String(t.closed_at)) === day);
  dayTrades.sort((a, b) => (String(a.opened_at) < String(b.opened_at) ? -1 : String(a.opened_at) > String(b.opened_at) ? 1 : 0));
  const enriched = await enrich(dayTrades);

  const journal = await ensureDayJournal(day, accountId);
  const { data: media } = await supabase()
    .from("day_media")
    .select("*")
    .eq("day_journal_id", (journal as { id: number }).id)
    .maybeSingle();

  return {
    date: day,
    summary: summarizeTrades(enriched as never),
    trades: enriched,
    journal,
    media: media || null,
    account: await getAccount(accountId),
  };
}

export async function updateDayJournal(
  day: string,
  payload: { verdict?: string | null; notes?: string },
  accountId = 1,
) {
  const journal = await ensureDayJournal(day, accountId);
  const fields: Record<string, unknown> = {};
  if ("verdict" in payload) fields.verdict = payload.verdict ?? null;
  if ("notes" in payload && payload.notes !== undefined) fields.notes = payload.notes;
  if (Object.keys(fields).length) {
    await supabase()
      .from("day_journal")
      .update(fields)
      .eq("id", (journal as { id: number }).id);
  }
  return getDay(day, accountId);
}

export async function setDayMedia(day: string, url: string | null, accountId = 1) {
  const journal = await ensureDayJournal(day, accountId);
  const jid = (journal as { id: number }).id;
  const sb = supabase();
  await sb.from("day_media").delete().eq("day_journal_id", jid);
  const clean = normalizeVideoUrl(url);
  if (clean) {
    await sb
      .from("day_media")
      .insert({ day_journal_id: jid, relative_path: clean, media_type: "video" });
  }
  return getDay(day, accountId);
}

export async function setTradeVideo(tradeId: number, url: string | null) {
  return updateTrade(tradeId, { video_path: url });
}

// ---- Tags ----

export async function listTags(): Promise<Tag[]> {
  const { data, error } = await supabase().from("tag").select("*").order("name", { ascending: true });
  if (error) throw new ApiError(error.message, 500);
  return (data || []) as Tag[];
}

export async function createTag(name: string, kind = "general", color = "#0F8A7A"): Promise<Tag> {
  const { data, error } = await supabase()
    .from("tag")
    .insert({ name: name.trim(), kind: kind || "general", color: color || "#0F8A7A" })
    .select("*")
    .single();
  if (error) throw error;
  return data as Tag;
}

export async function updateTag(
  tagId: number,
  changes: { name?: string | null; kind?: string | null; color?: string | null },
): Promise<Tag | null> {
  const sb = supabase();
  const { data: existing } = await sb.from("tag").select("*").eq("id", tagId).maybeSingle();
  if (!existing) return null;
  const next = {
    name: changes.name != null ? changes.name.trim() : (existing as Tag).name,
    kind: changes.kind != null ? changes.kind : (existing as Tag).kind,
    color: changes.color != null ? changes.color : (existing as Tag).color || "#0F8A7A",
  };
  const { data, error } = await sb.from("tag").update(next).eq("id", tagId).select("*").single();
  if (error) throw error;
  return data as Tag;
}

export async function deleteTag(tagId: number): Promise<boolean> {
  const { data } = await supabase().from("tag").delete().eq("id", tagId).select("id");
  return (data || []).length > 0;
}

export async function tagStatistics(
  dateFrom: string | null,
  dateTo: string | null,
  accountId = 1,
) {
  const trades = await listTrades(accountId, dateFrom, dateTo);
  const tradeById = new Map<number, Record<string, unknown>>();
  for (const t of trades) tradeById.set(Number(t.id), t);
  const tags = await listTags();

  const { data: ttRows } = await supabase()
    .from("trade_tag")
    .select("tag_id, trade_id, trade!inner(account_id)")
    .eq("trade.account_id", accountId);

  const tagTradeIds = new Map<number, number[]>();
  for (const tag of tags) tagTradeIds.set(tag.id, []);
  for (const row of ttRows || []) {
    const r = row as { tag_id: number; trade_id: number };
    if (tradeById.has(r.trade_id)) {
      const arr = tagTradeIds.get(r.tag_id) || [];
      arr.push(r.trade_id);
      tagTradeIds.set(r.tag_id, arr);
    }
  }

  const stats = tags.map((tag) => {
    const ids = tagTradeIds.get(tag.id) || [];
    const tagged = ids.map((i) => tradeById.get(i)!).filter(Boolean);
    const summary = summarizeTrades(tagged as never);
    return {
      tag,
      trade_count: summary.trade_count,
      net_pnl: round2(summary.net_pnl),
      win_count: summary.win_count,
      loss_count: summary.loss_count,
      trade_win_pct: round2(summary.trade_win_pct),
      avg_pnl: summary.trade_count ? round2(summary.net_pnl / summary.trade_count) : 0,
      avg_win: round2(summary.avg_win),
      avg_loss: round2(summary.avg_loss),
      profit_factor: summary.profit_factor,
    };
  });

  const taggedIds = new Set<number>();
  for (const ids of tagTradeIds.values()) for (const id of ids) taggedIds.add(id);
  const untagged = trades.filter((t) => !taggedIds.has(Number(t.id)));
  const untaggedSummary = summarizeTrades(untagged as never);

  stats.sort(
    (a, b) =>
      -(Math.abs(a.net_pnl) - Math.abs(b.net_pnl)) ||
      -(a.trade_count - b.trade_count) ||
      (a.tag.name.toLowerCase() < b.tag.name.toLowerCase() ? -1 : 1),
  );

  const byKind = new Map<string, typeof stats>();
  for (const row of stats) {
    const k = (row.tag.kind || "general").trim() || "general";
    const arr = byKind.get(k) || [];
    arr.push(row);
    byKind.set(k, arr);
  }
  const kindStats = [...byKind.entries()].map(([kindName, rows]) => {
    const ids = new Set<number>();
    for (const r of rows) for (const id of tagTradeIds.get(r.tag.id) || []) ids.add(id);
    const kindTrades = [...ids].map((i) => tradeById.get(i)!).filter(Boolean);
    const summary = summarizeTrades(kindTrades as never);
    return {
      kind: kindName,
      tag_count: rows.length,
      trade_count: summary.trade_count,
      net_pnl: round2(summary.net_pnl),
      win_count: summary.win_count,
      loss_count: summary.loss_count,
      trade_win_pct: round2(summary.trade_win_pct),
      avg_pnl: summary.trade_count ? round2(summary.net_pnl / summary.trade_count) : 0,
      profit_factor: summary.profit_factor,
    };
  });
  kindStats.sort(
    (a, b) =>
      -(Math.abs(a.net_pnl) - Math.abs(b.net_pnl)) ||
      -(a.trade_count - b.trade_count) ||
      (a.kind.toLowerCase() < b.kind.toLowerCase() ? -1 : 1),
  );

  const kindOptions = [
    ...new Set([
      ...tags.map((t) => t.kind || "general"),
      "general",
      "setup",
      "mistake",
      "emotion",
      "process",
    ]),
  ].sort();

  return {
    date_from: dateFrom,
    date_to: dateTo,
    trade_count: trades.length,
    net_pnl: round2(trades.reduce((a, t) => a + Number(t.net_pnl), 0)),
    tags: stats,
    kinds: kindStats,
    kind_options: kindOptions,
    untagged: {
      trade_count: untaggedSummary.trade_count,
      net_pnl: round2(untaggedSummary.net_pnl),
      trade_win_pct: round2(untaggedSummary.trade_win_pct),
    },
  };
}
