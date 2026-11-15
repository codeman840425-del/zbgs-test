import profiles from './skirt-fit-profiles.json';

// The equipment adapter has already verified the actual garment bytes and bind.
// Never silently apply the prototype's one-skirt rules to a new resource.
export function selectSkirtFit(entry, avatarSha256) {
  const fit = profiles.fits.find(f => f.garmentId === entry.id &&
    f.garmentSha256 === entry.sha256 && f.avatarSha256 === avatarSha256 &&
    entry.compatibleAvatarSha256 === avatarSha256);
  if (!fit) throw new Error(`No explicit skirt corrective fit for ${entry.id}`);
  return fit;
}
