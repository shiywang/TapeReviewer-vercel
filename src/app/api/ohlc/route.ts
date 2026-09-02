import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { getBars } from "@/lib/server/ohlc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/ohlc?symbol=NVDA&date=2026-09-01 → { bars, source, cached }
export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const symbol = (req.nextUrl.searchParams.get("symbol") || "").trim();
    const date = (req.nextUrl.searchParams.get("date") || "").trim();
    if (!symbol) return httpError("Missing symbol", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return httpError("Missing or bad date (YYYY-MM-DD)", 400);
    return json(await getBars(symbol, date));
  });
}
