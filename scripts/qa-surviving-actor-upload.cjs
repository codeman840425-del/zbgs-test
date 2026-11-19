// Runs in one page.evaluate call. Only fingerprints and differences leave the page.
async function verifySurvivorUpload() {
  const report = {status:'unobserved',failure:null,actors:[],texture:null,reupload:{calls:[],count:0},
    framebuffer:{fingerprints:{},controls:{redraw:{uploadCalls:[]},visibility:{uploadCalls:[]}}},glErrors:{}};
  const hashes = new Map();
  const require = (ok,message) => { if (!ok) throw Error(message); };
  try {
    report.framebuffer.frameTimeMs = await new Promise(requestAnimationFrame);
    // Rendering, upload, visibility control and all readbacks below run synchronously.
    const game = window.__recordConsumer;
    require(game?.ready && game.actors.size===1,'Expected one live actor in the ordinary consumer');
    const actor = game.actors.values().next().value, avatar = actor.avatar, root = avatar.root;
    const {renderer,scene,camera} = game, gl = renderer.getContext();
    const identity = {id:actor.identity.id,recordSha256:actor.recordSha256,bodyType:avatar.profile.bodyType,
      bodySha256:avatar.profile.sha256,root:root.uuid};
    report.actors.push(identity);
    const signed = game.records.find(record=>record.identity.id===identity.id);
    require(signed?.integrity.recordSha256===identity.recordSha256 &&
      signed?.appearanceRecipe.base.sha256===identity.bodySha256 &&
      signed?.appearanceRecipe.base.bodyType===identity.bodyType,'Live actor identity differs from the signed input');
    require(root.parent===scene && root.visible,'Surviving actor is not attached and visible');
    require(gl instanceof WebGL2RenderingContext && !gl.isContextLost() && renderer.autoClear &&
      renderer.getRenderTarget()===null,'Expected the normal WebGL2 game framebuffer');
    require(gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING)===null,'Pixel pack buffer is in use');
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    require(width>0 && height>0 && width*height<=4194304,'Game framebuffer is unavailable or exceeds the diagnostic pixel limit');
    Object.assign(report.framebuffer,{width,height,camera:camera.uuid,
      glState:{samples:gl.getParameter(gl.SAMPLES),dither:gl.isEnabled(gl.DITHER),
        antialias:gl.getContextAttributes()?.antialias??null}});

    function errors(phase) {
      const codes = [];
      for (let i=0;i<16;i++) {
        const code = gl.getError();
        if (code===gl.NO_ERROR) break;
        codes.push(code);
      }
      report.glErrors[phase]=codes;
    }

    // Reuse the material sampler check from the renderer's normal draw. Restore the active GL unit.
    function renderWithSampler(expected = null) {
      let found;
      const undo = [];
      try {
        root.traverseVisible(mesh=>{
          if (!mesh.isMesh || (expected && mesh!==expected.mesh)) return;
          const before = mesh.onAfterRender, own = Object.getOwnPropertyDescriptor(mesh,'onAfterRender');
          mesh.onAfterRender = function (...args) {
            before.apply(this,args);
            const material = args[4];
            if (found || (expected && material!==expected.material) || gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)!==null) return;
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            if (!program) return;
            for (const slot of expected ? [expected.slot] : ['map','shadeMultiplyTexture','normalMap','emissiveMap']) {
              const texture = material[slot] ?? material.uniforms?.[slot]?.value;
              const image = texture?.image;
              if (!texture?.isTexture || (expected && texture!==expected.texture) ||
                  !(image instanceof ImageBitmap) || image.width===0 || image.height===0) continue;
              const handle = renderer.properties.has(texture) && renderer.properties.get(texture).__webglTexture;
              if (!handle || !gl.isTexture(handle)) continue;
              const location = gl.getUniformLocation(program,slot);
              if (location===null) continue;
              const unit = gl.getUniform(program,location);
              if (!Number.isInteger(unit)) continue;
              const active = gl.getParameter(gl.ACTIVE_TEXTURE);
              try {
                gl.activeTexture(gl.TEXTURE0+unit);
                if (gl.getParameter(gl.TEXTURE_BINDING_2D)===handle) found={mesh,material,slot,texture,image,handle};
              } finally { gl.activeTexture(active); }
              if (found) break;
            }
          };
          undo.push(()=>{if (own) Object.defineProperty(mesh,'onAfterRender',own); else delete mesh.onAfterRender;});
        });
        renderer.render(scene,camera);
      } finally { for (const restore of undo.reverse()) restore(); }
      return found;
    }

    const before = new Uint8Array(width*height*4), current = new Uint8Array(before.length);
    function readFrame(phase, pixels) {
      require(renderer.getRenderTarget()===null && gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)===null &&
        gl.drawingBufferWidth===width && gl.drawingBufferHeight===height,'Game framebuffer changed during readback');
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      errors(phase);
      // Web Crypto copies the BufferSource on invocation. No read waits across animation frames.
      hashes.set(phase,crypto.subtle.digest('SHA-256',pixels));
    }
    function difference(reference = before) {
      let changedPixels=0,maxChannelDelta=0;
      const firstDifferences=[];
      for (let i=0;i<reference.length;i+=4) {
        const delta=Math.max(Math.abs(reference[i]-current[i]),Math.abs(reference[i+1]-current[i+1]),
          Math.abs(reference[i+2]-current[i+2]),Math.abs(reference[i+3]-current[i+3]));
        if (delta) {
          changedPixels++; maxChannelDelta=Math.max(maxChannelDelta,delta);
          if (firstDifferences.length<4) firstDifferences.push({x:(i/4)%width,y:Math.floor(i/4/width),
            reference:Array.from(reference.subarray(i,i+4)),observed:Array.from(current.subarray(i,i+4))});
        }
      }
      return {changedPixels,maxChannelDelta,firstDifferences};
    }

    function observeUploads({handle,image}, calls, run) {
      const undo = [];
      try {
        for (const name of ['texSubImage2D','texImage2D']) {
          const native = gl[name], own = Object.getOwnPropertyDescriptor(gl,name);
          gl[name] = function (...args) {
            if (this!==gl || args[0]!==gl.TEXTURE_2D || gl.getParameter(gl.TEXTURE_BINDING_2D)!==handle)
              return Reflect.apply(native,this,args);
            const call = {method:name,mipLevel:args[1],sameImageBitmap:args.at(-1)===image,returned:false};
            calls.push(call);
            try { const result = Reflect.apply(native,this,args); call.returned=true; return result; }
            catch (error) { call.error=error.name; throw error; }
          };
          undo.push(()=>{if (own) Object.defineProperty(gl,name,own); else delete gl[name];});
        }
        return run();
      } finally { for (const restore of undo.reverse()) restore(); }
    }

    function hideAndRestore(hiddenPhase, restoredPhase, evidence) {
      const visibility = root.visible;
      try {
        root.visible=false;
        renderer.render(scene,camera);
        readFrame(hiddenPhase,current);
        evidence.actorContribution=difference();
      } finally {
        root.visible=visibility;
        evidence.visibilityRestored=root.visible===visibility;
        renderer.render(scene,camera);
        readFrame(restoredPhase,current);
        evidence.restored=difference();
      }
    }

    errors('beforeProbe');
    const chosen = renderWithSampler();
    readFrame('before',before);
    require(chosen,'No visible actor draw exposed a live 2D ImageBitmap sampler');
    report.status='failed';
    const {texture,image,handle,slot,mesh,material}=chosen;
    report.texture={uuid:texture.uuid,sourceUuid:texture.source.uuid,slot,mesh:mesh.name,material:material.name,
      width:image.width,height:image.height,versionBefore:texture.version,sourceVersionBefore:texture.source.version};

    // Keep the original baseline for every strict comparison. These are controls, not alternative baselines.
    const {redraw,visibility}=report.framebuffer.controls;
    const controlSampler=observeUploads(chosen,redraw.uploadCalls,()=>renderWithSampler(chosen));
    readFrame('noOpRedraw',current);
    redraw.difference=difference();
    redraw.samplerStillBound=controlSampler?.handle===handle && controlSampler.image===image;
    observeUploads(chosen,visibility.uploadCalls,()=>hideAndRestore('noUploadHidden','noUploadRestored',visibility));
    const controlRestored = current.slice();

    const confirmed=observeUploads(chosen,report.reupload.calls,()=>{
      texture.needsUpdate=true;
      return renderWithSampler(chosen);
    });
    report.reupload.count=report.reupload.calls.filter(call=>call.mipLevel===0 && call.sameImageBitmap && call.returned).length;
    report.reupload.samplerStillBound=confirmed?.handle===handle && confirmed.image===image;
    Object.assign(report.texture,{versionAfter:texture.version,sourceVersionAfter:texture.source.version});
    readFrame('afterUpload',current);
    report.framebuffer.afterUpload=difference();
    report.framebuffer.controls.afterUploadComparedToNoUploadRestored=difference(controlRestored);

    hideAndRestore('hidden','restored',report.framebuffer);

    require(Object.values(report.glErrors).every(codes=>codes.length===0),'WebGL returned errors during the probe');
    require(redraw.uploadCalls.length===0 && visibility.uploadCalls.length===0 && redraw.samplerStillBound,
      'No-upload controls did not preserve the original live sampler');
    require(redraw.difference.changedPixels===0,'No-op redraw changed the framebuffer');
    require(visibility.actorContribution.changedPixels>0,'The no-upload hidden control did not change the framebuffer');
    require(visibility.visibilityRestored && visibility.restored.changedPixels===0,'Framebuffer did not restore in the no-upload control');
    require(report.reupload.count===1 && report.reupload.calls.length===1 && report.reupload.samplerStillBound,
      'One successful level-zero upload of the original bitmap to the existing sampler was not observed');
    require(report.framebuffer.afterUpload.changedPixels===0,'Framebuffer differs after the texture upload');
    require(report.framebuffer.actorContribution.changedPixels>0,'The visible actor produced no framebuffer difference');
    require(report.framebuffer.visibilityRestored && report.framebuffer.restored.changedPixels===0,'Framebuffer did not restore');
    report.status='verified';
  } catch (error) { report.failure=String(error.message??error); }
  for (const [phase,promise] of hashes) {
    try {
      const digest = new Uint8Array(await promise);
      report.framebuffer.fingerprints[phase]=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
    } catch (error) {
      report.status='failed';
      report.failure ??= 'Framebuffer SHA-256 failed: '+error.message;
    }
  }
  return report;
}

module.exports = {verifySurvivorUpload};
