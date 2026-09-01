import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { setTradeVideo } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { id } = await params;
    const body = (await req.json()) as { video_path?: string | null };
    const trade = await setTradeVideo(Number(id), body.video_path ?? null);
    if (!trade) return httpError("Trade not found", 404);
    return json(trade);
  });
}
