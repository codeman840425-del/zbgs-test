// Geometry-only Node adapter. Texture decoding/rendering is deliberately absent;
// original bytes, GLTFLoader, VRM normalization, equipment and motion code run.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {loadFoundationAvatar} from '../prototype/src/foundation-avatar.js';
import {loadRetargetedMotions} from '../prototype/src/motion-source.js';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nativeFetch=globalThis.fetch,NativeRequest=globalThis.Request;
globalThis.self=globalThis;
globalThis.window={location:{href:'http://geometry.local/'}};
globalThis.ProgressEvent=class extends Event{constructor(type,init={}){super(type);Object.assign(this,init);}};
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.Request=class extends NativeRequest{constructor(input,init){super(typeof input==='string'&&input.startsWith('/')?'http://geometry.local'+input:input,init);}};
globalThis.fetch=async(input,init)=>{const url=input instanceof URL?input:typeof input==='string'?new URL(input,'http://geometry.local/'):new URL(input.url);if(url.hostname!=='geometry.local')return nativeFetch(input,init);const file=path.resolve(project,'prototype/public','.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.join(project,'prototype/public')+path.sep))throw Error('Asset escapes project');const data=await fs.readFile(file);return new Response(data,{headers:{'content-length':String(data.length)}});};
export async function loadGeometryAvatar(bodyType){const scene=new THREE.Scene(),avatar=await loadFoundationAvatar({scene,bodyType});avatar.setDebugBody(true);avatar.setDynamics(false);const motions=await loadRetargetedMotions(avatar.vrm);return {avatar,motions,scene};}
export {THREE};
