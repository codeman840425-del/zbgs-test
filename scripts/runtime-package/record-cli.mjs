import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecordInventory,exportRecordInventory} from './record-inventory.mjs';
import {digest,jsonBytes,writeFresh} from './files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
async function main(){
 const [command,...args]=process.argv.slice(2),opts={};
 for(let i=0;i<args.length;i+=2){if(!['--record','--inventory','--dist','--source-root','--out'].includes(args[i])||!args[i+1]||Object.hasOwn(opts,args[i]))throw Error('Invalid option '+args[i]);opts[args[i]]=args[i+1];}
 if(!['inventory','export'].includes(command)||!opts['--dist']||!opts['--out']||!opts[command==='inventory'?'--record':'--inventory'])throw Error('Usage: record-cli.mjs inventory --record RECORD --dist FIXED_DIST --out INVENTORY | export --inventory INVENTORY --dist FIXED_DIST --out NEW_PACKAGE [--source-root CHECKOUT]');
 const common={dist:path.resolve(opts['--dist']),sourceRoot:path.resolve(opts['--source-root']||root)};
 if(command==='inventory'){
  const record=JSON.parse(await readFile(opts['--record'],'utf8')),inventory=await createRecordInventory({...common,record});
  const bytes=jsonBytes(inventory);await writeFresh(path.resolve(opts['--out']),bytes);console.log(JSON.stringify({ok:true,files:inventory.files.length,inventorySha256:digest(bytes),runtime:inventory.runtime}));
 }else console.log(JSON.stringify({ok:true,...await exportRecordInventory({...common,inventory:JSON.parse(await readFile(opts['--inventory'],'utf8')),out:path.resolve(opts['--out'])})}));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:error.code||'record-package-failed',reason:error.message}));process.exitCode=1;});
