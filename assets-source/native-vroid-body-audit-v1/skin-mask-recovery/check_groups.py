"""Read saved MCP evidence only; reject unexpected source or group changes."""
from pathlib import Path
import hashlib,json,sys
from prepare import ROOT,OUT,payload
def main():
    phase,path=sys.argv[1:]
    assert phase in ('before','after','reopened')
    spec=json.loads((OUT/'prepared.json').read_text(encoding='utf-8'))
    source=Path(spec['source']['path'])
    assert hashlib.sha256(source.read_bytes()).hexdigest()==spec['source']['sha256']
    actual=payload(Path(path))
    expected=spec['beforeGroups'] if phase=='before' else spec['afterExpectedGroups']
    normalize=lambda rows:sorted(rows,key=lambda row:row['id'])
    assert normalize(actual)==normalize(expected),'Unexpected group identity/type/resource change; STOP, do not retry removal'
    print(json.dumps({'phase':phase,'groups':len(actual),'exact':True,'sourceFileUnchanged':True}))
if __name__=='__main__':main()
