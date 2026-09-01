import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** JSON response helper (mirrors FastAPI's default JSON responses). */
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** FastAPI-style error body: { detail: string }. */
export function httpError(detail: string, status = 400) {
  return NextResponse.json({ detail }, { status });
}

/** Raised by service code to signal an HTTP error with a specific status. */
export class ApiError extends Error {
  status: number;
  constructor(detail: string, status = 400) {
    super(detail);
    this.status = status;
  }
}

/**
 * App-password gate. Returns a 401 Response when the request is unauthorized,
 * or null when the request may proceed. If APP_PASSWORD is unset, auth is off
 * (matches the original behavior).
 */
export function requireAuth(req: Request): NextResponse | null {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected) return null;

  let provided = req.headers.get("x-app-password") || "";
  if (!provided) {
    // Fall back to HTTP Basic (the original also accepted this).
    const authz = req.headers.get("authorization") || "";
    if (authz.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(authz.slice(6), "base64").toString("utf8");
        provided = decoded.split(":").slice(1).join(":");
      } catch {
        provided = "";
      }
    }
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json(
      { detail: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Basic" } },
    );
  }
  return null;
}

/** Wrap a handler so thrown ApiError/ValueError become proper JSON responses. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return httpError(err.message, err.status);
    const message = err instanceof Error ? err.message : "Internal error";
    return httpError(message, 500);
  }
}
