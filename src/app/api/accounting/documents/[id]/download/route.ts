import { NextRequest, NextResponse } from "next/server";
import { ApiFailure, jsonBody } from "@/lib/api";
import { authorizeVault, validateId, vaultError } from "@/lib/accounting/requests";
import { latestRevision } from "@/lib/accounting/model";
import { getDownload, readRecord } from "@/lib/accounting/store";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = validateId((await params).id);
    const body = await jsonBody(request);
    const mode = authorizeVault(request, body.mode);
    const record = await readRecord(mode, id);
    if (!record) throw new ApiFailure(404, "Document not found.");
    const revision = typeof body.revisionId === "string" ? record.revisions.find(item => item.id === body.revisionId) : latestRevision(record);
    if (!revision) throw new ApiFailure(404, "Revision not found.");
    const download = await getDownload(mode, revision);
    return NextResponse.json({ ok: true, ...download }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return vaultError(error); }
}
