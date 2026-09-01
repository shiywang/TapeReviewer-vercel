import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { clearAllImports, countImportedTrades, listBatches } from "@/lib/server/importBatches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () =>
    json({ imports: await listBatches(), counts: await countImportedTrades() }),
  );
}

export async function DELETE(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => json(await clearAllImports()));
}
