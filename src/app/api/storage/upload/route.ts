import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { assertAuthorized, assertLiveEnabled, ApiFailure, errorResponse, getMode } from "@/lib/api";
import { addDemoFile } from "@/lib/demo-storage";
import { bucket, friendlyFilename, prefix, s3Client } from "@/lib/s3";

export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BYTES + 100_000) throw new ApiFailure(413, "The maximum file size is 5 MB.");
    const form = await request.formData();
    const mode = getMode(form.get("mode"));
    assertAuthorized(request, mode);
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiFailure(400, "Choose a file to upload.");
    if (!file.size || file.size > MAX_BYTES) throw new ApiFailure(413, "Upload a file smaller than 5 MB.");
    if (!ALLOWED.has(file.type)) throw new ApiFailure(415, "Allowed formats: PNG, JPEG, WebP, PDF, and TXT.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const name = friendlyFilename(file.name);

    if (mode === "demo") {
      const uploaded = addDemoFile(name, file.type, bytes);
      return NextResponse.json({ ok: true, mode, simulated: true, file: uploaded, message: "Stored in temporary demo memory, not AWS S3." });
    }

    assertLiveEnabled();
    const key = `${prefix()}${randomUUID()}-${name}`;
    await s3Client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: file.type, ServerSideEncryption: "AES256" }));
    return NextResponse.json({ ok: true, mode, simulated: false, file: { key, name, size: file.size, contentType: file.type, uploadedAt: new Date().toISOString() }, message: "File uploaded to private S3 storage." });
  } catch (error) { return errorResponse(error); }
}
