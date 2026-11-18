import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {publishStagedDirectory} from './files.mjs';

// Keep a real NTFS directory handle without FILE_SHARE_DELETE until stdin closes.
const lockDirectory = `import ctypes,sys
from ctypes import wintypes
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,wintypes.LPVOID,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
k.CreateFileW.restype=wintypes.HANDLE
h=k.CreateFileW(sys.argv[1],0x80000000,3,None,3,0x02000000,None)
if h==wintypes.HANDLE(-1).value: raise ctypes.WinError(ctypes.get_last_error())
print('locked',flush=True)
sys.stdin.buffer.read()
k.CloseHandle.argtypes=[wintypes.HANDLE]
k.CloseHandle(h)`;

for(const competing of [false,true]){
  test('Windows package stage waits for sharing lock and '+(competing?'preserves a competing output':'publishes identical bytes'),
    {skip:process.platform!=='win32',timeout:10000},async t=>{
      const root=fileURLToPath(new URL('../../experiments/',import.meta.url));
      const work=await mkdtemp(path.join(root,'publish-lock-test-'));
      const stage=path.join(work,'stage'),dest=path.join(work,'out');
      await mkdir(stage);await writeFile(path.join(stage,'payload'),'verified');
      const child=spawn('python',['-B','-c',lockDirectory,stage],{windowsHide:true,stdio:['pipe','pipe','inherit']});
      const closed=once(child,'close');
      t.after(async()=>{child.stdin.end();await closed;await rm(work,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
      const reply=await Promise.race([once(child.stdout,'data'),closed.then(()=>{throw Error('Missing NTFS handle');})]);
      assert.equal(String(reply[0]).trim(),'locked');
      await assert.rejects(rename(stage,dest),e=>['EPERM','EACCES','EBUSY'].includes(e.code));
      const result=publishStagedDirectory(stage,dest);
      const check=competing?assert.rejects(result,{code:'output-conflict'}):result;
      await new Promise(resolve=>setTimeout(resolve,50));
      if(competing){
        await mkdir(dest);await writeFile(path.join(dest,'payload'),'other');
      }
      child.stdin.end();
      await check;
      assert.equal(await readFile(path.join(dest,'payload'),'utf8'),competing?'other':'verified');
      if(competing)assert.equal(await readFile(path.join(stage,'payload'),'utf8'),'verified');
    });
}
