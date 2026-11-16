import subprocess,pathlib,hashlib,json,sys
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]);post='--post' in sys.argv
command=lambda *a:subprocess.check_output(['git','-C',str(root),*a])
rows=[]
for line in command('ls-tree','-r','HEAD','prototype').decode().splitlines():
 mode,kind,oid,name=line.split(maxsplit=3)
 if not (name.startswith(('prototype/src/','prototype/scripts/','prototype/public/assets/')) or name in ['prototype/public/favicon.svg','prototype/index.html','prototype/foundation.html','prototype/vite.config.js','prototype/package.json','prototype/package-lock.json']):continue
 b=(root/name).read_bytes();actual=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();rows.append({'path':name.removeprefix('prototype/'),'gitBlob':oid,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'matches':actual==oid})
report={'source':command('rev-parse','HEAD').decode().strip(),'rootAttributesExact':(root/'.gitattributes').read_bytes()==command('show','HEAD:.gitattributes'),'inputs':rows,'mismatches':[x for x in rows if not x['matches']]}
if post:
 info=json.loads((root/'dist/build-info.json').read_text(encoding='utf-8'));report['build']=info['shortId'];report['sourceDigest']=info['sourceDigest'];report['inputListExact']=sorted(info['inputs'])==sorted(x['path'] for x in rows)
 h=hashlib.sha256()
 for f in sorted(info['inputs']):h.update(f.encode()+b'\0'+(root/'prototype'/f).read_bytes()+b'\0')
 report['digestExact']=h.hexdigest()==info['sourceDigest'];report['distFiles']=[{'file':f.relative_to(root/'dist').as_posix(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size} for f in sorted((root/'dist').rglob('*')) if f.is_file()]
out.write_text(json.dumps(report,indent=2),encoding='utf-8');assert report['rootAttributesExact'] and not report['mismatches'];assert not post or (report['inputListExact'] and report['digestExact']);print(json.dumps({'source':report['source'],'inputs':len(rows),'mismatches':len(report['mismatches']),'build':report.get('build'),'passed':True}))
