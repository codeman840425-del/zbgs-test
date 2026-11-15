"""Compare actual deterministic captures; times/build identities deliberately excluded."""
import argparse,json,pathlib,math
p=argparse.ArgumentParser();p.add_argument('baseline');p.add_argument('candidate');args=p.parse_args()
base=pathlib.Path(args.baseline);candidate=pathlib.Path(args.candidate)
reports=[]
for mode in ['lap','authored']:
    a=json.loads((base/(mode+'.json')).read_text(encoding='utf8'))
    b=json.loads((candidate/(mode+'.json')).read_text(encoding='utf8'))
    assert not a['errors'] and not b['errors']
    assert len(a['frames'])==len(b['frames'])==270
    max_delta=0;worst=None;count=0;structure=[]
    def compare(x,y,path):
        global max_delta,worst,count
        if isinstance(x,dict) and isinstance(y,dict):
            if x.keys()!=y.keys():structure.append(path+': keys');return
            for key in x:
                if key=='fitElapsedMs':continue
                compare(x[key],y[key],path+'/'+key)
        elif isinstance(x,list) and isinstance(y,list):
            if len(x)!=len(y):structure.append(path+': length');return
            for i,(xx,yy) in enumerate(zip(x,y)):compare(xx,yy,path+'/'+str(i))
        elif isinstance(x,(float,int)) and not isinstance(x,bool) and isinstance(y,(float,int)):
            count+=1;d=abs(x-y)
            if not math.isfinite(d):structure.append(path+': nonfinite')
            if d>max_delta:max_delta=d;worst=path
        elif x!=y:structure.append(path+': unequal')
    for i,(old,new) in enumerate(zip(a['frames'],b['frames'])):
        for field in ['frame','mode','sitProgress','root','handContacts','body','pins']:
            compare(old[field],new[field],f'{i+1}/{field}')
    reports.append(dict(mode=mode,numericValues=count,maxAbsoluteDelta=max_delta,worst=worst,
        structureFailures=structure[:20],passed=not structure and max_delta<1e-9))
result={'baseline':str(base),'candidate':str(candidate),'reports':reports,'passed':all(r['passed'] for r in reports),
        'scope':'All 270 captured actual room poses including body/pins/contact iterations; fitElapsedMs excluded. No normal-speed visual or cost acceptance.'}
(candidate/'workspace-equivalence.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result,indent=2));assert result['passed']
