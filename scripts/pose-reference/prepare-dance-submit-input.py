"""Prepare a local reviewable H264 input, never upload; preserve original720PTS.
Standard CFR720 frames at24000/1001 have a30.03s display duration. Do not hide it.
"""
from pathlib import Path
from fractions import Fraction
import argparse,csv,hashlib,json,re,subprocess
import av,imageio_ffmpeg
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',default='analysis/dance-submit-input-v1');parser.add_argument('--evidence-dir',default='evidence/dance-video-pose-v1/submit-input-v1');args=parser.parse_args()
OUT=(ROOT/args.output_dir).resolve();EVID=(ROOT/args.evidence_dir).resolve();assert OUT.is_relative_to(ROOT/'analysis');assert EVID.is_relative_to(ROOT/'evidence')
OUT.mkdir(parents=True,exist_ok=True);EVID.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'analysis/dance-reference-v1/5359146-original.mp4';EXPECTED='c26ca0a91f8b735c575a142a75504696609bfa024e905b9cec13ba61c70c1c48'
MOVIE=OUT/'5359146-frames0000-0719-1080p-cfr24000_1001.mp4';FFMPEG=Path(imageio_ffmpeg.get_ffmpeg_exe());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(SOURCE)==EXPECTED
version=subprocess.run([str(FFMPEG),'-version'],capture_output=True,text=True,encoding='utf-8',check=True).stdout
(EVID/'ffmpeg-version.txt').write_text(version,encoding='utf-8')
inventory=[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size} for p in (ROOT/'analysis').rglob('*') if p.is_file() and p.suffix.lower() in ('.mp4','.mov','.mkv','.webm')]
command=[str(FFMPEG),'-hide_banner','-nostdin','-nostats','-n','-copyts','-threads','2','-noautorotate','-i',str(SOURCE),'-map','0:v:0','-an','-frames:v','720','-vf','scale=1920:1080:flags=lanczos','-filter_threads','1','-fps_mode','passthrough','-c:v','libx264','-preset','medium','-crf','18','-threads','2','-pix_fmt','yuv420p','-enc_time_base','1:24000','-video_track_timescale','24000','-movflags','+faststart',str(MOVIE)]
reused=MOVIE.exists()
if reused:
 prior=json.loads((EVID/'manifest.json').read_text(encoding='utf-8'));assert prior['source']['sha256']==EXPECTED and prior['output']['sha256']==sha(MOVIE),'Existing file differs; use new output/evidence directories'
else:
 print('Encoding720 original frames with2 CPU threads; no frame resampling',flush=True)
 proc=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace');(EVID/'encoding-stderr.txt').write_text(proc.stderr,encoding='utf-8');proc.check_returncode()

def decode(path,source=False):
 records=[];samples={}
 with av.open(str(path)) as c:
  s=c.streams.video[0];s.thread_type='SLICE';s.codec_context.thread_count=2
  metadata={'containerDurationMicroseconds':c.duration,'containerDurationSeconds':float(c.duration/av.time_base) if c.duration is not None else None,'containerStartTime':c.start_time,'streamTimeBase':str(s.time_base),'streamDurationTicks':s.duration,'streamDurationSeconds':float(s.duration*s.time_base) if s.duration is not None else None,'streamStartTime':s.start_time,'declaredFrames':s.frames,'averageRate':str(s.average_rate),'baseRate':str(s.base_rate),'guessedRate':str(s.guessed_rate),'codec':s.codec_context.name,'pixelFormat':s.codec_context.format.name,'width':s.width,'height':s.height,'sampleAspectRatio':str(s.sample_aspect_ratio),'audioStreams':len(c.streams.audio)}
  for index,f in enumerate(c.decode(s)):
   duration=getattr(f,'duration',None);records.append({'index':index,'pts':f.pts,'timeBase':str(f.time_base),'seconds':float(f.pts*f.time_base),'durationTicks':duration,'durationSeconds':float(duration*f.time_base) if duration else None})
   if index in (0,360,719):samples[index]=f.to_image().resize((640,360),Image.Resampling.LANCZOS)
 return metadata,records,samples
print('Decoding source and output through PyAV for originalPTS equality',flush=True)
sourceMeta,sourceFrames,sourceSamples=decode(SOURCE,True);outputMeta,outputFrames,outputSamples=decode(MOVIE)
selected=[f for f in sourceFrames if Fraction(f['pts'])*Fraction(f['timeBase'])<30]
assert len(sourceFrames)==729 and len(selected)==720 and len(outputFrames)==720
assert [f['pts'] for f in selected]==[k*1001 for k in range(720)]
assert all(Fraction(a['pts'])*Fraction(a['timeBase'])==Fraction(b['pts'])*Fraction(b['timeBase']) for a,b in zip(selected,outputFrames))
assert outputMeta['width']==1920 and outputMeta['height']==1080 and outputMeta['audioStreams']==0 and outputMeta['codec']=='h264'
assert outputMeta['averageRate']=='24000/1001' and outputMeta['streamTimeBase']=='1/24000'
assert all(b['pts']-a['pts']==1001 for a,b in zip(outputFrames,outputFrames[1:]))
mapping=[]
for a,b in zip(selected,outputFrames):mapping.append({'sourceIndex':a['index'],'sourcePTS':a['pts'],'sourceTimeBase':a['timeBase'],'sourceSeconds':a['seconds'],'outputIndex':b['index'],'outputPTS':b['pts'],'outputTimeBase':b['timeBase'],'outputSeconds':b['seconds'],'outputDurationTicks':b['durationTicks'],'outputDurationSeconds':b['durationSeconds']})
with (EVID/'frame-mapping.csv').open('w',encoding='utf-8',newline='') as f:w=csv.DictWriter(f,fieldnames=list(mapping[0]));w.writeheader();w.writerows(mapping)

print('Independent FFmpeg7.1 showinfo decoding all720 output frames',flush=True)
probe=[str(FFMPEG),'-hide_banner','-nostdin','-nostats','-copyts','-threads','2','-i',str(MOVIE),'-map','0:v:0','-vf','showinfo','-filter_threads','1','-fps_mode','passthrough','-an','-f','null','-']
proc=subprocess.run(probe,capture_output=True,text=True,encoding='utf-8',errors='replace');(EVID/'ffmpeg-showinfo.txt').write_text(proc.stderr,encoding='utf-8');proc.check_returncode()
matches=re.findall(r'\bn:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:([^\s]+)',proc.stderr)
assert len(matches)==720 and [int(x[0]) for x in matches]==list(range(720)) and [int(x[1]) for x in matches]==[f['pts'] for f in selected]
config=re.search(r'config in time_base:\s*([^,\s]+),\s*frame_rate:\s*([^\s]+)',proc.stderr);assert config and config.group(1)=='1/24000' and config.group(2)=='24000/1001'
duration=re.search(r'Duration:\s*([0-9:.]+)',proc.stderr)
canvas=Image.new('RGB',(1280,3*390),(20,27,35));draw=ImageDraw.Draw(canvas)
for row,index in enumerate((0,360,719)):
 canvas.paste(sourceSamples[index],(0,row*390));canvas.paste(outputSamples[index],(640,row*390));draw.text((10,row*390+363),f'original {index} PTS={index*1001}/24000',fill='white');draw.text((650,row*390+363),f'1080p H264 same source index/PTS {index}',fill='white')
preview=OUT/'source-vs-input-first-middle-last.jpg';canvas.save(preview,quality=93)
last=outputFrames[-1];lastStart=Fraction(last['pts'])*Fraction(last['timeBase']);lastEnd=lastStart+Fraction(last['durationTicks'])*Fraction(last['timeBase'])
record={'schema':'local-mocap-input-preparation.1','purpose':'Reviewable input for a future explicit user/tool choice, NOT uploaded/submitted or service-limit approved.','inventoryBeforePreparation':inventory,'reusedExistingVerifiedCopy':reused,
 'source':{'path':SOURCE.relative_to(ROOT).as_posix(),'sha256':EXPECTED,'bytes':SOURCE.stat().st_size,'licenseManifest':'evidence/dance-video-pose-v1/source.json','metadata':sourceMeta,'decodedFrames':len(sourceFrames),'retainedUnchanged':True},
 'selection':{'interval':'[0,30)','firstIndex':0,'lastIndex':719,'frames':720,'firstPTS':0,'lastPTS':719719,'timeBase':'1/24000','lastObservedSeconds':float(lastStart),'outsideFramesExcluded':9},
 'output':{'path':MOVIE.relative_to(ROOT).as_posix(),'sha256':sha(MOVIE),'bytes':MOVIE.stat().st_size,'metadata':outputMeta,'decodedFrames':len(outputFrames),'lastFrameDurationTicks':last['durationTicks'],'lastFrameDisplayEndSeconds':float(lastEnd)},
 'tailPolicy':{'policy':'Retain standard CFR1001/24000 duration for final source frame. No new observed frame, duplication, time stretching or invented motion.','lastObservationSeconds':float(lastStart),'requestedEndSeconds':30,'retainedLastFrameWithinRequestedRangeSeconds':float(Fraction(30)-lastStart),'actualLastDisplayEndSeconds':float(lastEnd),'containerBeyondRequested30Seconds':outputMeta['containerDurationSeconds']-30,'strict30SecondContainer':outputMeta['containerDurationSeconds']==30,'warning':'Selected observations are strictly[0,30), but the encoded720-frame CFR container is30.03s. It may exceed a30s cloud quota. No claim of exact30s submission compatibility; do not upload without a later explicit decision.'},
 'imageMapping':{'sourceSize':[3840,2160],'outputSize':[1920,1080],'scaleXY':[.5,.5],'crop':None,'rotation':None,'filter':'libswscale Lanczos','codec':'libx264 H264 yuv420p, CRF18 presetmedium','audio':'source has none; no audio added'},
 'timing':{'nominalRate':'24000/1001','PTSMapping':'output pts=original pts, same1/24000 timebase, all720 values verified exactly','duplicateOrDroppedSelectedFrames':0,'speedMultiplier':1,'AIInterpolation':False,'newDetections':False},
 'tools':{'ffmpegExecutable':str(FFMPEG),'ffmpegSha256':sha(FFMPEG),'ffmpegVersionFirstLine':version.splitlines()[0],'pyavVersion':av.__version__,'pyavLibraryVersions':av.library_versions,'independentFfprobeAvailable':False,'verificationName':'PyAV decode + independent bundledFFmpeg7.1 showinfo; NOT ffprobe'},
 'verification':{'sourceToOutputAllPTSExact':True,'pyav720Frames':True,'ffmpegShowinfo720Frames':True,'ffmpegShowinfoTimeBase':config.group(1),'ffmpegShowinfoFrameRate':config.group(2),'ffmpegDisplayedDuration':duration.group(1) if duration else None,'ffmpegAllPTSMatch':True,'sourceStillSha256':sha(SOURCE),'privatePreview':preview.relative_to(ROOT).as_posix(),'previewSha256':sha(preview),'previewReview':'pending visual review'},
 'commands':{'encode':command,'secondDecode':probe},'useBoundary':'Local internal reference only; source and copy stay under ignored analysis. No account/registration/upload/payment/training. Existing original Pexels usage restrictions remain.'}
(EVID/'manifest.json').write_text(json.dumps(record,indent=2),encoding='utf-8');print(json.dumps({'output':record['output'],'tailPolicy':record['tailPolicy'],'verification':record['verification']},indent=2))
