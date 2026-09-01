import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { FlexError, flexCredentials, sendRequest } from "@/lib/server/ibkrFlex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Step 1: kick off statement generation. Returns a reference code the client
// then polls via /api/import/ibkr/fetch. Non-blocking by design.
export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      query_id?: string;
    };
    try {
      const { token, queryId } = flexCredentials({ token: body.token, queryId: body.query_id });
      const { referenceCode, url } = await sendRequest(token, queryId);
      return json({ reference_code: referenceCode, url });
    } catch (err) {
      if (err instanceof FlexError) {
        return httpError(err.code ? `${err.message} (code ${err.code})` : err.message, 400);
      }
      throw err;
    }
  });
}
