import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucket, prefix, s3Client } from "@/lib/s3";
import type { DocumentRevision, VaultDocument, VaultMode } from "./model";

// Local persistence is for a single-machine demonstration ONLY, not a production database.
const root = path.join(process.cwd(), ".local-data", "accounting-vault");
const s3Root = () => `${prefix()}accounting-vault/`;
const metadataKey = (id: string) => `${s3Root()}records/${id}.json`;
const localMetadata = (id: string) => path.join(root, "records", `${id}.json`);
const objectKey = (id: string, revision: string) => `${s3Root()}objects/${id}/${revision}`;
const localObject = (id: string, revision: string) => path.join(root, "objects", id, revision);

function missing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "NoSuchKey" || value.name === "NotFound" || value.$metadata?.httpStatusCode === 404;
}

export async function readRecord(mode: VaultMode, id: string): Promise<VaultDocument | null> {
  if (mode === "demo") {
    try { return JSON.parse(await readFile(localMetadata(id), "utf8")) as VaultDocument; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  try {
    const result = await s3Client().send(new GetObjectCommand({ Bucket: bucket(), Key: metadataKey(id) }));
    if (!result.Body) throw new Error("Missing S3 record body.");
    return JSON.parse(await result.Body.transformToString()) as VaultDocument;
  } catch (error) { if (missing(error)) return null; throw error; }
}

export async function saveRecord(mode: VaultMode, record: VaultDocument): Promise<void> {
  const serialized = JSON.stringify(record, null, 2);
  if (mode === "demo") {
    const output = localMetadata(record.id);
    await mkdir(path.dirname(output), { recursive: true });
    const temporary = `${output}.${randomUUID()}.tmp`;
    await writeFile(temporary, serialized, { flag: "wx", mode: 0o600 });
    try { await rename(temporary, output); }
    catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    return;
  }
  await s3Client().send(new PutObjectCommand({
    Bucket: bucket(), Key: metadataKey(record.id), Body: serialized, ContentType: "application/json",
    ServerSideEncryption: "AES256", CacheControl: "no-store",
  }));
}

export async function listRecords(mode: VaultMode): Promise<VaultDocument[]> {
  if (mode === "demo") {
    let filenames: string[];
    try { filenames = await readdir(path.join(root, "records")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const records = await Promise.all(filenames.filter(name => /^[0-9a-f-]{36}\.json$/i.test(name)).slice(0, 250).map(name => readRecord(mode, name.slice(0, -5))));
    return records.filter((record): record is VaultDocument => record !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  // POC: list metadata sidecars. For large client deployments replace with a queryable DB.
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await s3Client().send(new ListObjectsV2Command({
      Bucket: bucket(), Prefix: `${s3Root()}records/`, MaxKeys: 200, ContinuationToken: continuationToken,
    }));
    keys.push(...(response.Contents || []).flatMap(item => item.Key?.endsWith(".json") ? [item.Key] : []));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken && keys.length < 250);
  const recordIds = keys.slice(0, 250).map(key => key.split("/").at(-1)!.replace(/\.json$/, ""));
  const records: VaultDocument[] = [];
  for (let index = 0; index < recordIds.length; index += 12) {
    const page = await Promise.all(recordIds.slice(index, index + 12).map(id => readRecord(mode, id)));
    records.push(...page.filter((record): record is VaultDocument => record !== null));
  }
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveObject(mode: VaultMode, documentId: string, revisionId: string, bytes: Buffer, contentType: string): Promise<string> {
  if (mode === "demo") {
    const output = localObject(documentId, revisionId);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
    return `demo/${documentId}/${revisionId}`;
  }
  const key = objectKey(documentId, revisionId);
  await s3Client().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: bytes, ContentType: contentType,
    ServerSideEncryption: "AES256", CacheControl: "private, no-store",
  }));
  return key;
}

export async function removeObject(mode: VaultMode, key: string): Promise<void> {
  if (mode === "demo") {
    const match = /^demo\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i.exec(key);
    if (match) await unlink(localObject(match[1], match[2])).catch(() => {});
    return;
  }
  if (key.startsWith(`${s3Root()}objects/`)) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  }
}

export async function getDownload(mode: VaultMode, revision: DocumentRevision) {
  if (mode === "demo") {
    const match = /^demo\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i.exec(revision.storageKey);
    if (!match) throw new Error("Invalid local object key.");
    const contents = await readFile(localObject(match[1], match[2]));
    return { simulated: true, base64: contents.toString("base64"), name: revision.name, contentType: revision.contentType };
  }
  if (!revision.storageKey.startsWith(`${s3Root()}objects/`)) throw new Error("Invalid S3 object key.");
  // HeadObject verifies the current stored object exists before issuing the bearer link.
  await s3Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: revision.storageKey }));
  const disposition = `attachment; filename="${revision.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`;
  const url = await getSignedUrl(s3Client(), new GetObjectCommand({
    Bucket: bucket(), Key: revision.storageKey, ResponseContentDisposition: disposition,
  }), { expiresIn: 60 });
  return { simulated: false, url, expiresInSeconds: 60, name: revision.name };
}

// Protects read/modify/write within ONE Node process; not cross-instance locking.
const locks = new Map<string, Promise<void>>();
export async function withRecordLock<T>(id: string, handler: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(id, queued);
  await previous;
  try { return await handler(); }
  finally { release(); if (locks.get(id) === queued) locks.delete(id); }
}
