#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createCharacterRecord, updateCharacterRecord, validateCharacterRecord, isSafeCharacterRecordId, canonicalJson } from '../prototype/src/character-record.js';

function error(code, message) { const e = new Error(message); e.code = code; throw e; }
function rootPath(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) error('root-required', 'An explicit absolute store root is required');
  return path.resolve(root);
}
function safeFile(root, id) {
  if (!isSafeCharacterRecordId(id)) error('invalid-id', 'Invalid record id');
  return path.join(root, `${id}.json`);
}
const text = value => JSON.stringify(value, null, 2) + '\n';
const bytes = value => Buffer.from(text(value), 'utf8');

const LOCK_TIMEOUT_MS = 30_000;
const LOCK_HEARTBEAT_MS = 15_000;

function lockWait(value) {
  if (value === undefined) return LOCK_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 300_000) error('invalid-lock-wait', 'lockWaitMs must be an integer from 1 to 300000');
  return value;
}

async function acquireStoreLock(file, options = {}) {
  const lockFile = `${file}.lock`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const token = JSON.stringify({ pid: process.pid, host: os.hostname(), createdAt: new Date().toISOString() });
  const started = Date.now();
  const waitMs = lockWait(options.lockWaitMs);
  while (true) {
    try {
      const handle = await fs.open(lockFile, 'wx');
      try { await handle.writeFile(token, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      const heartbeat = setInterval(async () => {
        try {
          if ((await fs.readFile(lockFile, 'utf8')) === token) {
            const now = new Date();
            await fs.utimes(lockFile, now, now);
          }
        } catch { /* owner is releasing or a stale lock was reclaimed */ }
      }, LOCK_HEARTBEAT_MS);
      heartbeat.unref?.();
      return {
        async release() {
          clearInterval(heartbeat);
          try {
            if ((await fs.readFile(lockFile, 'utf8')) === token) await fs.rm(lockFile, { force: true });
          } catch (e) { if (e.code !== 'ENOENT') throw e; }
        },
      };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        await fs.stat(lockFile);
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }
      if (Date.now() - started >= waitMs) error('store-busy', 'Timed out waiting for record lock; maintenance verification is required before lock removal');
      await delay(20);
    }
  }
}

async function withStoreLock(file, operation, options = {}) {
  const lock = await acquireStoreLock(file, options);
  try { return await operation(); } finally { await lock.release(); }
}

export async function readCharacterRecord(root, id) {
  const file = safeFile(rootPath(root), id);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') error('record-not-found', `Record not found: ${id}`); throw e; }
}

export async function listCharacterRecords(root) {
  const directory = rootPath(root);
  const names = await fs.readdir(directory, { withFileTypes: true }).catch(e => e.code === 'ENOENT' ? [] : Promise.reject(e));
  return names.filter(x => x.isFile() && x.name.endsWith('.json'))
    .map(x => x.name.slice(0, -5)).filter(isSafeCharacterRecordId).sort();
}

async function atomicWrite(file, content, { allowExisting }) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const old = await fs.readFile(file);
    if (old.equals(content)) return { changed: false };
    if (!allowExisting) error('record-exists', 'A different record already exists');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    const handle = await fs.open(temp, 'wx');
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, file);
    return { changed: true };
  } finally { await fs.rm(temp, { force: true }); }
}

export async function createStoredCharacterRecord(root, input, { validateResources, lockWaitMs } = {}) {
  const record = await createCharacterRecord(input, { validateResources });
  const file = safeFile(rootPath(root), record.identity.id);
  return withStoreLock(file, async () => {
    const result = await atomicWrite(file, bytes(record), { allowExisting: false });
    return { record, file, ...result };
  }, { lockWaitMs });
}

export async function updateStoredCharacterRecord(root, id, patch, { expectedRevision, validateResources, now, lockWaitMs } = {}) {
  const directory = rootPath(root), file = safeFile(directory, id);
  return withStoreLock(file, async () => {
    const previous = await readCharacterRecord(directory, id);
    if (previous.identity.id !== id) error('identity-mismatch', 'Record filename and identity.id differ');
    const record = await updateCharacterRecord(previous, patch, { expectedRevision, now }, { validateResources });
    const result = await atomicWrite(file, bytes(record), { allowExisting: true });
    return { record, file, ...result };
  }, { lockWaitMs });
}

export async function validateStoredCharacterRecord(root, id, { validateResources } = {}) {
  const record = await readCharacterRecord(root, id);
  const validation = await validateCharacterRecord(record, { validationCallback: validateResources });
  return { record, validation };
}

// Persist an actual runtime-exported envelope unchanged. A supplied revision is
// required to replace an existing different record; repeat imports are idempotent.
export async function putCharacterRecord(root, input, {expectedRevision,validateResources,lockWaitMs}={}) {
  const record=structuredClone(input);
  await validateCharacterRecord(record,{validationCallback:validateResources});
  const file=safeFile(rootPath(root),record.identity.id);
  return withStoreLock(file,async()=>{
    let previous;
    try{previous=await readCharacterRecord(root,record.identity.id);}catch(e){if(e.code!=='record-not-found')throw e;}
    if(previous){
      await validateCharacterRecord(previous,{validationCallback:validateResources});
      if(previous.integrity.recordSha256===record.integrity.recordSha256)return{record,file,changed:false};
      if(previous.revision!==expectedRevision||record.revision!==previous.revision+1)error('revision-conflict','Replacement requires the current revision and its immediate successor');
      if(canonicalJson(previous.identity)!==canonicalJson(record.identity)||previous.createdAt!==record.createdAt)error('identity-mismatch','Replacement cannot change stable identity or creation time');
      if(Date.parse(record.updatedAt)<Date.parse(previous.updatedAt))error('invalid-timestamp-order','Replacement cannot move update time backwards');
    }else if(expectedRevision!==undefined||record.revision!==1)error('revision-conflict','A new record must start at revision 1');
    const result=await atomicWrite(file,Buffer.from(JSON.stringify(record)+'\n','utf8'),{allowExisting:Boolean(previous)});
    return{record,file,...result};
  },{lockWaitMs});
}

function pendingValidation() { return { status: 'pending', reason: 'runtime resource admission must be supplied by the integrating caller' }; }
function usage() { console.error('Usage: node scripts/character-record-store.mjs <list|validate> --root ABSOLUTE [--id ID]'); }
const args = process.argv.slice(2), command = args[0], rootIndex = args.indexOf('--root'), idIndex = args.indexOf('--id');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!command || rootIndex < 0) { usage(); process.exitCode = 2; }
    else if (command === 'list') console.log(JSON.stringify(await listCharacterRecords(args[rootIndex + 1])));
    else if (command === 'validate' && idIndex >= 0) console.log(JSON.stringify(await validateStoredCharacterRecord(args[rootIndex + 1], args[idIndex + 1], { validateResources: pendingValidation }), null, 2));
    else { usage(); process.exitCode = 2; }
  } catch (e) { console.error(JSON.stringify({ code: e.code ?? 'error', message: e.message })); process.exitCode = 1; }
}
