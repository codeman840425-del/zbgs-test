"""Sequential real-browser production chain against one fixed build."""
import pathlib,json,subprocess,argparse
p=argparse.ArgumentParser();p.add_argument('--dist',required=True);p.add_argument('--out',required=True);a=p.parse_args()
r=pathlib.Path(__file__).resolve().parents[1];e=pathlib.Path(a.out).resolve();d=pathlib.Path(a.dist).resolve()
(e/'requests').mkdir(parents=True,exist_ok=False);(e/'results').mkdir()
for n in ['create-native-male','create-native-female']:(e/'requests'/f'{n}.json').write_bytes((r/'evidence/m2-production-dev-v1/requests'/f'{n}.json').read_bytes())
(e/'requests/query-native-male.json').write_text(json.dumps({'schema':'character-production-request-v1','operation':'query','bodyType':'native-male-7586-v1'}),encoding='utf-8')
def run(n):
 cmd=['node','scripts/character-production-cli.cjs','--dist',str(d),'--request',str(e/'requests'/f'{n}.json'),'--out',str(e/'results'/({'create-native-male':'native-male-created','edit-native-male':'native-male-edited','create-native-female':'native-female-created'}.get(n,n)+'.json')),'--evidence',str(e/n)]
 result=subprocess.run(cmd,cwd=r,capture_output=True);(e/f'{n}.receipt.txt').write_bytes(result.stdout);(e/f'{n}.stderr.txt').write_bytes(result.stderr);print(n,result.returncode,result.stdout.decode('utf-8',errors='replace'),flush=True)
 if result.returncode:raise RuntimeError(result.stderr.decode('utf-8',errors='replace'))
run('query-native-male');run('create-native-male')
record=json.loads((e/'results/native-male-created.json').read_text(encoding='utf-8'))
(e/'requests/edit-native-male.json').write_text(json.dumps({'schema':'character-production-request-v1','operation':'edit','record':record,'edits':[{'domain':'appearance','values':{'eyebrowColor':'original'}},{'domain':'liveAccessory','kind':'glasses','enabled':False}]},ensure_ascii=False),encoding='utf-8')
run('edit-native-male');run('create-native-female')
