import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ApiFailure } from "@/lib/api";
import { validateDocumentBytes } from "@/lib/accounting/model";
import { audit, publicRecord, readUpload, validateId, vaultError } from "@/lib/accounting/requests";
import { readRecord, removeObject, saveObject, saveRecord, withRecordLock } from "@/lib/accounting/store";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = validateId((await params).id);
    const { file, bytes, mode } = await readUpload(request);
    const accepted = validateDocumentBytes(file.name, file.type, bytes);
    const result = await withRecordLock(`${mode}:${id}`, async () => {
      const current = await readRecord(mode, id);
      if (!current) throw new ApiFailure(404, "Document not found.");
      if (current.status === "archived") throw new ApiFailure(409, "Restore an archived document before replacing it.");
      const revisionId = randomUUID();
      const storageKey = await saveObject(mode, id, revisionId, bytes, accepted.contentType);
      const now = new Date().toISOString();
      const next = {
        ...current, status: "submitted" as const, updatedAt: now,
        revisions: [...current.revisions, { id: revisionId, storageKey, name: accepted.filename, contentType: accepted.contentType, size: bytes.length, uploadedAt: now }],
        events: [...current.events, audit("replaced", `Uploaded revision ${current.revisions.length + 1}. Previous revisions remain available.`)],
      };
      try { await saveRecord(mode, next); }
      catch (error) { await removeObject(mode, storageKey).catch(() => {}); throw error; }
      return next;
    });
    return NextResponse.json({ ok: true, mode, document: publicRecord(result), simulated: mode === "demo" });
  } catch (error) { return vaultError(error); }
}
