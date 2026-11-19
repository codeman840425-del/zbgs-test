// Geometry dependencies belong to the selected fit, independently of its
// diagnostic or production admission and independently of surface colours.
function failure(code, message) {
  return Object.assign(new Error(message), {code});
}
export function assertGlassesHeadDependency(dependency, appearance, geometry) {
  if (dependency === undefined) return;
  if (dependency?.hairStyle !== 'original' || dependency.faceGeometry !== 'neutral' ||
      Object.keys(dependency).length !== 2) throw failure('glasses-head-dependency-invalid','眼镜头部适配条件无法识别');
  if (appearance?.hairStyle !== 'original') throw failure('glasses-head-incompatible','此镜腿适配仅支持原发');
  if (geometry?.mouthWidth !== 0 || ['browSample','noseSample','eyeSample'].some(key => geometry[key] !== 'none'))
    throw failure('glasses-head-incompatible','此镜腿适配仅支持中性五官几何');
}
