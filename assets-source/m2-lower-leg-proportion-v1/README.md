# Male lower-leg proportion specimen v1

This single parametric derivative lengthens both lower-leg rest segments by 20 mm on the exact original male `62b44b...` base. `spec.json` and the CPU builder are the editable source. The original VRM and reconstructed Blender checkpoint are SHA-pinned inputs and remain intact. The preserved Blender checkpoint produced the original VRM through `scripts/m1b-assets/export-body.py`. This CPU derivative has no regenerated Blender source.

From a repository checkout with Python 3.13 and numpy 2.4.2 installed, run the following commands. The optional `--modules-root` argument to the Node check selects an existing installation from the same prototype lockfile when using an isolated worktree.

```powershell
python -B scripts/m2-lower-leg-proportion-v1/build.py
node scripts/m2-lower-leg-proportion-v1/qa-vrm.mjs
python -B scripts/m2-lower-leg-proportion-v1/qa-upper-fit.py
python -B scripts/m2-lower-leg-proportion-v1/qa.py
```

The builder retains original metre units and the raw translation-only rest hierarchy. Hips, knees, head and upper arms remain fixed. Each Foot local rest translation extends along its actual knee-to-ankle axis. Foot and toe descendants move with it. Their inverse binds change coherently. All joint/weight attributes, UVs, topology, encoded images, face geometry and 54 face morphs retain original bytes.

The Body uses a piecewise affine field along each anatomical segment. Above the plane perpendicular to the segment at its knee, displacement is zero. Between knee and ankle planes it increases linearly to 20 mm along the segment. Below the ankle plane it stays at the foot displacement. Side membership comes from the actual leg skin weights, with ambiguity rejected. Normals in the stretched band use the inverse-transpose transform. Original embedded shoe geometry translates rigidly per foot. The two knee planes are slightly tilted, so two Body vertices just above the horizontal knee Y move by about 0.167 mm. `source-screening.json` records the original overbroad QA assertion and its corrected boundary. No geometry parameters were adjusted to satisfy it.

The complete VRM's embedded original trousers also follow the segment field. Its shirt, tie, hair and Face stay unchanged. Their original garment appearance remains embedded in the full asset. This source deformation supplies no action or visual acceptance for those embedded trousers. Existing independent trousers or other garments do not inherit a fit through runtime hiding.

The coordinate convention keeps hips fixed and lets the feet move down. The actual original shoe sole moves from Y `0.000494728` to `-0.019449776` m. Bare Body foot minimum moves from `0.018967303` to `-0.000977203` m. Each ankle also moves about 0.568 mm inward in X and 1.376 mm in +Z along its measured axis. No model scaling or floor-compensation offset is added. The runtime must measure this candidate's actual sole plane during subsequent floor, walk, seat and framing checks.

`generated/equipment.json` contains source candidates for independent shoes, the existing male shorts and top. The shoes retain foot-relative geometry while the six-bone skeleton and affected inverse binds update to the new rest shape. The shorts sit above the changed segment and their seven used bones keep their exact rest transforms. QA requires the complete shorts GLB to remain byte-identical before allowing its new fit descriptor. Its material recipe references remain bound to the old body/fit identities and are explicitly omitted. Unlisted independent clothing, onePiece, socks and derived bodies need separate production and verification.

The top retains its entire original GLB. `upper-body-fit.json` proves exact equality of all selected original shirt/tie vertices and attributes plus the actual top's ten inverse binds. Head, shoulder, arm and hand raw references also match. `forearm-profile.json` derives the original measured v2 profile only after reselecting both forearms from actual semantic weights and checking the full boundary triangles, all influenced raw rest transforms and inverse binds, positions, weights and axial measurement inputs. Each side selects 331 faces and 219 vertices. The complete original `profiles` data stays deeply equal, including extended rail measurements. The new body identity and adaptation evidence identify this restricted reuse. `qa-upper-fit.py` rejects wrong identity, incomplete selections, changed head rest and a temporary GLB with an altered actual forearm coordinate. This supplies source dependency qualification for the top and forearm profile. Runtime clothing/arm contact and movements remain pending.

`build-report.json` records old/new actual lengths, all changed raw nodes, POSITION/NORMAL and IBM hashes, the exact changed vertex counts per embedded material, source equipment SHA and omitted recipes. `qa-report.json` verifies exact repeat export, neutral weighted skinning, protected regions and new equipment binding. The actual GLTFLoader/VRMLoaderPlugin check records both raw and normalized bone lengths after the same VRM0 rotation and neutral update used by the game. That CPU check supplies placeholder textures solely for skeleton construction. Python separately verifies original encoded texture bytes.

All outputs stay under this source package. There is no public installation, profile, controller or animation change. Runtime movement, knee transitions, foot contact, sitting, camera framing and visual approval remain pending. A female derivative would need its own exact source, anatomical axes, influence and mesh checks, neutral binds, normalized mapping and clothing fits. It has no inherited result from this male specimen.

The source license and retained third-party VRoid beta provenance are recorded in `provenance.json`. New parametric construction uses CC0-1.0. The original editable `.vroid` is unavailable, consistent with the foundation record.
