import registrations from './fitted-head-appearances.json' with {type:'json'};

export function indexFittedHeadAppearances(entries) {
  const byBody=new Map();
  for(const entry of entries) {
    const {bodySha256,hair,palette}=entry;
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
