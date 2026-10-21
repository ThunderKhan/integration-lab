import { NextRequest, NextResponse } from "next/server";
import { assertAuthorized, assertLiveEnabled, cleanText, errorResponse, getMode, jsonBody, readProviderError, requiredEnv, ApiFailure, isEmail } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await jsonBody(request);
    const mode = getMode(body.mode);
    assertAuthorized(request, mode);
    const to = cleanText(body.to, "Recipient", 254);
    const subject = cleanText(body.subject, "Subject", 150);
    const message = cleanText(body.message, "Message", 5000);
    if (!isEmail(to)) throw new ApiFailure(400, "Enter a valid recipient email address.");

    if (mode === "demo") {
      return NextResponse.json({ ok: true, mode, simulated: true, id: `demo-email-${Date.now()}`, message: "Simulated Mailgun request. No email was sent." });
    }

    assertLiveEnabled();
    const apiKey = requiredEnv("MAILGUN_API_KEY");
    const domain = requiredEnv("MAILGUN_DOMAIN");
    const from = requiredEnv("MAILGUN_FROM_EMAIL");
    if (!isEmail(from)) throw new ApiFailure(503, "MAILGUN_FROM_EMAIL must be a valid email address.");
    const region = (process.env.MAILGUN_REGION || "us").toLowerCase();
    if (region !== "us" && region !== "eu") throw new ApiFailure(503, "MAILGUN_REGION must be us or eu.");

    const form = new FormData();
    form.set("from", from);
    form.set("to", to);
    form.set("subject", subject);
    form.set("text", message);
    const host = region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
    const response = await fetch(`https://${host}/v3/${encodeURIComponent(domain)}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiFailure(502, await readProviderError(response));
    const result = (await response.json()) as { id?: string };
    return NextResponse.json({ ok: true, mode, simulated: false, id: result.id ?? "accepted", message: "Mailgun accepted the email request. Delivery is not yet confirmed." });
  } catch (error) { return errorResponse(error); }
}
