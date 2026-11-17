"""Stage exact native grip data for fixed-candidate browser inspection.

Does not claim visual admission, change old fits, or relax source identities.
"""
import hashlib, json, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets-source/native-live-accessory-fit-v1'
PUBLIC = ROOT / 'prototype/public/assets/native-live-accessory-fit-v1'
MANIFEST = ROOT / 'prototype/public/assets/m1c/grips/manifest.json'
FIT_JS = ROOT / 'prototype/src/microphone-presentation-fits.js'
def sha(data): return hashlib.sha256(data).hexdigest()
def encode(data): return (json.dumps(data, ensure_ascii=False, indent=2)+'\n').encode('utf8')

def main():
    index=json.loads((SRC/'runtime-candidate-index.json').read_bytes())
    readback=json.loads((SRC/'vrm-readback.json').read_bytes())
    assert readback['passed'] and len(readback['cases'])==4
    original_manifest=MANIFEST.read_bytes(); manifest=json.loads(original_manifest)
    original_js=FIT_JS.read_bytes(); text=original_js.decode('utf8')
    prefix,serialized=text.split('export const MICROPHONE_PRESENTATION_FITS = ',1)
    fits=json.loads(serialized.rstrip().removesuffix(';'))
    pending={}; reports=[]
    for row in index['profiles']:
        ident=row['id']; raw=(SRC/'runtime-candidate'/f'{ident}.json').read_bytes()
        presentation_bytes=(SRC/'presentation'/f'{ident}.json').read_bytes()
        assert sha(raw)==row['sha256'] and sha(presentation_bytes)==row['presentationSha256']
        source=json.loads(raw); presentation=json.loads(presentation_bytes)
        body=source['targetBodySha256']; mic=presentation['microphoneReference']
        assert len(body)==64 and body==presentation['targetBodySha256']==presentation['mouth']['sourceSha256']
        assert any(x['sourceSha256']==body and x['passed'] for x in readback['cases'])
        assert sha((ROOT/mic['source']).read_bytes())==mic['sha256']
        profile={'schema':'zbgs-grip-profile-v1','id':'native-'+ident+'-grip-v1',
                 'compatibleAvatarSha256':body,'accessoryId':'studio-microphone-v1',
                 'compatibleAccessorySha256':mic['sha256'],'fitVersion':'native-vrm1-hand-source-v1',
                 'method':'Source hand fit, actual 15 normalized fingers and raw skinned loader readback',
                 **source['grip'],'sourceCandidateSha256':sha(raw),
                 'status':row['status'],'limits':['Fixed browser candidate; no visual/contact-free acceptance.',
                     'Male source fit retains sampled handle penetration; inspect actual grip before publication.']}
        data=encode(profile); dest=PUBLIC/(ident+'.json'); pending[dest]=data
        entry={'id':profile['id'],'compatibleAvatarSha256':body,'accessoryId':profile['accessoryId'],
               'accessorySha256':mic['sha256'],'url':'/assets/native-live-accessory-fit-v1/'+dest.name,
               'bytes':len(data),'sha256':sha(data)}
        old=next((e for e in manifest['items'] if e['compatibleAvatarSha256']==body),None)
        if old is not None and old!=entry: raise ValueError('Existing grip registry conflict '+ident)
        if old is None: manifest['items'].append(entry)
        fit={'id':'native-microphone-use-'+ident+'-v1','bodySha256':body,
             'microphoneSha256':mic['sha256'],'anchorSourceSha256':sha(presentation_bytes),
             'mouthRawHeadLocal':presentation['mouth']['rawHeadLocal'],
             'capsuleLocal':mic['grilleFrontPoleLocal'],
             'speakingTipOffset':[-.035,-.055,.09],'carryWristChestOffset':[-.22,-.18,.24],
             'transitionRate':10}
        if body in fits and fits[body]!=fit: raise ValueError('Existing presentation fit conflict '+ident)
        fits[body]=fit; reports.append({'body':body,'sourceCandidateSha256':sha(raw),'runtime':entry,
            'purposeOffsets':'Existing purpose-space defaults, subject to actual native grip inspection'})
    # Check all immutable resource conflicts before changing any file.
    for dest,data in pending.items():
        if dest.exists() and dest.read_bytes()!=data: raise ValueError('Conflicting resource '+str(dest))
    if MANIFEST.read_bytes()!=original_manifest or FIT_JS.read_bytes()!=original_js: raise ValueError('Concurrent registry edit')
    PUBLIC.mkdir(parents=True,exist_ok=True)
    for dest,data in pending.items():
        if not dest.exists(): dest.write_bytes(data)
    new_js=(prefix+'export const MICROPHONE_PRESENTATION_FITS = '+json.dumps(fits,indent=2)+';\n').encode('utf8')
    for dest,data in [(FIT_JS,new_js),(MANIFEST,encode(manifest))]:
        if dest.read_bytes()==data: continue
        tmp=dest.with_name(dest.name+'.native-stage.tmp'); tmp.write_bytes(data); os.replace(tmp,dest)
    out=ROOT/'evidence/native-live-accessory-fit-v1';out.mkdir(exist_ok=True)
    (out/'stage.json').write_bytes(encode({'status':'fixed-browser-candidate-only','profiles':reports,
        'visualAccepted':False,'oldGripsPreserved':True}))
    print(json.dumps({'profiles':len(reports),'status':'fixed-browser-candidate-only'}))

if __name__=='__main__': main()
