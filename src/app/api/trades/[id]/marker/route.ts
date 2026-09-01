import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { updateTrade } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { id } = await params;
    const body = (await req.json()) as { video_marker_sec?: number | null };
    const trade = await updateTrade(Number(id), { video_marker_sec: body.video_marker_sec ?? null });
    if (!trade) return httpError("Trade not found", 404);
    return json(trade);
  });
}
