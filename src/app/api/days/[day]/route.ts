import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { getDay } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ day: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { day } = await params;
    return json(await getDay(day));
  });
}
