import { NextRequest } from "next/server";
import { ApiError, handle, httpError, json, requireAuth } from "@/lib/server/http";
import { deleteBatch } from "@/lib/server/importBatches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const { id } = await params;
    try {
      return json(await deleteBatch(Number(id)));
    } catch (err) {
      if (err instanceof ApiError && err.message === "NOT_FOUND") {
        return httpError("Import batch not found", 404);
      }
      throw err;
    }
  });
}
