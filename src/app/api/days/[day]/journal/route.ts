import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { getDay, updateDayJournal } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ day: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { day } = await params;
    const data = await getDay(day);
    return json({ journal: data.journal, media: data.media });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ day: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { day } = await params;
    const body = (await req.json()) as { verdict?: string | null; notes?: string };
    return json(await updateDayJournal(day, body));
  });
}
