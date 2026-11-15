from pathlib import Path
import os
R=Path(__file__).resolve().parents[3];mode=os.environ.get('SKIRT_OBSERVATION','moving');assert mode in ('moving','static');folder='ring-frame-'+mode+'-v1'
source=R/'scripts/m1-assets/simple-skirt/render-two-quad-diagnostic.py';s=source.read_text();s=s.replace("prep=json.loads((A/'native-author-trial-v1/preparation.json').read_text())","prep=json.loads((A/'native-author-trial-v1/preparation.json').read_text())")
s=s.replace("O=A/'native-author-trial-v1/views'","O=A/"+repr(folder+'/views'));s=s.replace("(A/'native-author-trial-v1'/('frame-", "(A/"+repr(folder)+"/('frame-");s=s.replace('for frameNumber in [1,7,18]:','for frameNumber in [28]:' if mode=='moving'else'for frameNumber in [18]:')
if mode=='static':s=s.replace("fr=cap['frames'][frameNumber-1]","fr=cap['frames'][0]")
s=s.replace('No physics evaluated; selected frames1,7,18, not a complete real-time video.','No physics evaluated; terminal frozenouter ringframe replay; originalrender fullsurface, not realtime/game approval.')
exec(compile(s,str(source),'exec'),globals())
