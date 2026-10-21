import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { assertAuthorized, assertLiveEnabled, ApiFailure, cleanText, errorResponse, getMode, jsonBody } from "@/lib/api";
import { getDemoFile } from "@/lib/demo-storage";
import { bucket, prefix, s3Client } from "@/lib/s3";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await jsonBody(request);
    const mode = getMode(body.mode);
    assertAuthorized(request, mode);
    const key = cleanText(body.key, "File key", 512);
    if (mode === "demo") {
      const file = getDemoFile(key);
      if (!file) throw new ApiFailure(404, "Demo file not found. Files reset when the server restarts.");
      return NextResponse.json({ ok: true, mode, simulated: true, name: file.name, contentType: file.contentType, base64: file.bytes.toString("base64") });
    }
    assertLiveEnabled();
    if (!key.startsWith(prefix()) || key === prefix()) throw new ApiFailure(403, "File is outside the allowed S3 prefix.");
    const url = await getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 60 });
    return NextResponse.json({ ok: true, mode, simulated: false, url, expiresInSeconds: 60 });
  } catch (error) { return errorResponse(error); }
}
