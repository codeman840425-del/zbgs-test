"""Verify the supplied single dance sample; retain video/contact sheets in ignored analysis."""
import hashlib,json,shutil,urllib.request
from pathlib import Path
import av
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'analysis/dance-reference-v1';LOCAL.mkdir(parents=True,exist_ok=True)
EVIDENCE=ROOT/'evidence/dance-video-pose-v1';EVIDENCE.mkdir(parents=True,exist_ok=True)
UPSTREAM=Path('C:/Users/Administrator/Documents/Codex/2026-11-14/gamemake-advisor/dance-source/5359146-original.mp4')
EXPECTED='c26ca0a91f8b735c575a142a75504696609bfa024e905b9cec13ba61c70c1c48'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source=LOCAL/'5359146-original.mp4'
if not source.exists():
    if UPSTREAM.exists():
        if sha(UPSTREAM)!=EXPECTED:raise ValueError('Supplied input SHA mismatch')
        shutil.copyfile(UPSTREAM,source)
    else:
        with urllib.request.urlopen('https://videos.pexels.com/video-files/5359146/5359146-uhd_3840_2160_24fps.mp4',timeout=120) as r:payload=r.read()
        if hashlib.sha256(payload).hexdigest()!=EXPECTED:raise ValueError('Remote source SHA mismatch')
        source.write_bytes(payload)
if sha(source)!=EXPECTED:raise ValueError('Local input SHA mismatch')
times=[];sheets=[];sheet=None
with av.open(str(source)) as c:
    stream=c.streams.video[0];meta={'width':stream.width,'height':stream.height,'time_base':str(stream.time_base),'average_rate':str(stream.average_rate),'codec':stream.codec_context.name,'audio_streams':len(c.streams.audio)}
    for index,frame in enumerate(c.decode(stream)):
        if frame.pts is None:raise ValueError('Missing original PTS')
        seconds=float(frame.pts*frame.time_base);selected=0<=seconds<30
        times.append({'index':index,'pts':frame.pts,'time_base':str(frame.time_base),'source_seconds':seconds,'selected':selected})
        if not selected:continue
        if index%120==0:
            sheet=Image.new('RGB',(1920,1080),'#101820');draw=ImageDraw.Draw(sheet)
        im=frame.to_image();im.thumbnail((160,90));cell=index%120;x=cell%12*160;y=cell//12*108;sheet.paste(im,(x,y));draw.text((x+2,y+91),f'{index} / {seconds:.3f}s',fill='white')
        if index%120==119:
            file=LOCAL/f'all-frames-{index//120}.jpg';sheet.save(file,quality=90);sheets.append({'path':str(file.relative_to(ROOT)),'first_index':index-119,'last_index':index,'sha256':sha(file)})
selected=[r for r in times if r['selected']]
if len(selected)!=720 or selected[0]['index']!=0 or selected[-1]['index']!=719:raise ValueError('Unexpected selected interval')
record={'asset_id':'pexels-5359146','source_page':'https://www.pexels.com/video/young-woman-dancing-and-lip-synching-5359146/','download_url':'https://videos.pexels.com/video-files/5359146/5359146-uhd_3840_2160_24fps.mp4','creator':'Sergey Makashin / Pexels','license':'Pexels License, not CC0','license_url':'https://www.pexels.com/license/','usage':'Internal source/reference only; do not commit original, contact sheets or overlay video to public repository. Do not imply endorsement or redistribute as stock. No model training is performed.','source_local_path':str(source.relative_to(ROOT)),'source_sha256':EXPECTED,'source_bytes':source.stat().st_size,'media':meta,'decoded_frames':len(times),'requested_interval_seconds':[0,30],'selected_frames':720,'selected_index_range':[0,719],'selected_pts_first_last':[selected[0]['pts'],selected[-1]['pts']],'selected_seconds_first_last':[selected[0]['source_seconds'],selected[-1]['source_seconds']],'outside_interval_frames':len(times)-720,'outside_interval_policy':'Retained in original; not processed as selected motion and not used as context in this run.','all_frame_contact_sheets_local_only':sheets,'visual_inspection':'pending; all 720 selected frames have local labelled thumbnails'}
(EVIDENCE/'source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
(EVIDENCE/'source-frame-times.json').write_text(json.dumps(times,indent=2),encoding='utf-8')
print(json.dumps({k:record[k] for k in ['source_bytes','media','decoded_frames','selected_frames','selected_seconds_first_last','outside_interval_frames']},indent=2))
