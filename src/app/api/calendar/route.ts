import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { getCalendar } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const year = Number(sp.get("year")) || now.getUTCFullYear();
    const month = Number(sp.get("month")) || now.getUTCMonth() + 1;
    return json(await getCalendar(year, month));
  });
}
