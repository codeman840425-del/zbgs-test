"""Independent visual-reference comparison AFTER frozen rule outputs are written."""
import json,hashlib
from pathlib import Path
from collections import Counter
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-contact-study-v1'
predpath=OUT/'contact-estimates.json';pred=json.loads(predpath.read_text());refpath=ROOT/'assets-source/video-dance-twist-study-v1/support-observations.json';ref=json.loads(refpath.read_text())
def reference_class(s):
 if 'unknown' in s or 'or_' in s:return 'unknown'
 if s in ['visibly_airborne','airborne','visible_swing']:return 'airborne'
 if s.startswith('apparent_contact') or s=='apparent_forefoot_contact_heel_raised':return 'contact'
 return 'unknown'
refs={}
for interval in ref['observations']:
 for i in range(interval['frames'][0],interval['frames'][1]+1):refs[i]={s:reference_class(interval[s]) for s in ['left','right']}
foot={};whole=[]
for side in ['left','right']:
 c=Counter();contradictions=[];classified=[]
 for r in pred['frames']:
  i=r['source_frame_index'];raw=r['feet'][side]['state'];p='airborne' if raw=='airborne_candidate' else 'contact' if raw in ['forefoot_pivot_candidate','flat_support_candidate'] else 'unknown';truth=refs[i][side];c[f'visual_{truth}__rule_{p}']+=1
  if truth!='unknown' and p!='unknown' and p!=truth:contradictions.append({'frame':i,'source_seconds':r['source_seconds'],'visual_reference':truth,'rule_estimate':raw})
  classified.append({'frame':i,'visual':truth,'rule':p})
 foot[side]={'counts':dict(c),'clear_visual_disagreements':contradictions,'classification':classified}
for r in pred['frames']:
 if r['whole_body']=='bilateral_airborne_candidate':
  i=r['source_frame_index'];v=refs[i];label='visual_agreement' if all(s=='airborne' for s in v.values()) else 'visual_disagreement' if any(s=='contact' for s in v.values()) else 'visual_unknown'
  whole.append({'frame':i,'classification':label})
known_flight=[i for i,v in refs.items() if all(s=='airborne' for s in v.values())]
preserved=all(pred['frames'][i-138]['whole_body']=='bilateral_airborne_candidate' for i in known_flight)
result={'prediction_sha256':hashlib.sha256(predpath.read_bytes()).hexdigest(),'visual_reference_sha256':hashlib.sha256(refpath.read_bytes()).hexdigest(),'reference_semantics':'Independent prior manual observations, not measured contact truth. Unknown intervals excluded from hard disagreement counts. They were not read by the estimator.','feet':foot,'bilateral_flight_comparison':whole,'visually_known_bilateral_flight_frames':known_flight,'all_known_flight_frames_preserved':preserved,'whole_body_counts':dict(Counter(r['whole_body'] for r in pred['frames'])),'root_contact_adaptation_ready':False,'reason':'False airborne classifications during visually supported frames, many unknowns, and no physical ground/camera model. Do not drive rootheight or fixedcontact constraints. Retain candidate signals only; no threshold sweep.'}
(OUT/'independent-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
colors={'airborne':'#77b9ef','contact':'#79c58d','unknown':'#6e7785'};im=Image.new('RGB',(1600,490),'#111923');d=ImageDraw.Draw(im);d.font=ImageFont.load_default(size=15)
d.text((15,12),'73 original frames: independent visual reference vs fixed rule (candidate only)',fill='white')
d.text((15,34),'Blue airborne | Green contact/pivot | Gray unknown | Red outlined disagreement; no labels fed to estimator',fill='white')
for row,(side,key) in enumerate([('left','visual'),('left','rule'),('right','visual'),('right','rule')]):
 y=85+row*75;d.text((10,y+12),side+' '+key,fill='white')
 for k,c in enumerate(foot[side]['classification']):
  x=185+k*19;d.rectangle((x,y,x+17,y+34),fill=colors[c[key]])
  if c['visual']!='unknown' and c['rule']!='unknown' and c['visual']!=c['rule']:d.rectangle((x,y,x+17,y+34),outline='#ff5656',width=3)
  if row==3 and (k%5==0 or c['frame']==210):d.text((x,y+40),str(c['frame']),fill='white')
d.text((15,435),'Shared image lower-envelope and uncalibrated 3D are insufficient for root/contact fitting. No motion asset changed.',fill='#ffb080')
im.save(OUT/'contact-validation-timeline.png')
print(json.dumps({'whole_body':result['whole_body_counts'],'known_flight_preserved':preserved,'bilateral_comparison':dict(Counter(x['classification'] for x in whole)),'per_foot_disagreement_frames':{s:[x['frame'] for x in r['clear_visual_disagreements']] for s,r in foot.items()}},indent=2))
