const {serve}=require('./serve.cjs');
serve(process.argv[2],process.argv[3],{manifest:'company-build-info.json',entry:'company.html'}).then(s=>{
 console.log(JSON.stringify({url:s.url,build:s.info.shortId}));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>s.close().then(()=>process.exit(0)));
}).catch(e=>{console.error(e);process.exitCode=1;});
