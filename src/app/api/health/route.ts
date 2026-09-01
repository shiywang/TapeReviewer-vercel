import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ status: "ok", service: "tapereviewer", media: { mode: "url" } });
}
