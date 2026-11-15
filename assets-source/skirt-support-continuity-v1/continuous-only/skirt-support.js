// Fade only through the old support's outer margin. Inside the measured
// thigh radius support stays complete; at the former hard edge it is zero.
export function skirtSupportWeight(lateral, radius) {
  const t = Math.max(0, Math.min(1, (radius * 1.1 - lateral) / (radius * .1)));
  return t * t * (3 - 2 * t);
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
