import { NextRequest, NextResponse } from "next/server";
import { assertAuthorized, assertLiveEnabled, cleanText, errorResponse, getMode, jsonBody, readProviderError, requiredEnv, ApiFailure } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await jsonBody(request);
    const mode = getMode(body.mode);
    assertAuthorized(request, mode);
    const raw = cleanText(body.to, "Phone number", 24);
    const to = raw.replace(/[\s()+-]/g, "");
    if (!/^\d{8,15}$/.test(to)) throw new ApiFailure(400, "Use an international phone number, e.g. 919876543210.");

    if (mode === "demo") {
      return NextResponse.json({ ok: true, mode, simulated: true, id: `demo-wa-${Date.now()}`, message: "Simulated WhatsApp template request. No message was sent." });
    }

    assertLiveEnabled();
    const token = requiredEnv("WHATSAPP_ACCESS_TOKEN");
    const phoneId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
    const version = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
    if (!/^v\d+\.\d+$/.test(version)) throw new ApiFailure(503, "Invalid WhatsApp Graph API version configuration.");
    const template = process.env.WHATSAPP_TEMPLATE_NAME || "hello_world";
    const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";

    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name: template, language: { code: language } } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiFailure(502, await readProviderError(response));
    const result = (await response.json()) as { messages?: Array<{ id?: string }> };
    return NextResponse.json({ ok: true, mode, simulated: false, id: result.messages?.[0]?.id ?? "accepted", message: "Meta accepted the template message request. Delivery is not yet confirmed." });
  } catch (error) { return errorResponse(error); }
}
