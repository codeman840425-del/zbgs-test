"""Build the local review page from actual captured evidence, without publishing."""
from pathlib import Path
import json
from html import escape
root = Path(__file__).resolve().parents[1]
out = root / 'output/review'
out.mkdir(parents=True, exist_ok=True)
base = root / 'output/playwright/acceptance'
for version in ('before', 'after'):
    assert (base / version / 'outfit-walk-sit.webm').is_file(), f'Missing {version} recording'
    assert (base / version / 'recording.json').is_file(), f'Missing {version} manifest'
data = {v: json.loads((base/v/'recording.json').read_text(encoding='utf-8')) for v in ('before','after')}
buttons=''
for i, s in enumerate(data['after']['segments']):
    a=s['wallSeconds']; b=data['before']['segments'][i]['wallSeconds']
    buttons+=f'<button onclick="seek({b},{a})">{escape(s["name"])}</button>'
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本轮角色修复对照</title>
<style>body{font:16px/1.7 system-ui,sans-serif;background:#f2f3ed;color:#183c35;margin:24px auto;max-width:1500px;padding:0 18px}h1{font-size:27px}a{color:#276b61}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}video,img{width:100%;background:#e3e8df;border-radius:10px}button{font:inherit;padding:8px 12px;border:1px solid #b9ccc2;background:white;color:#214b42;border-radius:7px;cursor:pointer;margin:4px}.note{color:#586a62}nav{margin:14px 0}.status{background:white;border-radius:10px;padding:15px}small{display:block}@media(max-width:850px){.pair{grid-template-columns:1fr}}</style>
<h1>一个角色：服装、走路与坐起修复对照</h1>
<p><a href="http://127.0.0.1:4180/">打开当前固定样机</a> · <a href="http://127.0.0.1:5173/">开发入口</a> · <a href="../../docs/CURRENT-REPAIR.md">修复与复现说明</a></p>
<p class="status">实时3D：Phaser＋Three.js＋VRM；Rigby2D未参与。两边使用同角色、同服装、同镜头、同路径和0.85 m/s移动速度。蓝色是新增裙体，原上衣和短裤保留。左边是本轮服装修补前候选，不是原二维游戏。</p>
<div class="pair"><section><h2>修复前</h2><video id="before" controls muted preload="metadata" src="../playwright/acceptance/before/outfit-walk-sit.webm"></video></section><section><h2>当前候选</h2><video id="after" controls muted preload="metadata" src="../playwright/acceptance/after/outfit-walk-sit.webm"></video></section></div>
<nav><button onclick="playBoth()">同时播放</button><button onclick="pauseBoth()">同时暂停</button><button onclick="rate(1)">正常速度</button><button onclick="rate(.25)">0.25倍速复查</button></nav>
<p class="note">按以下场景跳转到各自录像的对应阶段。动作/步距修正会改变相位，不能把整个录像的绝对时间当作相同动作帧；正常速度是流畅度验收依据，慢放用于定位。</p><nav>BUTTONS</nav>
<h2>同视角的服装覆盖</h2><div class="pair"><figure><img src="../playwright/garment-diagnosis/front.png"><figcaption>修复前：静止时上衣穿出裙体</figcaption></figure><figure><img src="../playwright/acceptance/after/1-idle-正面.png"><figcaption>当前：保留原衣片，修正裙体接触</figcaption></figure></div>
<h2>分层诊断与边界</h2><p>样机内可暂停、单步、慢放，切正/侧/背视角及原始重定向/IK/骨盆修正。原模型胸腹皮肤缺面，基础动作模式保留必要上衣和短裤，用纯色看动作，不伪装为完整裸模。完整穿衣验收需开启附加动态。</p>
<p>当前仅检验这个角色和两套现有外观。裙体无自碰撞，通用高矮胖瘦适配、完整人体美术资源、批量衣库、多人服务器未完成。完整录屏供实际观感判断，取样数值不保证所有时刻和所有组合无穿插。</p>
<script>const b=document.querySelector('#before'),a=document.querySelector('#after');function pauseBoth(){b.pause();a.pause()}function playBoth(){b.play();a.play()}function seek(x,y){pauseBoth();b.currentTime=x;a.currentTime=y}function rate(v){b.playbackRate=v;a.playbackRate=v}</script></html>'''.replace('BUTTONS',buttons)
(out/'index.html').write_text(html,encoding='utf-8')
print(out/'index.html')
