import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { importDasFiles, isDasCsv } from "@/lib/server/dasImport";
import { findBatchByFingerprint } from "@/lib/server/importBatches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return httpError("No files uploaded", 400);

    const parsed: [string, string][] = await Promise.all(
      files.map(
        async (f) => [f.name || "trades.csv", (await f.text()).replace(/^\uFEFF/, "")] as [string, string],
      ),
    );

    const anyDas = parsed.some(([, text]) => {
      if (!text.trim()) return false;
      const first = text.split(/\r?\n/)[0] || "";
      const headers = first.split(",").map((h) => h.trim().replace(/,+$/, ""));
      return isDasCsv(headers);
    });
    if (!anyDas) {
      return httpError(
        "Not a DAS Trader CSV. Expected columns: Time, Symbol, Side, Price, Qty, …",
        400,
      );
    }

    const defaultYear = Number(req.nextUrl.searchParams.get("default_year")) || 2026;
    const result = importDasFiles(parsed, defaultYear);

    let existing = await findBatchByFingerprint(result.fingerprint, 1);
    if (!existing && result.trade_fingerprint) {
      existing = await findBatchByFingerprint(result.trade_fingerprint, 1);
    }
    return json({ ...result, already_imported: existing !== null, existing_batch: existing });
  });
}
