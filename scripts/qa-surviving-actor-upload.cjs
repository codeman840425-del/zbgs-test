// Runs in one page.evaluate call. Only fingerprints and differences leave the page.
async function verifySurvivorUpload() {
  const report = {status:'unobserved',failure:null,actors:[],texture:null,reupload:{calls:[],count:0},
    framebuffer:{fingerprints:{}},glErrors:{}};
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
    Object.assign(report.framebuffer,{width,height,camera:camera.uuid});

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
    function difference() {
      let changedPixels=0,maxChannelDelta=0;
      for (let i=0;i<before.length;i+=4) {
        const delta=Math.max(Math.abs(before[i]-current[i]),Math.abs(before[i+1]-current[i+1]),
          Math.abs(before[i+2]-current[i+2]),Math.abs(before[i+3]-current[i+3]));
        if (delta) { changedPixels++; maxChannelDelta=Math.max(maxChannelDelta,delta); }
      }
      return {changedPixels,maxChannelDelta};
    }

    errors('beforeProbe');
    const chosen = renderWithSampler();
    readFrame('before',before);
    require(chosen,'No visible actor draw exposed a live 2D ImageBitmap sampler');
    report.status='failed';
    const {texture,image,handle,slot,mesh,material}=chosen;
    report.texture={uuid:texture.uuid,sourceUuid:texture.source.uuid,slot,mesh:mesh.name,material:material.name,
      width:image.width,height:image.height,versionBefore:texture.version,sourceVersionBefore:texture.source.version};

    const undoUploads = [];
    let confirmed;
    try {
      for (const name of ['texSubImage2D','texImage2D']) {
        const native = gl[name], own = Object.getOwnPropertyDescriptor(gl,name);
        gl[name] = function (...args) {
          if (this!==gl || args[0]!==gl.TEXTURE_2D || gl.getParameter(gl.TEXTURE_BINDING_2D)!==handle)
            return Reflect.apply(native,this,args);
          const call = {method:name,mipLevel:args[1],sameImageBitmap:args.at(-1)===image,returned:false};
          report.reupload.calls.push(call);
          try { const result = Reflect.apply(native,this,args); call.returned=true; return result; }
          catch (error) { call.error=error.name; throw error; }
        };
        undoUploads.push(()=>{if (own) Object.defineProperty(gl,name,own); else delete gl[name];});
      }
      texture.needsUpdate=true;
      confirmed=renderWithSampler(chosen);
    } finally { for (const restore of undoUploads.reverse()) restore(); }
    report.reupload.count=report.reupload.calls.filter(call=>call.mipLevel===0 && call.sameImageBitmap && call.returned).length;
    report.reupload.samplerStillBound=confirmed?.handle===handle && confirmed.image===image;
    Object.assign(report.texture,{versionAfter:texture.version,sourceVersionAfter:texture.source.version});
    readFrame('afterUpload',current);
    report.framebuffer.afterUpload=difference();

    const visibility = root.visible;
    try {
      root.visible=false;
      renderer.render(scene,camera);
      readFrame('hidden',current);
      report.framebuffer.actorContribution=difference();
    } finally {
      root.visible=visibility;
      report.framebuffer.visibilityRestored=root.visible===visibility;
      renderer.render(scene,camera);
      readFrame('restored',current);
      report.framebuffer.restored=difference();
    }

    require(Object.values(report.glErrors).every(codes=>codes.length===0),'WebGL returned errors during the probe');
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
