"""Validate a saved MCP status record against the exact expected native file."""
from pathlib import Path,PureWindowsPath
import json,sys
from prepare import payload
status=payload(Path(sys.argv[1]));expected=sys.argv[2]
assert status.get('modelOpen') is True and status.get('ready') is True,status
actual=status.get('currentFile')
assert isinstance(actual,str) and actual,'No current native path'
assert PureWindowsPath(actual)==PureWindowsPath(expected),(actual,expected)
print(json.dumps({'ready':True,'currentFile':actual,'dirty':status.get('dirty'),'exactExpectedPath':True}))
