// A short-lived local HTTP/browser job; never opens or takes over the desktop.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {parseArgs}=require('node:util');
const {createInterface}=require('node:readline');

async function destination(value){
 const absolute=path.resolve(value);
 if(process.platform==='win32'){
  const parts=absolute.slice(path.parse(absolute).root.length).split(path.sep);
  if(absolute.startsWith('\\\\?\\')||absolute.startsWith('\\\\.\\')||
     parts.some(part=>/[.: ]$/.test(part)||part.includes(':')||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
   throw Error('Unsupported Windows output path');
 }
 try{return await fs.realpath(absolute);}
 catch(error){
  if(error.code!=='ENOENT')throw error;
  const parent=path.dirname(absolute);
  if(parent===absolute)throw error;
  return path.join(await destination(parent),path.basename(absolute));
 }
}

async function outputPaths(output,evidence){
 const out=await destination(output);
 const dir=evidence?await destination(evidence):'';
 if(dir){
  const relative=path.relative(dir,out);
  if(relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)))
   throw Object.assign(Error('Production output must be outside its evidence directory'),{code:'output-evidence-conflict'});
 }
 return{out,evidence:dir};
}
const BATCH_SCHEMA='character-production-batch-edit-v1';
const BATCH_CREATE_SCHEMA='character-production-batch-create-v1';
const SINGLE_BYTES=1024*1024;
const MAX_BYTES=SINGLE_BYTES+4*512*1024;

function parseRequest(bytes){
 if(bytes.length>MAX_BYTES)throw Error('Production request too large');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(value?.schema!==BATCH_SCHEMA&&value?.schema!==BATCH_CREATE_SCHEMA&&bytes.length>SINGLE_BYTES)throw Error('Single production request exceeds 1 MiB');
 return value;
}

function itemError(error,index,id){
 return Object.assign(error,{itemIndex:index,recordId:id});
}

async function batchEdits(input){
 const fail=message=>Object.assign(Error(message),{code:'invalid-batch-edit'});
 if(Object.keys(input).some(k=>!['schema','edits','records'].includes(k))||
    !Array.isArray(input.records)||input.records.length<1||input.records.length>4||
    !Array.isArray(input.edits)||input.edits.length<1||input.edits.length>32||
    !input.edits.every(edit=>edit&&typeof edit==='object'&&!Array.isArray(edit)&&typeof edit.domain==='string'))
   throw fail('Batch edit requires 1–4 source records and 1–32 shared edit operations');
 const {validateCharacterRecord}=await import('../prototype/src/character-record.js');
 const seen=new Set();
 for(const [index,record] of input.records.entries()){
  const id=record?.identity?.id;
  try{
   if(id==='manifest'||seen.has(id))throw fail('Duplicate or reserved game record identity');
   await validateCharacterRecord(record,{validationCallback:()=>({status:'pending'})});
   seen.add(id);
  }catch(error){throw itemError(error,index,id);}
 }
 return input.records.map(record=>({schema:'character-production-request-v1',operation:'edit',record,edits:input.edits}));
}

async function batchCreates(input){
 const fail=(message,field)=>Object.assign(Error(message),{code:'invalid-batch-create',field});
 if(input.schema!==BATCH_CREATE_SCHEMA||Object.keys(input).some(key=>!['schema','requests'].includes(key))||
    !Array.isArray(input.requests)||input.requests.length<1||input.requests.length>4)
  throw fail('Batch create requires 1–4 complete create requests','requests');
 const {isSafeCharacterRecordId}=await import('../prototype/src/character-record.js');
 const seen=new Set();
 for(const [index,job] of input.requests.entries()){
  const id=job?.identity?.id;
  try{
   if(job?.schema!=='character-production-request-v1'||job.operation!=='create'||
      Object.keys(job).some(key=>!['schema','operation','identity','bodyType','nativeHairCenter','edits'].includes(key)))
    throw fail('Expected a character-production-request-v1 create request','request');
   if(Buffer.byteLength(JSON.stringify(job))>SINGLE_BYTES)throw fail('Single production request exceeds 1 MiB','request');
   if(typeof job.bodyType!=='string'||!job.bodyType)throw fail('Create requires an explicit body','bodyType');
   if(!isSafeCharacterRecordId(id)||id==='manifest'||seen.has(id))
    throw fail('Invalid, duplicate or reserved game record identity','identity.id');
   if(Object.keys(job.identity).some(key=>!['id','gender','name'].includes(key)))throw fail('Unsupported identity field','identity');
   for(const [key,max] of [['name',160],['gender',40]]){
    const value=job.identity[key];
    if(typeof value!=='string'||!value.length||value.length>max)throw fail('Invalid identity '+key,'identity.'+key);
   }
   if(job.edits!==undefined&&(!Array.isArray(job.edits)||job.edits.length>32))throw fail('Invalid create edits','edits');
   seen.add(id);
  }catch(error){throw itemError(error,index,id);}
 }
 return input.requests;
}
module.exports={outputPaths,parseRequest,batchEdits,batchCreates,itemError,BATCH_SCHEMA,BATCH_CREATE_SCHEMA};

if(require.main===module)(async()=>{
 const {values}=parseArgs({options:{dist:{type:'string'},request:{type:'string'},out:{type:'string'},evidence:{type:'string'}},strict:true,allowPositionals:false});
 for(const name of ['dist','request','out'])if(!values[name])throw Error('Required --'+name);
 const dist=path.resolve(values.dist),request=path.resolve(values.request);
 const {out,evidence}=await outputPaths(values.out,values.evidence);
 const build=JSON.parse(await fs.readFile(path.join(dist,'build-info.json'),'utf8'));
 if(!/^[a-f0-9]{64}$/.test(build.sourceDigest)||build.shortId!==build.sourceDigest.slice(0,12))throw Error('Invalid fixed build identity');
 const input=await fs.stat(request);if(!input.isFile()||input.size>MAX_BYTES)throw Error('Production request too large or not a file');
 if(await fs.stat(out).catch(e=>{if(e.code==='ENOENT')return null;throw e;}))throw Error('Output already exists');
 const child=spawn(process.execPath,[path.join(__dirname,'run-fixed-check.cjs'),dist,path.join(__dirname,'character-production-browser.cjs'),request,out,build.sourceDigest,evidence],{stdio:['ignore','pipe','inherit']});
 createInterface({input:child.stdout}).on('line',line=>{if(line.startsWith('Temporary fixed-build check:'))process.stderr.write(line+'\n');else process.stdout.write(line+'\n');});
 child.once('error',e=>{console.error(JSON.stringify({ok:false,code:'browser-launch',reason:e.message}));process.exitCode=1;});
 child.once('exit',code=>{process.exitCode=code??1;});
})().catch(e=>{console.error(JSON.stringify({ok:false,code:e.code??'production-cli',reason:e.message}));process.exitCode=1;});
