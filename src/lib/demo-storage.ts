import { randomUUID } from "node:crypto";

export interface StoredFile {
  key: string;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

interface DemoEntry extends StoredFile { bytes: Buffer }

// Demo-only in-memory storage. Restarting the Node process clears these files.
const storage = new Map<string, DemoEntry>();
const MAX_FILES = 20;

export function addDemoFile(name: string, contentType: string, bytes: Buffer): StoredFile {
  if (storage.size >= MAX_FILES) {
    const oldest = storage.keys().next().value;
    if (oldest) storage.delete(oldest);
  }
  const key = `demo/${randomUUID()}`;
  const entry: DemoEntry = { key, name, contentType, size: bytes.byteLength, uploadedAt: new Date().toISOString(), bytes };
  storage.set(key, entry);
  return { key, name, size: entry.size, contentType, uploadedAt: entry.uploadedAt };
}

export function listDemoFiles(): StoredFile[] {
  return [...storage.values()].map(({ bytes: _bytes, ...metadata }) => metadata).reverse();
}

export function getDemoFile(key: string): DemoEntry | undefined {
  return storage.get(key);
}
