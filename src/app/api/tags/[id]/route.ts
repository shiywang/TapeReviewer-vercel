import { NextRequest } from "next/server";
import { httpError, json, requireAuth } from "@/lib/server/http";
import { deleteTag, updateTag } from "@/lib/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  const { id } = await params;
  const body = (await req.json()) as { name?: string; kind?: string; color?: string };
  try {
    const tag = await updateTag(Number(id), body);
    if (!tag) return httpError("Tag not found", 404);
    return json(tag);
  } catch {
    return httpError("Tag name already exists", 400);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  const { id } = await params;
  const ok = await deleteTag(Number(id));
  if (!ok) return httpError("Tag not found", 404);
  return json({ ok: true });
}
