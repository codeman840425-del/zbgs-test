"""Offline analysis of the immutable CDP recordings; no browser or runtime edits."""
import json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
out={"unit":"milliseconds; sampled CPU, not GPU execution", "profiles":{}, "files":{}}
for name in ["geometry-cold-mouth","geometry-warm-mouth","body-switch-female-to-male"]:
 path=ROOT/(name+".cpuprofile"); raw=path.read_bytes(); d=json.loads(raw)
 nodes={n["id"]:n for n in d["nodes"]}; parent={c:n["id"] for n in d["nodes"] for c in n.get("children",[])}
 times={}; inclusive={}
 for sid,dt in zip(d["samples"],d["timeDeltas"]):
  times[sid]=times.get(sid,0)+dt
  k=sid
  while k in nodes:
   inclusive[k]=inclusive.get(k,0)+dt
   if k not in parent: break
   k=parent[k]
 def stack(k):
  a=[]
  while k in nodes:
   f=nodes[k]["callFrame"]; a.append({"name":f["functionName"],"file":f["url"].split("/")[-1],"line0":f["lineNumber"],"column0":f["columnNumber"]})
   if k not in parent:break
   k=parent[k]
  return a
 log=[]
 for k,n in nodes.items():
  if n["callFrame"]["functionName"]=="getProgramInfoLog":
   s=stack(k); shadow=any(f["name"]=="MT.render" and f["line0"]==4200 for f in s)
   log.append({"pass":"shadow" if shadow else "main-color", "sampledSelfMs":times.get(k,0)/1000,"stack":s})
 out["profiles"][name]={"programInfoLog":log,"programInfoLogTotalMs":sum(x["sampledSelfMs"] for x in log),"topSelf":[{"sampledSelfMs":v/1000,"frame":nodes[k]["callFrame"]} for k,v in sorted(times.items(),key=lambda kv:-kv[1])[:25]],"selectedInclusive":[{"sampledInclusiveMs":inclusive[k]/1000,"frame":n["callFrame"]} for k,n in nodes.items() if (n["callFrame"]["functionName"]=="Hs" and n["callFrame"]["lineNumber"]==87) or (n["callFrame"]["functionName"]=="r" and n["callFrame"]["lineNumber"]==4076)]}
 out["files"][path.name]=hashlib.sha256(raw).hexdigest()
for name in ["report.json","geometry.json","body-switch.json","executed-script.cjs"]:out["files"][name]=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
(ROOT/"analysis.json").write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")
for n,v in out["profiles"].items(): print(n, "programInfoLog",round(v["programInfoLogTotalMs"],3), "selectedInclusive",[(x["frame"]["functionName"],round(x["sampledInclusiveMs"],3)) for x in v["selectedInclusive"]])
