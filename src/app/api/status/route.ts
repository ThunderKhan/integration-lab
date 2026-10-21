import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const liveEnabled = process.env.ENABLE_LIVE_INTEGRATIONS === "true";
  return NextResponse.json({
    liveEnabled,
    adminTokenRequired: true,
    production: process.env.NODE_ENV === "production",
    providers: {
      whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      mailgun: Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && process.env.MAILGUN_FROM_EMAIL),
      s3: Boolean(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
