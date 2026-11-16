"""User-run installation: merge hook definition, preserve other hooks and backup.
Does NOT grant hook trust or change sandbox/approval settings.
"""
import argparse
import base64
import datetime
import json
import pathlib
import shutil
import sys

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--codex-dir',type=pathlib.Path,default=pathlib.Path.home()/'.codex')
p.add_argument('--install',action='store_true',help='Actually install; otherwise preview only')
a=p.parse_args();root=a.codex_dir.resolve();target=root/'hooks'/'explicit-subagent'/'guard.py'
config=root/'hooks.json'
existing=json.loads(config.read_text(encoding='utf-8-sig')) if config.exists() else {}
if not isinstance(existing,dict):raise ValueError('Existing hooks.json is not an object; no changes made')
groups=existing.setdefault('hooks',{}).setdefault('PreToolUse',[])
marker='Require explicit subagent model and reasoning'
quote_ps=lambda value: "'"+value.replace("'","''")+"'"
invoke='& '+quote_ps(pathlib.Path(sys.executable).as_posix())+' '+quote_ps(target.as_posix())+'; exit $LASTEXITCODE'
# Avoid ambiguous quoted executable strings in a PowerShell command expression.
# EncodedCommand contains code only, no user data or credentials. Stdin remains
# available for the hook JSON. It also survives an outer cmd.exe shell.
encoded=base64.b64encode(invoke.encode('utf-16-le')).decode('ascii')
command='powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand '+encoded
entry={'matcher':r'^(?:Agent|(?:.*[.:/])?spawn_agent)$','hooks':[{'type':'command','command':command,
    'commandWindows':command,'timeout':10,'statusMessage':marker}]}
# Only remove our own exact single-handler entry, preserving all other policies.
matches=[i for i,g in enumerate(groups) if len(g.get('hooks',[]))==1 and g['hooks'][0].get('statusMessage')==marker]
if len(matches)>1:raise ValueError('Multiple existing policy entries: inspect manually; no changes made')
if matches:groups[matches[0]]=entry
else:groups.append(entry)
print(json.dumps({'mode':'install' if a.install else 'preview','targetScript':str(target),
    'targetConfig':str(config),'addedHook':entry,'trust':'Not granted; review in Codex Settings > Hooks or CLI /hooks'},indent=2))
if a.install:
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    if config.exists():shutil.copy2(config,config.with_name('hooks.json.before-explicit-subagent-'+stamp))
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():shutil.copy2(target,target.with_name('guard.py.before-'+stamp))
    shutil.copy2(pathlib.Path(__file__).with_name('guard.py'),target)
    temporary=config.with_name('hooks.json.explicit-subagent.tmp')
    with temporary.open('x',encoding='utf-8') as f:json.dump(existing,f,ensure_ascii=False,indent=2)
    temporary.replace(config)
    print('Installed. Hook trust and live interception have NOT been verified.')
