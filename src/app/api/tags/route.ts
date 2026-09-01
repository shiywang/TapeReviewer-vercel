import { NextRequest } from "next/server";
import { httpError, json, requireAuth } from "@/lib/server/http";
import { createTag, listTags } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return json({ tags: await listTags() });
}

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  const body = (await req.json()) as { name: string; kind?: string; color?: string };
  try {
    const tag = await createTag(body.name, body.kind ?? "general", body.color ?? "#0F8A7A");
    return json(tag);
  } catch {
    return httpError("Tag already exists", 400);
  }
}
