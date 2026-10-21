import { NextRequest, NextResponse } from "next/server";
import { ApiFailure, jsonBody } from "@/lib/api";
import { DOCUMENT_STATUSES, boundedText, canTransition, type Status } from "@/lib/accounting/model";
import { authorizeVault, audit, optionalComment, publicRecord, validateId, vaultError } from "@/lib/accounting/requests";
import { readRecord, saveRecord, withRecordLock } from "@/lib/accounting/store";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = validateId((await params).id);
    const payload: unknown = await jsonBody(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiFailure(400, "Expected JSON object.");
    const body = payload as Record<string, unknown>;
    const mode = authorizeVault(request, body.mode);
    if (!DOCUMENT_STATUSES.includes(body.status as Status)) throw new ApiFailure(400, "Invalid document status.");
    const newStatus = body.status as Status;
    const note = optionalComment(body.note);
    const assignedTo = body.assignedTo === undefined ? undefined : boundedText(body.assignedTo, "Assigned to", 60);
    const record = await withRecordLock(`${mode}:${id}`, async () => {
      const current = await readRecord(mode, id);
      if (!current) throw new ApiFailure(404, "Document not found.");
      if (current.status === "archived" && assignedTo !== undefined && newStatus === "archived") throw new ApiFailure(409, "Restore the document before reassigning it.");
      const statusChanged = current.status !== newStatus;
      const assignedChanged = assignedTo !== undefined && current.assignedTo !== assignedTo;
      if (statusChanged && !canTransition(current.status, newStatus)) throw new ApiFailure(409, `Cannot move from ${current.status} to ${newStatus}.`);
      if (!statusChanged && !assignedChanged && !note) throw new ApiFailure(400, "No changes requested.");
      const next = { ...current, status: newStatus, assignedTo: assignedTo ?? current.assignedTo, updatedAt: new Date().toISOString(), events: [
        ...current.events,
        audit("review", `${current.status} → ${newStatus}${assignedChanged ? `; assigned to ${assignedTo}` : ""}${note ? `; note: ${note}` : ""}`),
      ] };
      await saveRecord(mode, next);
      return next;
    });
    return NextResponse.json({ ok: true, mode, document: publicRecord(record) });
  } catch (error) { return vaultError(error); }
}
