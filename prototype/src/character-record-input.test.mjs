import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCharacterRecordInput} from './character-record-input.js';
const entry={id:'actor-01',url:'/records/actor-01.json',recordSha256:'a'.repeat(64)};
test('explicit external manifest admits one to four stable records',()=>{
  assert.equal(validateCharacterRecordInput({schema:'character-record-input-v1',entries:[entry]},'/records/manifest.json')[0],entry);
});
test('external manifest rejects duplicates, remote paths and fallback shapes',()=>{
  for(const entries of [[],[entry,entry],[{...entry,url:'https://example.com/a.json'}],[{...entry,id:'../a'}],[{...entry,recordSha256:'x'}]])
    assert.throws(()=>validateCharacterRecordInput({schema:'character-record-input-v1',entries},'/records/manifest.json'));
  assert.throws(()=>validateCharacterRecordInput({entries:[entry]},'/records/manifest.json'));
  assert.throws(()=>validateCharacterRecordInput({schema:'character-record-input-v1',entries:[entry]},'/assets/other.json'));
});
