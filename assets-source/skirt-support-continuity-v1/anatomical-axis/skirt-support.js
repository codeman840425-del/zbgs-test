// Fade only through the old support's outer margin. Inside the measured
// thigh radius support stays complete; at the former hard edge it is zero.
export function skirtSupportWeight(lateral, radius) {
  const t = Math.max(0, Math.min(1, (radius * 1.1 - lateral) / (radius * .1)));
  return t * t * (3 - 2 * t);
}

// Anatomical left/right remains defined when the thigh becomes vertical.
// axis x world-up instead normalizes a vanishing vector twice every stride.
export function skirtLateralAxis(legAxis, pelvisAcross, out) {
  const length2 = legAxis.lengthSq();
  out.copy(pelvisAcross).addScaledVector(legAxis, -pelvisAcross.dot(legAxis) / length2);
  if (out.lengthSq() < 1e-10) {
    out.set(0, 1, 0).addScaledVector(legAxis, -legAxis.y / length2);
    if (out.lengthSq() < 1e-10) out.set(0, 0, 1).addScaledVector(legAxis, -legAxis.z / length2);
  }
  return out.normalize();
}

// Continuous union, with the higher surface taking precedence. Both fully
// covered => old max(surface); neither covered => the original guide.
// A plain weighted mean could pull the panel into the higher supporting thigh.
export function blendSkirtSupports(guideY, heightA, weightA, heightB, weightB, drape) {
  if (heightA < heightB) {
    const h = heightA, w = weightA;
    heightA = heightB; weightA = weightB;
    heightB = h; weightB = w;
  }
  const supported = heightA * weightA + heightB * ((1 - weightA) * weightB)
    + guideY * ((1 - weightA) * (1 - weightB));
  return guideY + (supported - guideY) * drape;
}
