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
module.exports={outputPaths};

if(require.main===module)(async()=>{
 const {values}=parseArgs({options:{dist:{type:'string'},request:{type:'string'},out:{type:'string'},evidence:{type:'string'}},strict:true,allowPositionals:false});
 for(const name of ['dist','request','out'])if(!values[name])throw Error('Required --'+name);
 const dist=path.resolve(values.dist),request=path.resolve(values.request);
 const {out,evidence}=await outputPaths(values.out,values.evidence);
 const build=JSON.parse(await fs.readFile(path.join(dist,'build-info.json'),'utf8'));
 if(!/^[a-f0-9]{64}$/.test(build.sourceDigest)||build.shortId!==build.sourceDigest.slice(0,12))throw Error('Invalid fixed build identity');
 const input=await fs.stat(request);if(!input.isFile()||input.size>1024*1024)throw Error('Production request must be a JSON file up to 1 MiB');
 if(await fs.stat(out).catch(e=>{if(e.code==='ENOENT')return null;throw e;}))throw Error('Output already exists');
 const child=spawn(process.execPath,[path.join(__dirname,'run-fixed-check.cjs'),dist,path.join(__dirname,'character-production-browser.cjs'),request,out,build.sourceDigest,evidence],{stdio:['ignore','pipe','inherit']});
 createInterface({input:child.stdout}).on('line',line=>{if(line.startsWith('Temporary fixed-build check:'))process.stderr.write(line+'\n');else process.stdout.write(line+'\n');});
 child.once('error',e=>{console.error(JSON.stringify({ok:false,code:'browser-launch',reason:e.message}));process.exitCode=1;});
 child.once('exit',code=>{process.exitCode=code??1;});
})().catch(e=>{console.error(JSON.stringify({ok:false,code:e.code??'production-cli',reason:e.message}));process.exitCode=1;});
