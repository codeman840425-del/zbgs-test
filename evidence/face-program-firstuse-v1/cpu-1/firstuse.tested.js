import { REVISION } from "three";

// Deliberately pinned to WebGLProgram/WebGLProperties in Three 0.187.0.
// This prepares only the main-color programs owned by staging materials.
// It neither renders nor changes renderer.debug/onShaderError.
export async function prepareFaceProgramFirstUse({ renderer, materials, signal, compile }) {
  if (REVISION !== "187") throw Error("Face program preparation requires Three 187");
  const properties = renderer.properties, gl = renderer.getContext();
  const check = () => {
    if (signal.aborted) throw signal.reason || Error("Face preparation cancelled");
    if (renderer.properties !== properties || renderer.getContext() !== gl || gl.isContextLost()) {
      throw Error("Face preparation WebGL context changed");
    }
    if (renderer.debug.checkShaderErrors !== true) throw Error("Face preparation requires shader diagnostics");
  };
  const abortable = promise => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || Error("Face preparation cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
  const task = () => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason || Error("Face preparation cancelled")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 0);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
  });
  check();
  // compileAsync cannot itself be cancelled. Disposing its owned staging
  // materials removes their properties, so Three's pending readiness poll ends.
  await abortable(compile());
  check();
  const programs = new Map();
  for (const material of materials) {
    const variants = properties.get(material).programs;
    if (!(variants instanceof Map) || !variants.size) throw Error("Face staging material has no compiled programs");
    for (const program of variants.values()) {
      if (typeof program.isReady !== "function" || typeof program.getUniforms !== "function" || !program.program) {
        throw Error("Face staging program interface invalid");
      }
      programs.set(program, program.program);
    }
  }
  const valid = () => {
    check();
    for (const [program, handle] of programs) {
      if (program.program !== handle) throw Error("Face staging program was released");
    }
  };
  // compileAsync only checks currentProgram; a transparent DoubleSide material
  // can own multiple variants. All must be ready before any first-use work.
  while (true) {
    valid();
    let ready = true;
    for (const program of programs.keys()) if (!program.isReady()) ready = false;
    if (ready) break;
    await task();
  }
  for (const program of programs.keys()) {
    // A real task, not a microtask: old scene/input get an opportunity between
    // programs. A single getUniforms/onFirstUse is still synchronous/uninterruptible.
    await task();
    valid();
    program.getUniforms();
    valid();
    if (program.diagnostics?.runnable === false) throw Error("Face staging shader link failed");
  }
}
