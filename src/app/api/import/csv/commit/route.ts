import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { previewRows, type CsvMapping } from "@/lib/server/csvImport";
import { createTrade } from "@/lib/server/services";
import { supabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const payload = (await req.json()) as {
      mapping: CsvMapping;
      rows: Record<string, string>[];
      account_id?: number;
    };
    const accountId = payload.account_id ?? 1;
    const preview = previewRows(payload.rows, payload.mapping);
    const sb = supabase();
    const created: Record<string, unknown>[] = [];
    const errors: { index: number; errors: string[] }[] = [];

    for (const row of preview) {
      if (!row.valid) {
        errors.push({ index: row.index, errors: row.errors });
        continue;
      }
      let trade = await createTrade({
        symbol: row.symbol,
        side: row.side,
        opened_at: row.opened_at!,
        closed_at: row.closed_at!,
        qty: row.qty!,
        avg_entry: row.avg_entry!,
        avg_exit: row.avg_exit!,
        fees: row.fees || 0,
        account_id: accountId,
        notes: "Imported from CSV",
      });
      if (row.net_pnl !== null && row.net_pnl !== undefined) {
        await sb
          .from("trade")
          .update({ net_pnl: row.net_pnl, gross_pnl: row.gross_pnl, net_roi: row.net_roi })
          .eq("id", trade.id as number);
        trade = { ...trade, net_pnl: row.net_pnl, gross_pnl: row.gross_pnl, net_roi: row.net_roi };
      }
      created.push(trade);
    }

    return json({ created: created.length, errors, trades: created.slice(0, 50) });
  });
}
