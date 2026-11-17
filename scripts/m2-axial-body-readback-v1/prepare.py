"""Pin full numerical source and original contact definitions without executing them."""
import json

from common import BASE,ROOT,io,load,mixtures,pinned,require
from qa import run

spec,source,records,raw,contract=load()
functions,identities=mixtures.original_contacts()
old55=json.loads(pinned(spec['head55Result']).read_bytes())
for old in old55['functionIdentities']:
    row=next(r for r in identities if r['function']==old['name'])
    require(row['sha256']==old['resource']['sha256'] and row['astSha256']==old['ASTSHA256'],'Original strict function differs')
old10=json.loads(pinned(spec['head10Result']).read_bytes())
require(old10['contactFunctions']==identities,'Mixed contact functions differ')
require(len(old10['rows'])==10 and old55['statesExpected']==old55['statesCompleted']==55,'Original contact receipts incomplete')
qa=run();io.save(BASE/'qa-report.json',qa)
io.save(BASE/'prepared.json',{'schema':'axial-body-readback-preparation-v1','status':'prepared-no-contact-execution',
    'spec':io.ref(BASE/'spec.json'),'numericalAudit':spec['compositionAudit'],'records':len(records),
    'sourceEndpointOccurrences':len(raw['sourceEndpointsM']),'qa':io.ref(BASE/'qa-report.json'),
    'originalFunctions':identities,'candidateCollisionCoordinatesCompared':False,'contactsExecuted':False,
    'knownOhFailureMustRemain':True,'runtimeAccepted':False})
print(json.dumps({'status':'prepared-no-contact-execution','checks':len(qa['checks'])}))
