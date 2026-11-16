"""Independent bounded A artifact checks; no browser or product writes."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,sys
src=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(exist_ok=False)
load=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
admission=load(out.parent/'plan-check.json')['rows']
report={'scope':'Independent stored artifact/condition audit, not a second browser execution or visual acceptance','recipes':[],'views':[]}
for sex in ['female','male']:
 base=load(src/'static-2/recipes'/f'{sex}-baseline.v5.json')
 for item in ['baseline','a','b']:
  f=src/'static-2/recipes'/f'{sex}-{item}.v5.json';r=load(f)
  expected=next(x for x in admission if x['body']==sex and x['selected']['id'].lower()==item)
  assert r['schema']=='workbench-appearance-recipe-v5'
  for k in ['rulesVersion','paletteVersion','base','appearance','hairAssetSha256','equipment']:assert r[k]==base[k],(sex,item,k)
  assert r['base']['sha256']==expected['baseAvatarSha256']
  for key in ['mouthWidth','browSample','noseSample','eyeSample']:assert r['geometry'][key]==expected['selected'][key]
  for domain in ['mouth','brow','nose','eye']:
   valuekey='mouthWidth' if domain=='mouth' else domain+'Sample';hashkey='recipeSha256' if domain=='mouth' else domain+'RecipeSha256'
   assert r['geometry'][hashkey]==(None if r['geometry'][valuekey] in [0,'none'] else expected['domains'][domain]['sha256'])
  report['recipes'].append({'body':sex,'sample':item,'path':str(f),'sha256':sha(f),'checks':'same body/color/hair/equipment; exact allowed geometry pins'})
 for view in ['none-front','none-side','none-diagonal','original-front','original-side','original-room']:
  folder=src/('room-36' if view=='original-room' else 'static-2');ref=load(folder/f'{sex}-baseline-{view}.json')
  sheet=Image.new('RGB',(1500,610),'#eeeeee');draw=ImageDraw.Draw(sheet)
  for col,item in enumerate(['baseline','a','b']):
   name=f'{sex}-{item}-{view}';f=folder/(name+'.json');r=load(f)
   for k in ['sim','bones','lights','camera','weights']:assert r[k]==ref[k],(name,k)
   assert all(x==0 for x in r['weights'].values()),name
   recipe=load(src/'static-2/recipes'/f'{sex}-{item}.v5.json')
   for k in ['mouthWidth','browSample','noseSample','eyeSample']:assert r['geometry'][k]==recipe['geometry'][k],(name,k)
   for k in ['hairColor','skinTone','eyeColor','lipColor']:assert r['appearance'][k]==recipe['appearance'][k]
   assert r['appearance']['hairStyle']==view.split('-')[0]
   image=Image.open(folder/(name+'.png')).convert('RGB')
   if view!='original-room':image=image.crop((350,35,1050,835))
   image.thumbnail((495,575));sheet.paste(image,(col*500,30));draw.text((col*500+5,7),name,fill='black')
   report['views'].append({'name':name,'metadataSha256':sha(f),'pngSha256':sha(folder/(name+'.png')),'sameCondition':True})
  sheet.save(out/f'{sex}-{view}.jpg',quality=95)
report['status']='36 condition records and 6 v5 files passed; visual review separately required'
(out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
(out/'executed-script.py').write_bytes(Path(__file__).read_bytes())
print(report['status'])
