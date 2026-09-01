import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { clearLogo, saveLogo } from "@/lib/server/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return httpError("No file uploaded", 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const brand = await saveLogo(file.name || "logo.png", buf);
    return json({ brand });
  });
}

export async function DELETE(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => json({ brand: await clearLogo() }));
}
