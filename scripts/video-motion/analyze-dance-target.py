"""Read-only target direction/contact diagnostics and static basis fixtures."""
import json,pathlib
import numpy as np
from scipy.spatial.transform import Rotation as R
from PIL import Image,ImageDraw,ImageFont
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-target-v1'
rows=[];samples=[138,146,171,172,174,190,201,210]
im=Image.new('RGB',(1200,8*280+50),'#111923');draw=ImageDraw.Draw(im);draw.font=ImageFont.load_default(size=14)
main=['hips','spine','chest','upperChest','neck','head']+[s+b for s in ['left','right'] for b in ['Shoulder','UpperArm','LowerArm','Hand','UpperLeg','LowerLeg','Foot','Toes']]
for col,body in enumerate(['female','male']):
 rig=json.loads((ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json').read_text());bones=rig['normalizedBones']
 data=np.load(OUT/f'{body}-world.npz');w=data['world'];names=list(data['names']);idx={s:i for i,s in enumerate(names)}
 report=json.loads((OUT/f'{body}-report.json').read_text());asset=json.loads((OUT/f'{body}-dance-normalized.json').read_text())
 lat=w[:,idx['leftUpperLeg'],:3,3]-w[:,idx['rightUpperLeg'],:3,3];yaw=np.rad2deg(np.unwrap(np.arctan2(-lat[:,2],lat[:,0])))
 support=np.minimum(report['skin']['left']['lowestYByFrame'],report['skin']['right']['lowestYByFrame'])
 steps={}
 for track in asset['clip']['tracks']:
  if track['type']!='quaternion':continue
  q=np.array(track['values']).reshape(-1,4);a=np.rad2deg(2*np.arccos(np.clip(abs(np.sum(q[1:]*q[:-1],axis=1)),0,1)));k=int(a.argmax());steps[track['name']]={'max_deg':float(a[k]),'source_frames':[k+138,k+139]}
 parent=R.from_matrix(np.array(bones['hips']['actualParentWorldMatrix']).reshape(4,4).T[:3,:3]);rest=R.from_matrix(np.array(bones['hips']['worldMatrix']).reshape(4,4).T[:3,:3])
 fixtures=[]
 for angle in [0,90,180]:
  delta=R.from_rotvec([0.,np.deg2rad(angle),0.]);local=parent.inv()*delta*rest;world=parent*local
  recovered=world*rest.inv();fwd=recovered.apply([0,0,1]);fixtures.append({'canonical_yaw_deg':angle,'normalized_local_hips_quaternion':local.as_quat().tolist(),'recovered_world_body_forward':fwd.tolist(),'forward_error':float(np.linalg.norm(fwd-delta.apply([0,0,1])))})
 rows.append({'body':body,'hip_heading_deg':yaw.tolist(),'hip_heading_net_deg':float(yaw[-1]-yaw[0]),'hip_heading_max_step_deg':float(abs(np.diff(yaw)).max()),'both_feet_lowest_y_by_frame':support.tolist(),'maximum_both_feet_lowest_y':float(support.max()),'minimum_both_feet_lowest_y':float(support.min()),'maximum_local_rotation_steps':steps,'static_basis_fixtures':fixtures,'fixture_scope':'Mathematical rest/front+90/back mapping through exact VRM0 normalized parent; not physical source camera extrinsic calibration.'})
 draw.text((col*600+10,10),f'{body}: actual target bone heads / XY front + XZ top',fill='white')
 for row,frame in enumerate(samples):
  k=frame-138;y=row*280+50;draw.line([(col*600,y),(col*600+600,y)],fill='#45505b');draw.text((col*600+8,y+5),f'frame{frame} hipYaw{yaw[k]:.1f} floorLowest{support[k]*1000:.1f}mm',fill='white')
  xy={s:(col*600+150+w[k,idx[s],0,3]*125,y+255-w[k,idx[s],1,3]*125) for s in main}
  top={s:(col*600+450+w[k,idx[s],0,3]*125,y+145-w[k,idx[s],2,3]*125) for s in main}
  draw.line([(col*600+10,y+255),(col*600+290,y+255)],fill='#b85555')
  for projection in [xy,top]:
   for s in main:
    p=bones[s]['parentSemantic']
    if p not in projection:continue
    color='#5dd2ff' if s.startswith('left') else '#ffae66' if s.startswith('right') else '#e2e5ed'
    draw.line([projection[p],projection[s]],fill=color,width=3)
   for x,z in projection.values():draw.ellipse((x-2,z-2,x+2,z+2),fill='white')
im.save(OUT/'target-direction-contact.png')
(OUT/'direction-contact-audit.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['body','hip_heading_net_deg','hip_heading_max_step_deg','maximum_both_feet_lowest_y','minimum_both_feet_lowest_y']} for r in rows],indent=2))
