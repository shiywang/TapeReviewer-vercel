import { NextRequest } from "next/server";
import { handle, json, requireAuth } from "@/lib/server/http";
import { getAccount } from "@/lib/server/services";
import { getBrand, setSetting } from "@/lib/server/brand";
import { supabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const [account, brand] = await Promise.all([getAccount(), getBrand()]);
    return json({
      account,
      brand,
      media_dir: "", // videos are linked by URL now
      media: { mode: "url" },
      auth_enabled: !!process.env.APP_PASSWORD,
    });
  });
}

export async function PATCH(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const body = (await req.json()) as {
      account_name?: string;
      timezone?: string;
      currency?: string;
      app_title?: string;
      app_tagline?: string;
    };
    const sb = supabase();
    const acct: Record<string, string> = {};
    if (body.account_name != null) acct.name = body.account_name;
    if (body.timezone != null) acct.timezone = body.timezone;
    if (body.currency != null) acct.currency = body.currency;
    if (Object.keys(acct).length) await sb.from("account").update(acct).eq("id", 1);

    if (body.app_title != null) {
      const title = (body.app_title.trim() || "TapeReviewer").slice(0, 80);
      await setSetting("app_title", title);
    }
    if (body.app_tagline != null) await setSetting("app_tagline", body.app_tagline.trim().slice(0, 120));

    return json({ account: await getAccount(), brand: await getBrand() });
  });
}
