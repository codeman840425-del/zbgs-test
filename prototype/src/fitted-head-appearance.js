import registrations from './fitted-head-appearances.json' with {type:'json'};

export function indexFittedHeadAppearances(entries) {
  const byBody=new Map();
  for(const entry of entries) {
    const {bodySha256,hair,palette}=entry;
    const tones=entry.colors.skinTone;
    if(tones && (tones.original!==null || Object.entries(tones).some(([name,hex]) =>
      name!=='original' && (!/^[a-z][a-z0-9-]*$/.test(name) || !/^#[0-9a-f]{6}$/.test(hex)))))
      throw Error('Invalid fitted skin multiplier');
    if(!/^[a-f0-9]{64}$/.test(bodySha256)||byBody.has(bodySha256)||
       hair.compatibleBodies.length!==1||hair.compatibleBodies[0]!==bodySha256||hair.legacyImplicitFit!==false||
       !hair.fit||!palette.version.endsWith(':'+palette.sha256)||entry.originalOnlyPaletteVersions.includes(palette.version))
      throw Error('Invalid or duplicate fitted head appearance registration');
    byBody.set(bodySha256,entry);
  }
  return byBody;
}

const byBody=indexFittedHeadAppearances(registrations);
export const fittedHeadAppearance=sha256=>byBody.get(sha256);
export const fittedHeadHairstyles=registrations.map(entry=>entry.hair);

// The base SHA identifies the two skin surfaces. The recipe also identifies
// the exact sRGB factor, so changing a swatch cannot silently recolor a save.
export function fittedPaletteVersion(entry,tone) {
  const tones=entry.colors.skinTone;
  const hex=tones && Object.hasOwn(tones,tone) ? tones[tone] : null;
  return hex ? entry.palette.version+'|skin-multiply-v1:'+tone+':'+hex.slice(1) : entry.palette.version;
}
