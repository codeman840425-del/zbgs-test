"""Compare full paused PNGs and actual browser geometry/pose receipts; no eye mask."""
from pathlib import Path
from PIL import Image,ImageChops
import json,argparse
p=argparse.ArgumentParser();p.add_argument('before');p.add_argument('after');p.add_argument('output');a=p.parse_args();old=Path(a.before);new=Path(a.after);dest=Path(a.output);assert not dest.exists(),'Preserve existing evidence'
before=json.loads((old/'report.json').read_text(encoding='utf-8'));after=json.loads((new/'report.json').read_text(encoding='utf-8'));rows=[]
def pixels(a,b):
 im=Image.open(a).convert('RGB');jm=Image.open(b).convert('RGB');assert im.size==jm.size;diff=ImageChops.difference(im,jm);return {'pixelMaxChannelDelta':max(z[1]for z in diff.getextrema()),'pixelChangedBounds':diff.getbbox(),'pixelChangedCount':sum(any(z)for z in diff.getdata())}
for x,y in zip(before['bodies'],after['bodies']):
 assert x['body']==y['body']
 for u,v in zip(x['stages'],y['stages']):
  assert u['stage']==v['stage'];rows.append({'body':x['body'],'stage':u['stage'],'poseSame':u['poseSHA256']==v['poseSHA256'],'morphSame':u.get('morphSHA256') is not None and u.get('morphSHA256')==v.get('morphSHA256'),'skinSame':u['meshes'][0]['actualWorldSkinSHA256']==v['meshes'][0]['actualWorldSkinSHA256'],'geometrySame':all(u['meshes'][0][key]==v['meshes'][0][key]for key in ['attributes','indexHash','groups']),'cameraSame':u['camera']==v['camera'],**pixels(old/u['filename'],new/v['filename']),'oldDraw':u['rendering'],'newDraw':v['rendering']})
 for root,report in [(old,x),(new,y)]:
  for st in report['stages'][2::2]:rows.append({'body':x['body'],'build':before['build']if root==old else after['build'],'restoreStage':st['stage'],**pixels(root/report['stages'][0]['filename'],root/st['filename'])})
passed=not before.get('failure')and not after.get('failure')and not before['errors']and not after['errors']and all(r['pixelMaxChannelDelta']<=1 and all(r.get(k,True)for k in ['poseSame','morphSame','skinSame','geometrySame','cameraSame'])for r in rows)
result={'passed':passed,'oldBuild':before['build'],'newBuild':after['build'],'oldOutput':old.as_posix(),'newOutput':new.as_posix(),'scope':'Actual paused same-face geometry/render-group callbacks and full-image pixel comparisons. Maximum1/255 per-channel renderer rounding allowed. No masks. Not frame-time performance.','rows':rows};dest.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':passed,'maxPixelChannelDelta':max(r['pixelMaxChannelDelta']for r in rows),'rows':len(rows)}));raise SystemExit(0 if passed else 1)
