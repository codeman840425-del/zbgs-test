import copy
import json
import pathlib
import subprocess
import sys

SCRIPT = pathlib.Path(__file__).with_name('guard.py')
valid = {'tool_name':'collaboration.spawn_agent','tool_input':{
    'task_name':'fixture','model':'gpt-6.1-sol','reasoning_effort':'high','fork_turns':'none',
    'message':'DISPATCH_CONFIG={"difficulty":"complex","reason":"State ownership and async rollback require deep code reasoning"}\nRead-only bounded fixture'}}

def call(event):
    result = subprocess.run([sys.executable,str(SCRIPT)],input=json.dumps(event),text=True,capture_output=True,check=True)
    return json.loads(result.stdout) if result.stdout.strip() else {}

assert call(valid)['hookSpecificOutput'].get('permissionDecision') != 'deny'
cases=[]
for field in ['model','reasoning_effort','fork_turns']:
    bad=copy.deepcopy(valid);bad['tool_input'].pop(field);cases.append(('missing-'+field,bad))
for field,value in [('model','default'),('reasoning_effort','auto'),('fork_turns','all'),('reasoning_effort','low'),('message','task without selection reason')]:
    bad=copy.deepcopy(valid);bad['tool_input'][field]=value;cases.append((field+'-'+value,bad))
for name,event in cases:
    assert call(event)['hookSpecificOutput']['permissionDecision']=='deny',name
for tool in ['spawn_agent','Agent','functions.collaboration.spawn_agent']:
    event=copy.deepcopy(valid);event['tool_name']=tool;assert call(event)['hookSpecificOutput'].get('permissionDecision')!='deny'
assert call({'tool_name':'Bash','tool_input':{'command':'echo fixture'}})=={}
print(json.dumps({'passed':True,'rejectedCases':[name for name,_ in cases],
    'limits':'Synthetic hook stdin/output only. Host invocation, trust and actual effective model remain unverified.'},indent=2))
