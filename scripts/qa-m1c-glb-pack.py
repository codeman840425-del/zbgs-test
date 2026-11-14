"""Small lossless glTF accessor repacker for pinned source-motion assets."""
import copy,json,struct
import numpy as np
def pack(g,animations=None,baked=None):
    j=copy.deepcopy(g.j);j['animations']=copy.deepcopy(animations or []);j['accessors']=[];j['bufferViews']=[];binary=bytearray();copied={}
    def add(values,component,kind,meta=None):
        values=np.asarray(values,dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1',5122:'<i2',5120:'i1'}[component]);binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);binary.extend(values.tobytes());view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes});a={'bufferView':view,'componentType':component,'count':len(values),'type':kind}
        for key in ['min','max','normalized']:
            if meta and key in meta:a[key]=meta[key]
        idx=len(j['accessors']);j['accessors'].append(a);return idx
    def old(index):
        if index not in copied:
            a=g.j['accessors'][index];assert not a.get('normalized'),'Normalized integer storage requires raw accessor copy';copied[index]=add(g.acc(index),a['componentType'],a['type'],a)
        return copied[index]
    for mesh in j['meshes']:
        for primitive in mesh['primitives']:
            primitive['attributes']={key:old(index)for key,index in primitive['attributes'].items()}
            if'indices'in primitive:primitive['indices']=old(primitive['indices'])
            for target in primitive.get('targets',[]):
                for key,index in target.items():target[key]=old(index)
    for skin in j['skins']:skin['inverseBindMatrices']=old(skin['inverseBindMatrices'])
    for animation in j['animations']:
        for sampler in animation['samplers']:sampler['input']=old(sampler['input']);sampler['output']=old(sampler['output'])
    if baked:
        times=baked['times'];timeAcc=add(times[:,None],5126,'SCALAR',{'min':[float(times[0])],'max':[float(times[-1])]});a={'name':baked['name'],'samplers':[],'channels':[]}
        for i,node in enumerate(g.nodes):
            if'matrix'in node:continue
            for prop,values,kind in [('translation',baked['translations'][i],'VEC3'),('rotation',baked['rotations'][i],'VEC4'),('scale',np.broadcast_to(node.get('scale',[1,1,1]),(len(times),3)),'VEC3')]:
                values=values.copy()
                if prop=='rotation':
                    for k in range(1,len(values)):
                        if values[k-1]@values[k]<0:values[k]*=-1
                output=add(values,5126,kind);idx=len(a['samplers']);a['samplers'].append({'input':timeAcc,'output':output,'interpolation':'LINEAR'});a['channels'].append({'sampler':idx,'target':{'node':i,'path':prop}})
        j['animations'].append(a)
    assert not j.get('images'),'Pinned mannequin has no embedded images; extend only after audit'
    j['buffers']=[{'byteLength':len(binary)}];text=json.dumps(j,separators=(',',':')).encode();text+=b' '*((-len(text))%4);binary.extend(b'\0'*((-len(binary))%4))
    return struct.pack('<4sII',b'glTF',2,28+len(text)+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(binary),b'BIN\0')+binary
