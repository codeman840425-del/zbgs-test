"""Archive fixed-product short results separately from diagnostic pictures."""
import pathlib,json,hashlib,gzip,shutil,sys
root=pathlib.Path(__file__).resolve().parents[2]
build=sys.argv[1] if len(sys.argv)>1 else '0df63cf2bdea'
out=root/'evidence'/('grip-'+build);out.mkdir(parents=True,exist_ok=True)
report=root/'output/playwright/m1c-grip-product'/build/'report.json'
shutil.copyfile(report,out/'product-report.json')
fixed=root/'experiments'/('m1-'+build)/'dist'
for name in ['manifest.json','female-source-grip-v1.json','male-source-grip-v1.json']:
    target=out/'fixed-profiles'/name;target.parent.mkdir(exist_ok=True);shutil.copyfile(fixed/'assets/m1c/grips'/name,target)
diag=root/'output/playwright/m1c-grip/ca72ada827d2-source-pose-thumb-height'
target=out/'ca72-diagnostic';target.mkdir(exist_ok=True)
for body in ['female','male']:
    for pose in ['baseline','source-fit']:
        for view in ['front','side']:
            name=f'{body}-stand-{pose}-{view}.png';shutil.copyfile(diag/name,target/name)
(target/'report.json.gz').write_bytes(gzip.compress((diag/'report.json').read_bytes(),mtime=0))
manifest={'productBuild':build,'productSourceDigest':json.loads((fixed/'build-info.json').read_text(encoding='utf8'))['sourceDigest'],
          'productResult':'Eight short contract checks passed; actual runtime with no diagnostic override.',
          'diagnosticPictures':'ca72 fixed build with temporary source-pose overrides; not pictures of the product build.',
          'limits':['Representative 0.5s stand/sit/walk samples; full live movie reviewed separately.','Cylinder vertex probe is not skin triangle CCD.','No inherited fit for unlisted avatar identities.'],
          'files':[],'sourceScripts':[]}
for file in sorted(out.rglob('*')):
    if file.is_file() and file!=out/'manifest.json':manifest['files'].append({'file':file.relative_to(out).as_posix(),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
for name in ['fit-source-grip.py','publish-grip-profiles.py','qa-grip-profile.cjs','qa-grip-candidates.cjs','requirements-grip.txt']:
    file=root/'scripts/m1c'/name;manifest['sourceScripts'].append({'file':file.relative_to(root).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
print(out,len(manifest['files']),'evidence files')
