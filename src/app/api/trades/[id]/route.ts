import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { deleteTrade, getTrade, updateTrade } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { id } = await params;
    const trade = await getTrade(Number(id));
    if (!trade) return httpError("Trade not found", 404);
    return json(trade);
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const trade = await updateTrade(Number(id), body);
    if (!trade) return httpError("Trade not found", 404);
    return json(trade);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { id } = await params;
    const ok = await deleteTrade(Number(id));
    if (!ok) return httpError("Trade not found", 404);
    return json({ ok: true });
  });
}
