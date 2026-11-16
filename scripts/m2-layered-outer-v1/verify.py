"""Read-only retained bytes; optional admission request rejects this failed specimen."""
from pathlib import Path
import argparse,hashlib,json,sys
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-layered-outer-v1'
ap=argparse.ArgumentParser();ap.add_argument('--require-admission',action='store_true');args=ap.parse_args()
try:
 m=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))
 for row in m['files']+m['dependencies']:
  p=(ROOT/row['path']).resolve()
  if not p.is_relative_to(ROOT):raise ValueError('Unsafe package path: '+row['path'])
  if p.stat().st_size!=row['bytes']or hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:raise ValueError('Frozen identity mismatch: '+row['path'])
 result={'identityPassed':True,'retainedFiles':len(m['files']),'dependencies':len(m['dependencies']),'sourceGeometryAdmission':m['sourceGeometryAdmission'],'runtimeAccepted':m['runtimeAccepted'],'exportersInvoked':False}
 if args.require_admission and not m['sourceGeometryAdmission']:
  result['error']='Rejected source specimen; see generated/source-audit.json and contact-diagnosis.json. Do not install.'
  print(json.dumps(result));sys.exit(2)
 print(json.dumps(result))
except (OSError,ValueError,KeyError)as error:
 print(json.dumps({'identityPassed':False,'error':str(error),'exportersInvoked':False}));sys.exit(1)
