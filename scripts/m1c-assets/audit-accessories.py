"""Small standard-library check of exported accessories and declared socket transforms."""
import pathlib,json,struct,hashlib,math,argparse
ROOT=pathlib.Path(__file__).resolve().parents[2]
report=json.loads((ROOT/'assets-source/m1c-accessories/build-report.json').read_text(encoding='utf8'))
parser=argparse.ArgumentParser();parser.add_argument('--compare-dir',type=pathlib.Path);args=parser.parse_args();results=[]
for item in report['items']:
 p=ROOT/'prototype/public'/item['url'].lstrip('/');data=p.read_bytes()
 assert data[:4]==b'glTF' and struct.unpack_from('<I',data,8)[0]==len(data)
 length=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+length])
 assert hashlib.sha256(data).hexdigest()==item['sha256']
 assert not g.get('skins') and not g.get('animations') and not g.get('images')
 assert all(m.get('alphaMode','OPAQUE')=='OPAQUE' for m in g['materials'])
 sockets={n['name']:n for n in g['nodes'] if n['name'].startswith('socket_')}
 for key,s in item['sockets'].items():
  n=sockets['socket_'+key];assert n['extras']['semantic']==key
  assert max(abs(a-b) for a,b in zip(n.get('translation',[0,0,0]),s['position']))<1e-7
 assert all(all(math.isfinite(v) for v in a.get('min',[])+a.get('max',[])) for a in g['accessors'])
 results.append({'id':item['id'],'sha256':item['sha256'],'bytes':len(data),'meshPrimitives':sum(len(m['primitives']) for m in g['meshes']),'socketNames':list(sockets),'opaqueOnly':True,'noExternalBuffersTexturesSkinsAnimations':True})
repeat=None
if args.compare_dir:
 repeat={i['id']:i['sha256']==hashlib.sha256((args.compare_dir/(i['id']+'.glb')).read_bytes()).hexdigest() for i in report['items']};assert all(repeat.values()),'Repeated export differs'
result={'assets':results,'twoIndependentBlenderRunsByteIdentical':repeat,'limits':['Structural resource check only; no runtime hand/head attachment or fitting acceptance']}
(ROOT/'assets-source/m1c-accessories/audit-report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result))
