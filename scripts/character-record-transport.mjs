#!/usr/bin/env node
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CHARACTER_RECORD_MAX_BYTES } from '../prototype/src/character-record.js';
import { putCharacterRecord, validateStoredCharacterRecord } from './character-record-store.mjs';
import { fail, writeFresh } from './runtime-package/files.mjs';

const usage = 'import --root ABS --input FILE [--expected-revision N] | read --root ABS --id ID | export --root ABS --id ID --out NEW_FILE';
const validateResources = () => ({ status: 'pending' });

async function readInput(file) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail('invalid-input', 'Input must be a regular record file');
    if (info.size > CHARACTER_RECORD_MAX_BYTES) fail('record-too-large', 'Input exceeds 512 KiB');
    const bytes = await handle.readFile();
    if (bytes.length > CHARACTER_RECORD_MAX_BYTES) fail('record-too-large', 'Input exceeds 512 KiB');
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      fail('invalid-json', 'Expected a UTF-8 JSON record: ' + error.message);
    }
  } finally {
    await handle.close();
  }
}

function receipt(command, record) {
  return { ok: true, command, id: record.identity.id, revision: record.revision,
    recordSha256: record.integrity.recordSha256, resourceValidation: 'pending' };
}

async function main([command, ...args]) {
  const names = {
    import: ['root', 'input', 'expected-revision'],
    read: ['root', 'id'],
    export: ['root', 'id', 'out'],
  };
  if (!Object.hasOwn(names, command)) fail('usage', usage);
  const options = Object.fromEntries(names[command].map(name => [name, { type: 'string' }]));
  const { values, tokens } = parseArgs({ args, options, tokens: true });
  if (tokens.length !== Object.keys(values).length) fail('usage', 'Duplicate option. ' + usage);
  if (names[command].some(name => name !== 'expected-revision' && !values[name])) fail('usage', usage);
  if (!path.isAbsolute(values.root)) fail('root-required', 'An explicit absolute store root is required');

  if (command === 'import') {
    const raw = values['expected-revision'];
    const expectedRevision = raw === undefined ? undefined : Number(raw);
    if (raw !== undefined && (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(expectedRevision))) {
      fail('invalid-revision', 'Expected revision must be a positive safe integer');
    }
    const input = await readInput(values.input);
    const { record, changed, file } = await putCharacterRecord(values.root, input, { expectedRevision, validateResources });
    return { ...receipt(command, record), file, changed };
  }

  const { record } = await validateStoredCharacterRecord(values.root, values.id, { validateResources });
  if (record.identity.id !== values.id) fail('identity-mismatch', 'Stored filename and record identity differ');
  if (command === 'read') return { ...receipt(command, record), record };

  const file = path.resolve(values.out);
  // Store entries must go through putCharacterRecord's lock and CAS, even if
  // an alternate spelling of the directory is supplied as the export path.
  const directory = await realpath(path.dirname(file)).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (directory && !path.relative(await realpath(values.root), directory)) {
    fail('store-output-conflict', 'Export to a separate directory outside the store entries');
  }
  await writeFresh(file, Buffer.from(JSON.stringify(record), 'utf8'));
  return { ...receipt(command, record), file };
}

try {
  console.log(JSON.stringify(await main(process.argv.slice(2))));
} catch (error) {
  const code = error.code ?? (error instanceof SyntaxError ? 'invalid-json' : 'transport-failed');
  console.error(JSON.stringify({ ok: false, code, message: error.message, field: error.field }));
  process.exitCode = 1;
}
