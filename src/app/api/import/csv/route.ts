import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { parseCsvText, previewRows, type CsvMapping } from "@/lib/server/csvImport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return httpError("No file uploaded", 400);
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const [headers, rows] = parseCsvText(text);

    const sp = req.nextUrl.searchParams;
    const mapping: CsvMapping = {
      symbol: sp.get("symbol") || "symbol",
      qty: sp.get("qty") || "qty",
      side: sp.get("side"),
      price: sp.get("price"),
      entry_price: sp.get("entry_price"),
      exit_price: sp.get("exit_price"),
      opened_at: sp.get("opened_at"),
      closed_at: sp.get("closed_at"),
      datetime: sp.get("datetime"),
      fees: sp.get("fees"),
      pnl: sp.get("pnl"),
      action: sp.get("action"),
    };

    const lower = new Map(headers.map((h) => [h.toLowerCase(), h]));
    const pick = (...names: string[]): string | null => {
      for (const n of names) {
        const h = lower.get(n.toLowerCase());
        if (h) return h;
      }
      return null;
    };
    if (!headers.includes(mapping.symbol))
      mapping.symbol = pick("symbol", "ticker") || mapping.symbol;
    if (!headers.includes(mapping.qty))
      mapping.qty = pick("qty", "quantity", "shares") || mapping.qty;
    if (!mapping.side) mapping.side = pick("side", "position");
    if (!mapping.entry_price) mapping.entry_price = pick("entry", "entry_price", "avg_entry", "Entry Price");
    if (!mapping.exit_price) mapping.exit_price = pick("exit", "exit_price", "avg_exit", "Exit Price");
    if (!mapping.price) mapping.price = pick("price", "fill_price");
    if (!mapping.opened_at) mapping.opened_at = pick("opened_at", "entry_time", "open_time", "Entry Time");
    if (!mapping.closed_at) mapping.closed_at = pick("closed_at", "exit_time", "close_time", "Exit Time");
    if (!mapping.datetime) mapping.datetime = pick("datetime", "date", "time", "Date/Time");
    if (!mapping.fees) mapping.fees = pick("fees", "commission", "commissions");
    if (!mapping.pnl) mapping.pnl = pick("pnl", "net_pnl", "profit", "P&L", "PL");
    if (!mapping.action) mapping.action = pick("action", "buy/sell", "B/S");

    const preview = previewRows(rows, mapping);
    return json({
      headers,
      mapping,
      row_count: rows.length,
      valid_count: preview.filter((r) => r.valid).length,
      preview: preview.slice(0, 200),
      raw_rows: rows.slice(0, 200),
    });
  });
}
