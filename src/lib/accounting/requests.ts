import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ApiFailure, assertAuthorized, assertLiveEnabled, errorResponse, getMode } from "@/lib/api";
import { MAX_DOCUMENT_BYTES, VaultInputError, boundedText, isDocumentId, type DocumentEvent, type VaultDocument, type VaultMode } from "./model";

export function authorizeVault(request: NextRequest, value: unknown): VaultMode {
  const mode = getMode(value);
  assertAuthorized(request, mode);
  if (mode === "live") assertLiveEnabled();
  // The vault has NO real user identity / RBAC. Never expose it on the public Internet.
  if (process.env.NODE_ENV === "production") throw new ApiFailure(403, "Accounting Vault is a local development proof of concept. Production use is disabled.");
  return mode;
}

export function vaultError(error: unknown): NextResponse {
  if (error instanceof VaultInputError) return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode });
  return errorResponse(error);
}

export function validateId(value: unknown): string {
  if (!isDocumentId(value)) throw new ApiFailure(400, "Invalid document ID.");
  return value;
}

export function audit(action: string, description: string): DocumentEvent {
  return { id: randomUUID(), timestamp: new Date().toISOString(), action, description, actor: "Local lab operator (not an authenticated employee)" };
}

export async function readUpload(request: NextRequest) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length && (length > MAX_DOCUMENT_BYTES + 75_000 || !Number.isFinite(length))) throw new ApiFailure(413, "File must not exceed 8 MiB.");
  const form = await request.formData();
  const mode = authorizeVault(request, form.get("mode"));
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiFailure(400, "Select a file first.");
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) throw new ApiFailure(413, "File must be between 1 byte and 8 MiB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  return { form, file, bytes, mode };
}

export function optionalComment(value: unknown): string {
  return value === undefined || value === null || value === "" ? "" : boundedText(value, "Comment", 240);
}

// Object keys are server-only references, not part of the browser-facing metadata model.
export function publicRecord(record: VaultDocument) {
  return { ...record, revisions: record.revisions.map(({ storageKey: _storageKey, ...revision }) => {
    void _storageKey;
    return revision;
  }) };
}
