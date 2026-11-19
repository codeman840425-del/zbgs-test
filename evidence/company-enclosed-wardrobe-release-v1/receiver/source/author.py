"""Create a vented pair of wardrobe doors from the licensed Kenney TV cabinet and original raised louvers."""
from pathlib import Path
import hashlib,json,struct,sys,zipfile

root=Path(sys.argv[1]).resolve()
out=Path(sys.argv[2]).resolve()
out.mkdir(parents=True,exist_ok=True)
family='assets-source/company-receiver-louvered-wardrobe'
archive=root/'assets-source/company-side-table-v1/original/furniture-kit-2.0.zip'
digest=lambda b:hashlib.sha256(b).hexdigest()
assert digest(archive.read_bytes())=='e67652d0932cee41683f74711c03d3e192a2af9979ef8e6b237711f5482d46b0'
with zipfile.ZipFile(archive) as z:
    old=z.read('Models/GLTF format/cabinetTelevisionDoors.glb')
    notice=z.read('License.txt')
n=struct.unpack_from('<I',old,12)[0]
g=json.loads(old[20:20+n])
data=bytearray(old[28+n:28+n+g['buffers'][0]['byteLength']])
def accessor(triples):
    data.extend(bytes(-len(data)%4))
    start=len(data)
    data.extend(b''.join(struct.pack('<3f',*t) for t in triples))
    view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(data)-start,'target':34962})
    attr={'bufferView':view,'componentType':5126,'count':len(triples),'type':'VEC3',
      'min':list(map(min,zip(*triples))),'max':list(map(max,zip(*triples)))}
    g['accessors'].append(attr)
    return len(g['accessors'])-1
def append_louver_mesh(node,sign):
    vertices=[];normals=[]
    # Raised blades stop short of both the hinge stile and the latch stile.
    for y in (.033,.059,.085,.111,.137,.163):
        x0,x1=sorted((sign*.04,sign*.32));y0,y1=y-.005,y+.005;z0,z1=.011,.021
        v=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),
           (x0,y0,z1),(x1,y0,z1),(x1,y1,z1-.003),(x0,y1,z1-.003)]
        for a,b,c,d in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]:
            A,B,C=(v[i] for i in (a,b,c));u=[B[i]-A[i] for i in range(3)];w=[C[i]-A[i] for i in range(3)]
            normal=(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])
            mag=sum(k*k for k in normal)**.5
            for i in (a,b,c,a,c,d):vertices.append(v[i]);normals.append(tuple(k/mag for k in normal))
    g['meshes'][node['mesh']]['primitives'].append({'attributes':{'POSITION':accessor(vertices),'NORMAL':accessor(normals)},'material':len(g['materials'])-1,'mode':4})
g['materials'].append({'name':'louverAsh','pbrMetallicRoughness':{'baseColorFactor':[.53,.37,.17,1],'roughnessFactor':.79,'metallicFactor':0}})
for name,sign in [('doorLeft',1),('doorRight',-1)]:
    append_louver_mesh(next(n for n in g['nodes'] if n['name']==name),sign)
data.extend(bytes(-len(data)%4));g['buffers'][0]['byteLength']=len(data)
g['asset']['copyright']='Kenney CC0-1.0 cabinet doors with original project-authorized louvers.'
encoded=json.dumps(g,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
model=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(data))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(data),b'BIN\0')+data
license=b'Original raised louver geometry and this author script are authorized for use, modification and redistribution for this project. Donor cabinet geometry from Kenney Furniture Kit is CC0-1.0. Original notice follows.\n\n'+notice
author=Path(__file__).read_bytes()
for name,raw in [('author.py',author),('louvered.glb',model),('LICENSE.txt',license)]: (out/name).write_bytes(raw)
source={'path':family+'/louvered.glb','sha256':digest(model),'author':'Kenney Furniture Kit plus project-authored raised louvers','url':'https://kenney.nl/assets/furniture-kit','license':'Project-authorized-original','licensePath':family+'/LICENSE.txt','licenseSha256':digest(license),'nodes':{'left':'doorLeft','right':'doorRight'},'editable':{'path':family+'/author.py','sha256':digest(author)}}
recipe={'schema':'company-enclosed-wardrobe-collection','version':1,'sources':{'louvered':source},'designs':[{'id':'enclosed-wardrobe-louvered-ash','version':1,'displayName':'双门更衣柜 · 横格木百叶','source':'louvered','body':{'base':'plinth','color':'#766847','inside':'#af996c','feet':'#746553','rail':'#a49075'},'panels':[{'sourceMaterial':'wood','role':'panel','color':'#897952'},{'sourceMaterial':'louverAsh','role':'inset','color':'#ceac76'}],'handle':{'kind':'source','sourceMaterial':'metal','width':.028,'height':.15,'distance':.357,'centerY':.839,'color':'#b2a691'}}]}
(out/'recipe.json').write_bytes((json.dumps(recipe,ensure_ascii=False,indent=2)+'\n').encode())
print(digest(model),len(model))
