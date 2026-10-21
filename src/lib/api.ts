import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export type Mode = "demo" | "live";

export class ApiFailure extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getMode(value: unknown): Mode {
  if (value === "demo" || value === "live") return value;
  throw new ApiFailure(400, "Mode must be 'demo' or 'live'.");
}

export function assertAuthorized(request: NextRequest, mode: Mode): void {
  const expected = process.env.INTEGRATION_LAB_ADMIN_TOKEN?.trim();
  const mustAuthorize = mode === "live" || process.env.NODE_ENV === "production";

  if (!mustAuthorize) return;
  if (!expected) {
    throw new ApiFailure(503, "Admin access is not configured. Set INTEGRATION_LAB_ADMIN_TOKEN.");
  }

  const provided = request.headers.get("x-lab-token") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ApiFailure(401, "Invalid admin token.");
  }
}

export function assertLiveEnabled(): void {
  if (process.env.ENABLE_LIVE_INTEGRATIONS !== "true") {
    throw new ApiFailure(403, "Live integrations are disabled. Enable them in .env.local first.");
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ApiFailure(503, `${name} is not configured on the server.`);
  return value;
}

export function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new ApiFailure(400, `${field} must contain 1–${max} characters.`);
  }
  return value.trim();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export async function jsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiFailure(415, "Expected application/json.");
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return body as Record<string, unknown>;
  } catch {
    throw new ApiFailure(400, "Invalid JSON request body.");
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiFailure) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  // Never expose provider responses, access tokens, or stack traces to clients.
  console.error("Integration request failed:", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ ok: false, error: "Integration failed. Check server logs and provider configuration." }, { status: 502 });
}

export async function readProviderError(response: Response): Promise<string> {
  // Provider responses can contain identifying data; return only a generic status.
  return `Provider rejected the request (HTTP ${response.status}). Check account permissions and server logs.`;
}
