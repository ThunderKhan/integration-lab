const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

const db = new Map();
const calls = [];
class PutObjectCommand { constructor(input) { this.kind = 'put'; this.input = input; } }
class GetObjectCommand { constructor(input) { this.kind = 'get'; this.input = input; } }
class ListObjectsV2Command { constructor(input) { this.kind = 'list'; this.input = input; } }
class HeadObjectCommand { constructor(input) { this.kind = 'head'; this.input = input; } }
class DeleteObjectCommand { constructor(input) { this.kind = 'delete'; this.input = input; } }
const s3 = { async send(command) {
  calls.push(command);
  const { Key } = command.input;
  if (command.kind === 'put') { db.set(Key, { body: Buffer.from(command.input.Body) }); return {}; }
  if (command.kind === 'get') {
    const item = db.get(Key);
    if (!item) throw Object.assign(Error('Not found'), { name: 'NoSuchKey' });
    return { Body: { transformToString: async () => item.body.toString() } };
  }
  if (command.kind === 'head') { if (!db.has(Key)) throw Object.assign(Error('Missing'), { name: 'NotFound' }); return {}; }
  if (command.kind === 'delete') { db.delete(Key); return {}; }
  if (command.kind === 'list') return { Contents: [...db.keys()].filter(k => k.startsWith(command.input.Prefix)).map(Key => ({ Key })), IsTruncated: false };
  throw Error('Unexpected command');
} };
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/accounting/store.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, reportDiagnostics: true });
assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const exportsObject = {};
const fakeRequire = name => {
  if (name.startsWith('node:')) return require(name);
  if (name === '@/lib/s3') return { bucket: () => 'company-test-bucket', prefix: () => 'integration-lab/', s3Client: () => s3 };
  if (name === '@aws-sdk/client-s3') return { PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand };
  if (name === '@aws-sdk/s3-request-presigner') return { getSignedUrl: async (_client, command, opts) => `https://signed.example.test/${encodeURIComponent(command.input.Key)}?ttl=${opts.expiresIn}` };
  throw Error(`Unexpected dependency: ${name}`);
};
vm.runInNewContext(compiled.outputText, { exports: exportsObject, require: fakeRequire, process, Buffer, console, Map, Promise }, { filename: 'store.cjs' });

test('S3 SDK adapter uploads encrypted bytes, lists metadata, signs reads, and cleans up', async () => {
  const id = randomUUID(); const revisionId = randomUUID();
  const key = await exportsObject.saveObject('live', id, revisionId, Buffer.from('%PDF-1.4\nsynthetic'), 'application/pdf');
  assert.equal(key, `integration-lab/accounting-vault/objects/${id}/${revisionId}`);
  assert.equal(calls[0].input.ServerSideEncryption, 'AES256');
  assert.equal(calls[0].input.Bucket, 'company-test-bucket');
  const now = new Date().toISOString();
  const record = { id, client: 'Synthetic Firm', financialYear: '2025-26', category: 'ITR', source: 'manual', status: 'submitted', assignedTo: 'Lab', uploadedAt: now, updatedAt: now, revisions: [{ id: revisionId, storageKey: key, name: 'form-16.pdf', contentType: 'application/pdf', size: 18, uploadedAt: now }], events: [] };
  await exportsObject.saveRecord('live', record);
  assert.equal((await exportsObject.readRecord('live', id)).client, 'Synthetic Firm');
  assert.equal((await exportsObject.listRecords('live')).length, 1);
  const result = await exportsObject.getDownload('live', record.revisions[0]);
  assert.equal(result.expiresInSeconds, 60);
  assert.match(result.url, /ttl=60/);
  assert.ok(calls.some(command => command.kind === 'head'));
  assert.ok(calls.some(command => command.kind === 'list'));
  assert.ok([...db.keys()].every(key => !key.includes('Synthetic Firm') && !key.includes('form-16.pdf')));
  await exportsObject.removeObject('live', key);
  assert.equal(db.has(key), false);
});
