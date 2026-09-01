import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { tagStatistics } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    return json(await tagStatistics(sp.get("date_from"), sp.get("date_to")));
  });
}
