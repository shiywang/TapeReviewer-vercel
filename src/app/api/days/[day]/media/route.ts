import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { setDayMedia } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ day: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { day } = await params;
    const body = (await req.json()) as { relative_path?: string | null };
    return json(await setDayMedia(day, body.relative_path ?? null));
  });
}
