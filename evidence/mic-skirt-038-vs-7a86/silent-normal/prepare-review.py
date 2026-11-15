from pathlib import Path
import json,gzip,subprocess,sys
import imageio_ffmpeg
p=Path(__file__).resolve().parent
summary=json.loads((p/'video-summary.json').read_text())
for key,e in summary.items():
 v,view=key.split('/');d=json.loads(gzip.decompress((p/v/(view+'.json.gz')).read_bytes()));f=d['frames'];g=[r for r in f if r['t']>=0];e['recordingAfterStart']={'excludedNegativeTimestampFrames':len(f)-len(g),'rawFirst':{'t':f[0]['t'],'sim':f[0]['sim']},'rawLast':{'t':f[-1]['t'],'sim':f[-1]['sim']},'wall':(g[-1]['t']-g[0]['t'])/1000,'sim':g[-1]['sim']-g[0]['sim'],'ratio':(g[-1]['sim']-g[0]['sim'])/((g[-1]['t']-g[0]['t'])/1000)}
(p/'video-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
for v in ['baseline','candidate']:
 r=summary[v+'/fixed-diagnostic-close']['clipRange'];out=p/v/'sit-entry-excerpt-padded.mp4'
 if not out.exists():subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(p/v/'fixed-diagnostic-close.webm'),'-vf',f'trim=start={r[0]}:end={r[1]},setpts=PTS-STARTPTS,pad=ceil(iw/2)*2:ceil(ih/2)*2','-an','-c:v','libx264','-threads','2','-crf','18','-pix_fmt','yuv420p',str(out)],check=True)
 subprocess.run([sys.executable,'scripts/qa-room-filmstrip.py',str(out),'--fps','12'],check=True)
