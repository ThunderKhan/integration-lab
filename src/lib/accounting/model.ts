/** Accounting Vault demonstration types. Never use real client or employee records here. */
export const DOCUMENT_CATEGORIES = ["ITR", "Form 16", "GST", "Invoice", "Bank Statement", "Contract", "Other"] as const;
export const DOCUMENT_STATUSES = ["submitted", "in_review", "needs_changes", "approved", "archived"] as const;
export const DOCUMENT_SOURCES = ["manual", "whatsapp_demo"] as const;
export type Category = (typeof DOCUMENT_CATEGORIES)[number];
export type Status = (typeof DOCUMENT_STATUSES)[number];
export type Source = (typeof DOCUMENT_SOURCES)[number];
export type VaultMode = "demo" | "live";

export type DocumentRevision = { id: string; storageKey: string; name: string; contentType: string; size: number; uploadedAt: string };
export type DocumentEvent = { id: string; timestamp: string; action: string; description: string; actor: string };
export type VaultDocument = {
  id: string;
  client: string;
  financialYear: string;
  category: Category;
  status: Status;
  assignedTo: string;
  source: Source;
  uploadedAt: string;
  updatedAt: string;
  revisions: DocumentRevision[];
  events: DocumentEvent[];
};

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export class VaultInputError extends Error {
  constructor(public statusCode: number, message: string) { super(message); this.name = "VaultInputError"; }
}

export function boundedText(value: unknown, label: string, max = 100): string {
  if (typeof value !== "string") throw new VaultInputError(400, `${label} is required.`);
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new VaultInputError(400, `${label} must contain 1–${max} printable characters.`);
  }
  return result;
}

export function parseDocumentFields(input: Record<string, unknown>) {
  const client = boundedText(input.client, "Client", 80);
  const financialYear = boundedText(input.financialYear, "Financial year", 7);
  if (!/^20\d{2}-\d{2}$/.test(financialYear) || Number(financialYear.slice(5)) !== (Number(financialYear.slice(2, 4)) + 1) % 100) {
    throw new VaultInputError(400, "Financial year must look like 2025-26.");
  }
  if (!DOCUMENT_CATEGORIES.includes(input.category as Category)) throw new VaultInputError(400, "Invalid document category.");
  if (!DOCUMENT_SOURCES.includes(input.source as Source)) throw new VaultInputError(400, "Invalid document source.");
  const assignedTo = boundedText(input.assignedTo || "Unassigned", "Assigned to", 60);
  return { client, financialYear, category: input.category as Category, source: input.source as Source, assignedTo };
}

export function safeFilename(raw: string): string {
  const name = raw.replace(/^.*[\\/]/, "").replace(/[^a-zA-Z0-9._ ()-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return name || "document";
}

export function validateDocumentBytes(name: string, mime: string, bytes: Uint8Array): { filename: string; contentType: string } {
  const filename = safeFilename(name);
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const allowedMime = MIME_BY_EXTENSION[ext];
  if (!allowedMime) throw new VaultInputError(415, "Allowed: PDF, PNG, JPG, WebP, TXT, DOCX, XLSX.");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) throw new VaultInputError(413, "File must be between 1 byte and 8 MiB.");
  if (mime && mime !== allowedMime && !(ext === "jpg" && mime === "image/jpeg") && !(mime === "application/octet-stream")) {
    throw new VaultInputError(415, "File extension and content type do not match.");
  }
  const match = (prefix: number[]) => prefix.every((part, i) => bytes[i] === part);
  let signatureValid = true;
  switch (ext) {
    case "pdf": signatureValid = match([0x25, 0x50, 0x44, 0x46, 0x2d]); break;
    case "png": signatureValid = match([137, 80, 78, 71, 13, 10, 26, 10]); break;
    case "jpg": case "jpeg": signatureValid = match([255, 216, 255]); break;
    case "webp": signatureValid = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"; break;
    case "docx": case "xlsx": signatureValid = match([0x50, 0x4b, 0x03, 0x04]); break;
    case "txt": {
      try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { signatureValid = false; }
      break;
    }
  }
  if (!signatureValid) throw new VaultInputError(415, "File contents do not match the expected format.");
  return { filename, contentType: allowedMime };
}

export function canTransition(from: Status, to: Status): boolean {
  const transitions: Record<Status, Status[]> = {
    submitted: ["in_review", "needs_changes", "archived"],
    in_review: ["approved", "needs_changes", "archived"],
    needs_changes: ["submitted", "in_review", "archived"],
    approved: ["archived", "in_review"],
    archived: ["submitted"],
  };
  return transitions[from].includes(to);
}

export function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export function latestRevision(record: VaultDocument): DocumentRevision {
  const result = record.revisions.at(-1);
  if (!result) throw new VaultInputError(500, "Document has no saved revisions.");
  return result;
}
