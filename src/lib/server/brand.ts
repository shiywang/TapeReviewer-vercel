// Port of app/brand.py — app title/tagline + logo.
// Logo is stored as a base64 data URL in the `settings` table (key: logo_data_url),
// which avoids needing paid object storage and serves inline via <img src>.
import { supabase } from "./supabase";
import { ApiError } from "./http";

const ALLOWED_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};
const MAX_BYTES = 2 * 1024 * 1024;

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const { data } = await supabase().from("settings").select("value").eq("key", key).maybeSingle();
  return data ? (data as { value: string }).value : fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase().from("settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw new ApiError(error.message, 500);
}

export interface Brand {
  app_title: string;
  app_tagline: string;
  has_logo: boolean;
  logo_url: string | null;
}

export async function getBrand(): Promise<Brand> {
  const title = (await getSetting("app_title", "TapeReviewer")) || "TapeReviewer";
  const tagline = await getSetting("app_tagline", "Review the tape. Keep the edge.");
  const logo = await getSetting("logo_data_url", "");
  return {
    app_title: title,
    app_tagline: tagline,
    has_logo: !!logo,
    logo_url: logo || null,
  };
}

export async function saveLogo(filename: string, data: Buffer): Promise<Brand> {
  if (data.length > MAX_BYTES) throw new ApiError("Logo must be 2MB or smaller", 400);
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  const mime = ALLOWED_EXT[ext];
  if (!mime) {
    throw new ApiError(
      `Unsupported image type. Use: ${Object.keys(ALLOWED_EXT).sort().join(", ")}`,
      400,
    );
  }
  const dataUrl = `data:${mime};base64,${data.toString("base64")}`;
  await setSetting("logo_data_url", dataUrl);
  return getBrand();
}

export async function clearLogo(): Promise<Brand> {
  await setSetting("logo_data_url", "");
  return getBrand();
}
