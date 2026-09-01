import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { FlexError, flexToken, fetchStatement, buildFlexPreview } from "@/lib/server/ibkrFlex";
import { findBatchByFingerprint } from "@/lib/server/importBatches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Step 2: a single GetStatement poll. Returns {status:"pending"} (client retries
// after retry_after_ms) or {status:"ready", ...preview} in the DAS preview shape.
export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const ref = req.nextUrl.searchParams.get("ref") || "";
    const url = req.nextUrl.searchParams.get("url") || undefined;
    if (!ref) return httpError("Missing reference code", 400);

    try {
      const token = flexToken();
      const outcome = await fetchStatement(token, ref, url);
      if (outcome.status === "pending") {
        return json({ status: "pending", retry_after_ms: outcome.retryAfterMs, code: outcome.code });
      }

      const preview = buildFlexPreview(outcome.xml);
      let existing = await findBatchByFingerprint(preview.fingerprint, 1);
      if (!existing && preview.trade_fingerprint) {
        existing = await findBatchByFingerprint(preview.trade_fingerprint, 1);
      }
      return json({
        status: "ready",
        ...preview,
        already_imported: existing !== null,
        existing_batch: existing,
      });
    } catch (err) {
      if (err instanceof FlexError) {
        return httpError(err.code ? `${err.message} (code ${err.code})` : err.message, 400);
      }
      throw err;
    }
  });
}
