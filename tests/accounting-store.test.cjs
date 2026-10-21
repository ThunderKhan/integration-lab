const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-vault-test-'));
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/accounting/store.ts'), 'utf8');
const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, reportDiagnostics: true });
assert.deepEqual((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const exportsObject = {};
const fakeRequire = name => {
  if (name.startsWith('node:')) return require(name);
  if (name === '@/lib/s3') return { bucket: () => 'unused', prefix: () => 'integration-lab/', s3Client: () => { throw Error('Must not contact AWS in demo mode'); } };
  if (name === '@aws-sdk/client-s3') return { DeleteObjectCommand: class {}, GetObjectCommand: class {}, HeadObjectCommand: class {}, ListObjectsV2Command: class {}, PutObjectCommand: class {} };
  if (name === '@aws-sdk/s3-request-presigner') return { getSignedUrl: () => { throw Error('Must not sign AWS URLs in demo mode'); } };
  throw Error(`Unexpected dependency: ${name}`);
};
vm.runInNewContext(result.outputText, { exports: exportsObject, require: fakeRequire, process: { cwd: () => temp }, Buffer, console, Map, Promise }, { filename: 'store.cjs' });

test('demo objects and metadata persist to disk and download after reads', async () => {
  const id = randomUUID();
  const revision = randomUUID();
  const bytes = Buffer.from('%PDF-1.4\nfictional');
  const key = await exportsObject.saveObject('demo', id, revision, bytes, 'application/pdf');
  const record = { id, client: 'Atlas Traders', financialYear: '2025-26', category: 'ITR', status: 'submitted', assignedTo: 'Unassigned', source: 'manual', uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisions: [{ id: revision, storageKey: key, name: 'sample.pdf', contentType: 'application/pdf', size: bytes.length, uploadedAt: new Date().toISOString() }], events: [] };
  await exportsObject.saveRecord('demo', record);
  const loaded = await exportsObject.readRecord('demo', id);
  assert.equal(loaded.client, 'Atlas Traders');
  const list = await exportsObject.listRecords('demo');
  assert.equal(list.length, 1);
  const download = await exportsObject.getDownload('demo', record.revisions[0]);
  assert.equal(Buffer.from(download.base64, 'base64').toString(), bytes.toString());
  await exportsObject.removeObject('demo', key);
  await assert.rejects(() => exportsObject.getDownload('demo', record.revisions[0]));
});

test.after(async () => { await fsPromises.rm(temp, { recursive: true, force: true }); });
