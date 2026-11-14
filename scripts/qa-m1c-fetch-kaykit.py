"""Recover Kay Lousberg's free animation ZIP through the official no-payment flow."""
import argparse, hashlib, http.cookiejar, json, pathlib, re, urllib.parse, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
TARGET=ROOT/'analysis/assets/KayKit-Character-Animations-Free-1.1.zip'
EXPECTED='65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f'
BASE='https://kaylousberg.itch.io/kaykit-character-animations'
ROW='Free 1.1'
p=argparse.ArgumentParser();p.add_argument('--ual2',action='store_true');args=p.parse_args()
if args.ual2:
    TARGET=ROOT/'analysis/assets/UAL2-Standard.zip';EXPECTED='4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68'
    BASE='https://quaternius.itch.io/universal-animation-library-2';ROW='Universal Animation Library 2[Standard].zip'
if TARGET.exists():
    data=TARGET.read_bytes()
else:
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def get(url):
        with opener.open(url,timeout=60)as response:return response.read()
    def csrf(page):return re.search(r'<meta name="csrf_token" value="([^"]+)"',page).group(1)
    def post(url,token,referer):
        request=urllib.request.Request(url,data=urllib.parse.urlencode({'csrf_token':token}).encode(),headers={'Referer':referer})
        with opener.open(request,timeout=60)as response:return json.loads(response.read())
    page=get(BASE+'/purchase').decode();free=post(BASE+'/download_url',csrf(page),BASE+'/purchase')['url'];page=get(free).decode()
    # Only the explicitly free row, no paid blend source or access bypass.
    from bs4 import BeautifulSoup
    dom=BeautifulSoup(page,'html.parser');candidates=[]
    for control in dom.select('[data-upload_id]'):
        row=control
        for _ in range(5):
            if ROW in row.get_text():candidates.append(control);break
            row=row.parent
    assert len(candidates)==1,'Free tier not uniquely available; inspect upstream'
    upload=candidates[0]['data-upload_id']
    url=post(BASE+'/file/'+upload+'?source=game_download',csrf(page),free)['url'];data=get(url)
sha=hashlib.sha256(data).hexdigest()
if EXPECTED:assert sha==EXPECTED,'Upstream changed; preserve existing inputs and re-audit'
z=zipfile.ZipFile(__import__('io').BytesIO(data))
if not TARGET.exists():TARGET.parent.mkdir(parents=True,exist_ok=True);TARGET.write_bytes(data)
print(json.dumps({'path':str(TARGET),'bytes':len(data),'sha256':sha,'members':z.namelist()},indent=2))
