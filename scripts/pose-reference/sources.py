"""Capture public source/license records and verify already-downloaded photo bytes."""
import hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
photo=ROOT/'evidence/real-microphone-pose-v1'
video=ROOT/'evidence/real-video-pose-v1';video.mkdir(exist_ok=True)
rows=[('headphones','A_singer_captivates_the_audience_while_holding_a_microphone_and_wearing_headphones.jpg','a/a5',960),('stage','A_musician_passionately_sings_into_a_microphone_on_stage.jpg','4/44',1280)]
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GamemakePoseReference/1.0 (research prototype)'}),timeout=90) as r:return r.read()
def sha(data):return hashlib.sha256(data).hexdigest()
records=[]
for stem,name,key,width in rows:
    page='https://commons.wikimedia.org/wiki/File:'+name
    (photo/(stem+'-source.html')).write_bytes(get(page))
    url=f'https://thumb.wikimedia.org/wikipedia/commons/thumb/{key}/{name}/{width}px-{name}'
    existing=(photo/(stem+'.jpg')).read_bytes();remote=get(url)
    records.append({'file':stem+'.jpg','source_page':page,'download_url':url,'sha256':sha(existing),'remote_sha256':sha(remote),'exact_byte_match':existing==remote,'creator':'Nenad Stojković / Shixart1985','license':'CC BY 2.0','license_url':'https://creativecommons.org/licenses/by/2.0/','changes':'Commons resized image; analysis overlays and keypoint extraction are separate derivatives','scope':'reference and extraction experiment; no claim of endorsement'})
(photo/'sources.json').write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding='utf-8')
page='https://commons.wikimedia.org/wiki/File:Squats_Wikipedia.webm'
(video/'source.html').write_bytes(get(page))
url='https://upload.wikimedia.org/wikipedia/commons/2/21/Squats_Wikipedia.webm'
dest=video/'squats-original.webm'
if not dest.exists():dest.write_bytes(get(url))
record={'file':dest.name,'source_page':page,'download_url':url,'sha256':sha(dest.read_bytes()),'creator':'CRiles23','license':'CC BY-SA 3.0','license_url':'https://creativecommons.org/licenses/by-sa/3.0/','changes':'original retained; any selected clip, overlays, extracted animation experiment distributed with attribution and CC BY-SA 3.0','scope':'isolated feasibility experiment, not production motion approval'}
(video/'source.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print(json.dumps({'photos':records,'video':record},ensure_ascii=True))
