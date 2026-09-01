// Port of app/import_batches.py — batch tracking, fingerprints, cleanup.
import { createHash } from "node:crypto";
import { supabase } from "./supabase";
import { ApiError } from "./http";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Deterministic JSON with recursively sorted keys. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function fingerprintFiles(files: [string, string][]): string {
  const bodyHashes = files.map(([, text]) => sha256(text)).sort();
  return sha256(bodyHashes.join("\n"));
}

export function fingerprintTrades(trades: Record<string, unknown>[]): string {
  const keys = trades.map((t) => ({
    symbol: t.symbol ?? null,
    side: t.side ?? null,
    opened_at: t.opened_at ?? null,
    closed_at: t.closed_at ?? null,
    qty: t.qty ?? null,
    avg_entry: t.avg_entry ?? null,
    avg_exit: t.avg_exit ?? null,
    net_pnl: t.net_pnl ?? null,
  }));
  keys.sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1));
  return sha256(canonicalJson(keys));
}

export interface Batch {
  id: number;
  account_id: number;
  source: "das" | "csv" | "ibkr";
  fingerprint: string;
  trade_fingerprint: string | null;
  label: string;
  trade_count: number;
  net_pnl: number;
  created_at: string;
  live_trade_count?: number;
}

export async function findBatchByFingerprint(
  fingerprint: string,
  accountId = 1,
): Promise<Batch | null> {
  const { data, error } = await supabase()
    .from("import_batch")
    .select("*")
    .eq("account_id", accountId)
    .or(`fingerprint.eq.${fingerprint},trade_fingerprint.eq.${fingerprint}`)
    .limit(1);
  if (error) throw new ApiError(error.message, 500);
  return (data && data[0]) || null;
}

export async function listBatches(accountId = 1): Promise<Batch[]> {
  const sb = supabase();
  const { data: batches, error } = await sb
    .from("import_batch")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new ApiError(error.message, 500);

  const { data: trades } = await sb
    .from("trade")
    .select("import_batch_id")
    .eq("account_id", accountId)
    .not("import_batch_id", "is", null);
  const counts = new Map<number, number>();
  for (const t of trades || []) {
    const id = (t as { import_batch_id: number }).import_batch_id;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return (batches || []).map((b: Batch) => ({ ...b, live_trade_count: counts.get(b.id) || 0 }));
}

export async function createBatch(opts: {
  source: "das" | "csv" | "ibkr";
  fingerprint: string;
  label: string;
  trade_count: number;
  net_pnl: number;
  account_id?: number;
  trade_fingerprint?: string | null;
}): Promise<Batch> {
  const accountId = opts.account_id ?? 1;
  if (await findBatchByFingerprint(opts.fingerprint, accountId))
    throw new Error("IMPORT_ALREADY_EXISTS");
  if (opts.trade_fingerprint && (await findBatchByFingerprint(opts.trade_fingerprint, accountId)))
    throw new Error("IMPORT_ALREADY_EXISTS");

  const { data, error } = await supabase()
    .from("import_batch")
    .insert({
      account_id: accountId,
      source: opts.source,
      fingerprint: opts.fingerprint,
      trade_fingerprint: opts.trade_fingerprint ?? null,
      label: opts.label,
      trade_count: opts.trade_count,
      net_pnl: opts.net_pnl,
    })
    .select("*")
    .single();
  if (error) throw new ApiError(error.message, 500);
  return data as Batch;
}

export async function deleteBatch(batchId: number, accountId = 1) {
  const sb = supabase();
  const { data: batch } = await sb
    .from("import_batch")
    .select("*")
    .eq("id", batchId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!batch) throw new ApiError("NOT_FOUND", 404);

  const { data: deleted } = await sb
    .from("trade")
    .delete()
    .eq("import_batch_id", batchId)
    .eq("account_id", accountId)
    .select("id");
  await sb.from("import_batch").delete().eq("id", batchId).eq("account_id", accountId);
  return { deleted_batch_id: batchId, deleted_trades: (deleted || []).length, batch };
}

function isImportedNote(notes: string | null): boolean {
  return (
    !!notes &&
    (notes.startsWith("Imported from DAS") ||
      notes.startsWith("Imported from CSV") ||
      notes.startsWith("Imported from IBKR"))
  );
}

export async function clearAllImports(accountId = 1) {
  const sb = supabase();
  const batches = await listBatches(accountId);
  const { data: trades } = await sb
    .from("trade")
    .select("id, import_batch_id, notes")
    .eq("account_id", accountId);
  const ids = (trades || [])
    .filter(
      (t: { id: number; import_batch_id: number | null; notes: string | null }) =>
        t.import_batch_id !== null || isImportedNote(t.notes),
    )
    .map((t: { id: number }) => t.id);
  let deletedTrades = 0;
  if (ids.length) {
    const { data: del } = await sb.from("trade").delete().in("id", ids).select("id");
    deletedTrades = (del || []).length;
  }
  const { data: delBatches } = await sb
    .from("import_batch")
    .delete()
    .eq("account_id", accountId)
    .select("id");
  return {
    deleted_batches: (delBatches || []).length,
    deleted_trades: deletedTrades,
    cleared: batches.map((b) => b.id),
  };
}

export async function countImportedTrades(accountId = 1) {
  const { data: trades } = await supabase()
    .from("trade")
    .select("import_batch_id, notes")
    .eq("account_id", accountId);
  let batched = 0;
  let orphan = 0;
  for (const t of trades || []) {
    const row = t as { import_batch_id: number | null; notes: string | null };
    if (row.import_batch_id !== null) batched += 1;
    else if (isImportedNote(row.notes)) orphan += 1;
  }
  return { batched, orphan_imported: orphan, total_imported: batched + orphan };
}
