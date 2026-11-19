const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
    const base=process.argv[2];
    async function bytes(url) {
        const response=await fetch(new URL(url,base));
        assert.equal(response.status,200,url);
        return Buffer.from(await response.arrayBuffer());
    }
    const build=JSON.parse(await bytes('/build-info.json'));
    const catalog=JSON.parse(await bytes('/records/rule-body-data.json'));
    assert.equal(build.shortId,'9ce414f65f55');
    assert.equal(catalog.schema,'published-rule-body-packs-v1');
    assert.equal(catalog.ruleBodyDataPacks.length,2);
    const bodies=[];
    const shared=new Map();
    for(const descriptor of catalog.ruleBodyDataPacks){
        const raw=await bytes(descriptor.url);
        assert.equal(sha256(raw),descriptor.sha256);
        assert.equal(raw.length,descriptor.bytes);
        const index=JSON.parse(raw);
        assert.equal(index.bodyType,descriptor.bodyType);
        for(const file of index.files){
            const key=file.path.startsWith('assets/')?'/'+file.path:new URL(file.path,new URL(descriptor.url,base)).pathname;
            const content=await bytes(key);
            assert.equal(sha256(content),file.sha256);
            assert.equal(content.length,file.bytes);
            if(key.endsWith('.glb'))shared.set(key,file.sha256);
        }
        bodies.push(descriptor.bodyType);
    }
    assert.equal(shared.size,3);
    assert.match((await bytes('/record-consumer.html?production=1&ruleBodyData=1')).toString('utf8'),/<html/i);
    console.log(JSON.stringify({build:build.shortId,bodies,sharedGarments:shared.size,recordsManifest:await fetch(base+'records/manifest.json').then(r=>r.status)}));
})().catch(error=>{console.error(error);process.exitCode=1;});
