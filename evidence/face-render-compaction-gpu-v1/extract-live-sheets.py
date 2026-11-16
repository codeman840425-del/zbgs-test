# Reproduce tail contact sheets without changing recordings. Requires Pillow/imageio_ffmpeg.
from pathlib import Path
import subprocess, imageio_ffmpeg
from PIL import Image, ImageDraw
base=Path(__file__).resolve().parent/'live-0fb'
for sex in ['female','male']:
 out=base/(sex+'-tail-frames');out.mkdir(exist_ok=False)
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-threads','2','-sseof','-12.5','-i',str(base/(sex+'-live-1x.webm')),'-vf','fps=2','-frames:v','25',str(out/'%03d.png')],check=True)
 sheet=Image.new('RGB',(1600,1710),'#eeeeee');d=ImageDraw.Draw(sheet)
 for i,p in enumerate(sorted(out.glob('*.png'))):
  im=Image.open(p).convert('RGB');crop=im.crop((360,260,860,760)).resize((320,320));x=i%5*320;y=i//5*342;sheet.paste(crop,(x,y));d.text((x+6,y+322),f'Tail sample {i+1:02d}, 2 fps',fill='black')
 sheet.save(base/(sex+'-live-tail-sheet.png'))
