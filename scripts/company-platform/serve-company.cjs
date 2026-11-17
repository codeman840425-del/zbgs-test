const {serve}=require('./serve.cjs');
// One public company preview. QA imports serve.cjs directly and closes its temporary port.
const port=process.argv[4]===undefined?60880:Number(process.argv[4]);
serve(process.argv[2],process.argv[3],{manifest:'company-build-info.json',entry:'company.html',port}).then(s=>{
 console.log(JSON.stringify({url:s.url,build:s.info.shortId}));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>s.close().then(()=>process.exit(0)));
}).catch(e=>{console.error(e);process.exitCode=1;});
