import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeVault, audit, publicRecord, readUpload, vaultError } from "@/lib/accounting/requests";
import { parseDocumentFields, validateDocumentBytes, type VaultDocument } from "@/lib/accounting/model";
import { listRecords, removeObject, saveObject, saveRecord } from "@/lib/accounting/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const mode = authorizeVault(request, request.nextUrl.searchParams.get("mode"));
    const documents = await listRecords(mode);
    // No S3 keys or bearer links returned in ordinary list requests.
    return NextResponse.json({ ok: true, mode, documents: documents.map(publicRecord) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return vaultError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { form, file, bytes, mode } = await readUpload(request);
    const fields = parseDocumentFields({
      client: form.get("client"), financialYear: form.get("financialYear"),
      category: form.get("category"), assignedTo: form.get("assignedTo"), source: form.get("source"),
    });
    const accepted = validateDocumentBytes(file.name, file.type, bytes);
    const id = randomUUID();
    const revisionId = randomUUID();
    const created = new Date().toISOString();
    const storageKey = await saveObject(mode, id, revisionId, bytes, accepted.contentType);
    const record: VaultDocument = {
      id, ...fields, status: "submitted", uploadedAt: created, updatedAt: created,
      revisions: [{ id: revisionId, storageKey, name: accepted.filename, size: file.size, contentType: accepted.contentType, uploadedAt: created }],
      events: [audit("uploaded", `New ${fields.category} document received (${fields.source === "whatsapp_demo" ? "simulated WhatsApp attachment" : "manual upload"}).`)],
    };
    try { await saveRecord(mode, record); }
    catch (error) { await removeObject(mode, storageKey).catch(() => {}); throw error; }
    return NextResponse.json({ ok: true, mode, document: publicRecord(record), simulated: mode === "demo" }, { status: 201 });
  } catch (error) { return vaultError(error); }
}
