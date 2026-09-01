import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { createTrade, type TradeCreate } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const body = (await req.json()) as TradeCreate;
    return json(await createTrade(body));
  });
}
