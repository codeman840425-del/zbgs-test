// A prepared character belongs to the WebGL context that prepared it. A lost
// and restored context is still a different lifetime, even if the same canvas
// and JavaScript renderer remain alive.
export function createRenderContextGuard(renderer) {
  const controller = new AbortController();
  const canvas = renderer.domElement;
  const failure = () => new Error('图形上下文已失效，已保留原人物；画面恢复后请重试');
  const invalidate = () => controller.abort();
  canvas.addEventListener('webglcontextlost', invalidate);
  canvas.addEventListener('webglcontextrestored', invalidate);
  function check() {
    if (controller.signal.aborted || renderer.getContext().isContextLost()) throw failure();
  }
  return {
    check,
    wait(start) {
      return new Promise((resolve, reject) => {
        const signal = controller.signal;
        const abort = () => reject(failure());
        const cleanup = () => signal.removeEventListener('abort', abort);
        try {
          check();
          signal.addEventListener('abort', abort, {once:true});
          // Observe both late fulfillment and rejection after cancellation.
          Promise.resolve(start()).then(value => {
            try { check(); resolve(value); } catch (error) { reject(error); }
          }, reject).finally(cleanup);
        } catch (error) { cleanup(); reject(error); }
      });
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', invalidate);
      canvas.removeEventListener('webglcontextrestored', invalidate);
    },
  };
}
