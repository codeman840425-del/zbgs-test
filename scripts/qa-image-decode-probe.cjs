// Serialized by Playwright into each document realm. All recorded values are metadata.
function installDecodeProbe(options = {}) {
  const scope = window;
  if (Object.hasOwn(scope,'__imageDecodeProbe')) return;

  const requestedLimit = options?.eventLimit;
  const eventLimit = Number.isSafeInteger(requestedLimit) ? Math.min(8192,Math.max(0,requestedLimit)) : 4096;
  const events = [];
  const counts = Object.fromEntries([
    'mark','bitmap-start','bitmap-end','bitmap-error','bitmap-close','image-decode-start',
    'image-decode-end','image-decode-error','canvas-2d',
  ].map(type=>[type,0]));
  const ids = new WeakMap(), closed = new WeakMap(), canvasSeen = new WeakSet();
  let nextImageId = 0, nextOperationId = 0, droppedEvents = 0, label = 'opening';
  const clock = scope.performance;
  const now = clock.now.bind(clock);
  const then = scope.Promise.prototype.then;

  function emit(type, atMs, fields = {}) {
    counts[type]++;
    if (events.length < eventLimit) events.push({type,atMs,label,...fields});
    else droppedEvents++;
  }

  function imageId(image) {
    if (!image || (typeof image!=='object' && typeof image!=='function')) return null;
    if (!ids.has(image)) ids.set(image,++nextImageId);
    return ids.get(image);
  }

  function integer(read) {
    try {
      const value = read();
      return Number.isSafeInteger(value) && value>=0 ? value : null;
    } catch { return null; }
  }

  function dimensions(image, fields) {
    const [width,height] = fields;
    return {width:integer(()=>image?.[width]),height:integer(()=>image?.[height])};
  }

  function errorName(error) {
    try { return typeof error?.name==='string' ? error.name.slice(0,96) : null; }
    catch { return null; }
  }

  function recordError(type, operationId, start, error) {
    const end = now();
    emit(type+'-error',end,{operationId,durationMs:end-start,errorName:errorName(error)});
  }

  function observePromise(result, type, operationId, start, endFields) {
    Reflect.apply(then,result,[value=>{
      const end = now();
      emit(type+'-end',end,{operationId,durationMs:end-start,...endFields(value)});
    },error=>recordError(type,operationId,start,error)]);
    // Preserve the native promise, its value/reason, and the original caller's timing.
    // The passive observer adds a rejection handler for browser unhandled-rejection bookkeeping.
    return result;
  }

  function observeOperation(type, native, receiver, args, startFields, endFields) {
    const operationId = ++nextOperationId, start = now();
    emit(type+'-start',start,{operationId,...startFields});
    let result;
    try { result = Reflect.apply(native,receiver,args); }
    catch (error) { recordError(type,operationId,start,error); throw error; }
    return observePromise(result,type,operationId,start,endFields);
  }

  function hook(owner, name, apply) {
    const native = owner?.[name];
    if (typeof native!=='function') return false;
    const descriptor = Object.getOwnPropertyDescriptor(owner,name) ?? {configurable:true,writable:true};
    if ('get' in descriptor || 'set' in descriptor) return false;
    return Reflect.defineProperty(owner,name,{...descriptor,value:new Proxy(native,{apply})});
  }

  const size = scope.Blob && Object.getOwnPropertyDescriptor(scope.Blob.prototype,'size')?.get;
  const ordinaryDimensions = ['width','height'], naturalDimensions = ['naturalWidth','naturalHeight'];
  const bitmapMetadata = bitmap => ({imageId:imageId(bitmap),...dimensions(bitmap,ordinaryDimensions)});
  const createImageBitmap = hook(scope,'createImageBitmap',(native,receiver,args)=>
    observeOperation('bitmap',native,receiver,args,{blobBytes:integer(()=>size?.call(args[0]))},bitmapMetadata));
  const imageBitmapClose = hook(scope.ImageBitmap?.prototype,'close',(native,receiver,args)=>{
    const result = Reflect.apply(native,receiver,args);
    const closeCount = (closed.get(receiver) ?? 0)+1;
    closed.set(receiver,closeCount);
    emit('bitmap-close',now(),{imageId:imageId(receiver),closeCount});
    return result;
  });
  const htmlImageDecode = hook(scope.HTMLImageElement?.prototype,'decode',(native,receiver,args)=>{
    const id = imageId(receiver);
    const image = id===null || typeof scope.WeakRef!=='function' ? null : new scope.WeakRef(receiver);
    return observeOperation('image-decode',native,receiver,args,
      {imageId:id,...dimensions(receiver,naturalDimensions)},
      ()=>({imageId:id,...dimensions(image?.deref(),naturalDimensions)}));
  });

  function observeCanvas(kind, ctor) {
    return hook(ctor?.prototype,'getContext',(native,receiver,args)=>{
      const context = Reflect.apply(native,receiver,args);
      if (args[0]!=='2d' || !context || canvasSeen.has(receiver)) return context;
      canvasSeen.add(receiver);
      const {width,height} = dimensions(receiver,ordinaryDimensions);
      const pixels = width===null || height===null ? null : integer(()=>width*height);
      emit('canvas-2d',now(),{imageId:imageId(receiver),kind,width,height,pixels});
      return context;
    });
  }
  const htmlCanvas2d = observeCanvas('HTMLCanvasElement',scope.HTMLCanvasElement);
  const offscreenCanvas2d = observeCanvas('OffscreenCanvas',scope.OffscreenCanvas);
  const hooks = {createImageBitmap,imageBitmapClose,htmlImageDecode,htmlCanvas2d,offscreenCanvas2d};

  Object.defineProperty(scope,'__imageDecodeProbe',{value:Object.freeze({
    mark(value) {
      if (typeof value==='string') label = value.slice(0,96);
      const atMs = now();
      emit('mark',atMs);
      return atMs;
    },
    imageId,
    snapshot() {
      return {schema:'image-decode-lifecycle-v1',scope:'this-window-realm',timeOriginMs:clock.timeOrigin,
        capturedAtMs:now(),hooks:{...hooks},eventLimit,droppedEvents,counts:{...counts},events:events.map(event=>({...event}))};
    },
  })});
}

module.exports = {installDecodeProbe};
