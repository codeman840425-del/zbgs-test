import io,json,urllib.request,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[2]/'evidence/real-microphone-pose-v1'
rows=json.loads((root/'sources.json').read_text(encoding='utf-8'))
row=rows[0]
with urllib.request.urlopen(urllib.request.Request(row['download_url'],headers={'User-Agent':'GamemakePoseReference/1.0'}),timeout=60) as response:data=response.read()
remote=Image.open(io.BytesIO(data)).convert('RGB');local=Image.open(root/row['file']).convert('RGB')
result={'remote_sha256':hashlib.sha256(data).hexdigest(),'local_size':local.size,'remote_size':remote.size}
if local.size==remote.size:
    delta=np.asarray(local,dtype=float)-np.asarray(remote,dtype=float)
    result.update({'pixel_exact':bool(np.all(delta==0)),'rgb_mae':float(np.abs(delta).mean()),'rgb_rmse':float(np.sqrt((delta*delta).mean()))})
comparison=Image.new('RGB',(local.width*2,local.height));comparison.paste(local,(0,0));comparison.paste(remote,(local.width,0));comparison.thumbnail((960,720));comparison.save(root/'headphones-source-comparison.jpg')
(root/'headphones-source-pixel-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(result)
