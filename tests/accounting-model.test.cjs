// Run after npm install: node --test tests/accounting-model.test.cjs
// Uses the project's TypeScript compiler so Node 20+ can execute the pure validation module.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/accounting/model.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.deepEqual((output.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const exportsObject = {};
vm.runInNewContext(output.outputText, { exports: exportsObject, require, Buffer, TextDecoder, console, Uint8Array, String }, { filename: 'model.cjs' });
const model = exportsObject;

test('accounting records parse valid financial-year metadata', () => {
  assert.equal(model.parseDocumentFields({ client: 'Atlas Traders', financialYear: '2025-26', category: 'GST', source: 'manual' }).assignedTo, 'Unassigned');
});
test('reject malformed financial years and categories', () => {
  assert.throws(() => model.parseDocumentFields({ client: 'Test', financialYear: '2025-28', category: 'ITR', source: 'manual' }));
  assert.throws(() => model.parseDocumentFields({ client: 'Test', financialYear: '2025-26', category: 'Other??', source: 'manual' }));
});
test('reject invalid or tampered file signatures', () => {
  assert.throws(() => model.validateDocumentBytes('fake.pdf', 'application/pdf', Buffer.from('not a PDF')));
  assert.throws(() => model.validateDocumentBytes('evil.exe', 'application/octet-stream', Buffer.from('x')));
  const pdf = model.validateDocumentBytes('form 16.pdf', 'application/pdf', Buffer.from('%PDF-1.4\nExample'));
  assert.equal(pdf.contentType, 'application/pdf');
});
test('sanitize filenames and restrict unsafe extensions', () => {
  assert.equal(model.safeFilename('../statement.pdf'), 'statement.pdf');
  assert.equal(model.safeFilename('..\\bank.xlsx'), 'bank.xlsx');
});
test('review transitions prevent invalid moves', () => {
  assert.equal(model.canTransition('submitted', 'in_review'), true);
  assert.equal(model.canTransition('submitted', 'approved'), false);
  assert.equal(model.canTransition('archived', 'submitted'), true);
});
test('only well-formed UUID document IDs are allowed', () => {
  assert.equal(model.isDocumentId('3b220d3d-6625-4ef8-b17f-1d54a24ae27b'), true);
  assert.equal(model.isDocumentId('../../hello'), false);
});
