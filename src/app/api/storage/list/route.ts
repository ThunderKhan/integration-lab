import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { assertAuthorized, assertLiveEnabled, errorResponse, getMode } from "@/lib/api";
import { listDemoFiles } from "@/lib/demo-storage";
import { bucket, prefix, s3Client } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const mode = getMode(request.nextUrl.searchParams.get("mode"));
    assertAuthorized(request, mode);
    if (mode === "demo") return NextResponse.json({ ok: true, mode, simulated: true, files: listDemoFiles() }, { headers: { "Cache-Control": "no-store" } });
    assertLiveEnabled();
    const p = prefix();
    const result = await s3Client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: p, MaxKeys: 50 }));
    const files = (result.Contents ?? []).filter((item) => Boolean(item.Key && item.Key !== p)).map((item) => ({
      key: item.Key!, name: item.Key!.slice(p.length).replace(/^[0-9a-f-]{36}-/, ""), size: item.Size ?? 0,
      contentType: "application/octet-stream", uploadedAt: item.LastModified?.toISOString() ?? "",
    }));
    return NextResponse.json({ ok: true, mode, simulated: false, files }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
