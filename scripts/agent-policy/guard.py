"""Codex PreToolUse gate: require an explicit, reasoned spawn configuration.

No model call, source edit, or permission change. A command hook must be trusted
and actually invoked by the host; this script cannot enforce skipped hooks.
"""
import json
import datetime
import pathlib
import re
import sys

EFFORTS = {
    "gpt-6.1-sol": ["low", "medium", "high", "xhigh", "max", "ultra"],
    "gpt-6.1-terra": ["low", "medium", "high", "xhigh", "max", "ultra"],
    "gpt-6-astra": ["low", "medium", "high", "xhigh", "max", "ultra"],
    "gpt-6-sol": ["low", "medium", "high", "xhigh", "max", "ultra"],
    "gpt-6-luna": ["low", "medium", "high", "xhigh", "max"],
}


def check(event):
    name = event.get("tool_name", "")
    if not re.fullmatch(r"(?:Agent|(?:.*[.:/])?spawn_agent)", name):
        return None
    data = event.get("tool_input")
    if not isinstance(data, dict):
        raise ValueError("spawn_agent needs JSON object arguments")
    model, effort = data.get("model"), data.get("reasoning_effort")
    if model not in EFFORTS:
        raise ValueError("Choose an explicit currently supported model; default/inheritance is forbidden")
    if effort not in EFFORTS[model]:
        raise ValueError("Choose an explicit reasoning_effort supported by the selected model")
    if data.get("fork_turns") != "none":
        raise ValueError("Use fork_turns=none: this tool's full-history fork cannot accept model overrides")
    message = data.get("message", "")
    if not isinstance(message, str):
        raise ValueError("message must be text")
    headers = re.findall(r"^DISPATCH_CONFIG=(.+)$", message, re.MULTILINE)
    if len(headers) != 1:
        raise ValueError('Include one DISPATCH_CONFIG={"difficulty":"routine|standard|complex","reason":"..."} line in message')
    selection = json.loads(headers[0])
    if not isinstance(selection, dict) or selection.get("difficulty") not in ["routine", "standard", "complex"]:
        raise ValueError("Dispatch difficulty must be routine, standard or complex")
    if not isinstance(selection.get("reason"), str) or len(selection["reason"].strip()) < 12:
        raise ValueError("Record a concrete reason for the model AND reasoning depth (at least 12 characters)")
    minimum = {"routine": 0, "standard": 1, "complex": 2}[selection["difficulty"]]
    if EFFORTS[model].index(effort) < minimum:
        raise ValueError("This difficulty requires at least medium (standard) or high (complex) effort")
    return {"model": model, "reasoning_effort": effort, "difficulty": selection["difficulty"]}


def main():
    event = {}
    result = {}
    try:
        event = json.load(sys.stdin)
        if not isinstance(event, dict):
            raise ValueError("Hook input must be an object")
        selected = check(event)
        if selected:
            result = {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                "additionalContext": "Explicit subagent configuration checked: " + json.dumps(selected) +
                ". This checks requested arguments, not actual provider execution or task-fit judgment."}}
    except Exception as error:
        # Supported blocking output; no ask/continue:false/automatic rewriting.
        result = {"hookSpecificOutput": {"hookEventName": "PreToolUse",
            "permissionDecision": "deny", "permissionDecisionReason": "Subagent configuration rejected: " + str(error)}}
    # Installed hook only: log small scalar metadata, never task text/transcripts.
    if pathlib.Path(__file__).parent.name == 'explicit-subagent':
        data=event.get('tool_input',{}) if isinstance(event,dict) else {}
        data=data if isinstance(data,dict) else {}
        record={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'tool':event.get('tool_name') if isinstance(event,dict) else None,
                'toolUseId':event.get('tool_use_id') if isinstance(event,dict) else None,
                'model':data.get('model'),'reasoningEffort':data.get('reasoning_effort'),
                'decision':result.get('hookSpecificOutput',{}).get('permissionDecision','continue')}
        try:
            with pathlib.Path(__file__).with_name('audit.jsonl').open('a',encoding='utf-8') as log:
                log.write(json.dumps(record)+'\n')
        except OSError as error:
            result={'hookSpecificOutput':{'hookEventName':'PreToolUse','permissionDecision':'deny',
                    'permissionDecisionReason':'Dispatch audit could not be written: '+str(error)}}
    if result:
        print(json.dumps(result))


if __name__ == "__main__":
    main()
