// Exact implementation admissions, not visual acceptance.
// Original source audit covers only female/male; derived scalps still need own readback.
import {REPRESENTATIVE_NO_HAIR} from './representative-batch.js';
export const NO_HAIR_BODIES = [
  ...REPRESENTATIVE_NO_HAIR,
  {
    id: 'm2-male-lower-leg-v1',
    sha256: '968a9d997683cd99de4eea8f77965184eea6d7bc639a6ae062085928325189d8',
    sourceSkinEvidence: 'male',
    status: 'source scalp/Face geometry, morphs, skin and head rest preserved; own runtime pending',
    evidence: 'assets-source/m2-lower-leg-proportion-v1/generated/qa-report.json',
    dependencyEvidence: 'assets-source/m2-lower-leg-proportion-v1/generated/upper-body-fit.json',
  },
  {
    "id": "female",
    "sha256": "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95",
    "sourceSkinEvidence": "female",
    "status": "source-static-reviewed; runtime-pending",
    "evidence": "evidence/workbench-face-source-audit-v1/RESULT.md"
  },
  {
    "id": "male",
    "sha256": "62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff",
    "sourceSkinEvidence": "male",
    "status": "source-static-reviewed; runtime-pending",
    "evidence": "evidence/workbench-face-source-audit-v1/RESULT.md"
  },
  {
    "id": "m1a-jaw-v1",
    "sha256": "3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011",
    "sourceSkinEvidence": "female",
    "status": "derived-local-jaw; scalp-inheritance-candidate; own-runtime-pending",
    "evidence": "evidence/workbench-face-source-audit-v1/RESULT.md"
  },
  {
    "id": "m1a-waisthip-v1",
    "sha256": "10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5",
    "sourceSkinEvidence": "female",
    "status": "derived-waisthip; scalp-inheritance-candidate; own-runtime-pending",
    "evidence": "evidence/workbench-face-source-audit-v1/RESULT.md"
  },
  {
    "id": "m2-male-jaw-v1",
    "sha256": "25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153",
    "sourceSkinEvidence": "male",
    "status": "derived-local-jaw; scalp-inheritance-candidate; own-runtime-pending",
    "evidence": "evidence/workbench-face-source-audit-v1/RESULT.md"
  }
];
