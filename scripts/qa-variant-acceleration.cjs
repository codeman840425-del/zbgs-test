// Narrow data adapter over the unchanged 120Hz room/gate implementation.
// Each specimen and outfit is tested separately; no inherited female identity.
const fs=require('node:fs'),crypto=require('node:crypto'),Module=require('node:module');
const template=require.resolve('./qa-female-acceleration-room.cjs');
let source=fs.readFileSync(template,'utf8');
const specs=[['m1a-jaw-v1','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'],['m1a-waisthip-v1','10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5']];
const cases=specs.flatMap(([body,sha256])=>[['base','base',0],['pants','dressed',0],['skirt','dressed',1]].map(([name,mode,outfit])=>({name:body+'-'+name,body,assetId:body,sha256,mode,outfit})));
function replaceOnce(old,value){if(source.split(old).length!==2)throw Error('QA template changed: '+old.slice(0,60));source=source.replace(old,value);}
const first=source.match(/^const ORIGINAL_CASES=.*;$/m)?.[0];if(!first)throw Error('QA cases declaration not found');
replaceOnce(first,'const ORIGINAL_CASES='+JSON.stringify(cases)+';');
replaceOnce("const CASES=ORIGINAL_CASES.filter(c=>c.name==='female-base');","const CASES=ORIGINAL_CASES;");
replaceOnce("assetId:config.body==='male'?'beta-base-male-m1b':'beta-base-female-m1',sha256:config.body==='male'?'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'","assetId:config.assetId,sha256:config.sha256");
replaceOnce("'female-acceleration-phase-'+Date.now()","'variant-acceleration-phase-'+Date.now()");
replaceOnce('phases:[.05,.30,.55,.80]',"phases:(process.argv.find(x=>x.startsWith('--phases='))?.slice(9)||'.05,.76,.79').split(',').map(Number)");
replaceOnce("scriptSha256:crypto.createHash('sha256').update(await fs.readFile(__filename)).digest('hex')","scriptSha256:global.__variantAccelerationCompositeSHA,templateSha256:global.__variantAccelerationTemplateSHA");
global.__variantAccelerationTemplateSHA=crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex');
global.__variantAccelerationCompositeSHA=crypto.createHash('sha256').update(source).digest('hex');
if(!process.argv.some(s=>s.startsWith('--phases=')))process.argv.push('--phases=.05,.76,.79');
const moduleCopy=new Module(__filename,module);moduleCopy.filename=__filename;moduleCopy.paths=module.paths;moduleCopy._compile(source,__filename);
