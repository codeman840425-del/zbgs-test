# Reversible upper-garment coverage candidate

Build: `7a86c24e34aa`; original female and exact original independent top only.
This is authored coverage data, not a recovered source mask and not a repaired
skirt shape. The source body and top remain byte-identical. Selected render faces
are omitted only while this top is equipped; complete body mode restores the
original geometry. Contact calibration retains the complete body reference.

Production entry (Python, NumPy/SciPy versions in the reproduction receipt):

```
python scripts/m1-assets/build-torso-coverage.py --output output/new-coverage
```

The source hashes are checked before generation. The output directory must not
already contain a candidate. No existing resource version is overwritten.
This entry was executed, and `coverage-fit.json` was byte-identical to the
archived source candidate. It does not establish compatibility with a different
top, body or changed geometry: those require new fit identity and validation.

Runtime installation uses the exact fit bytes at
`prototype/public/assets/body-coverage-risk-v1/female-top.json` and an explicit
URL/SHA in the female foundation profile. The garment loader verifies the top's
own bytes first. Coverage additionally verifies body/top identity and every
selected triangle against the original index buffer. Errors fail loading with
an explicit reason; remove/revert the experimental profile descriptor to return
to the complete original rendering. No walk/sit behavior depends on garment name.

Verification entries:

```
node scripts/qa-body-coverage.mjs
node evidence/body-coverage-independent-review/check.mjs
npm --prefix prototype run build -- --outDir ../experiments/new-coverage/dist
node scripts/run-fixed-check.cjs experiments/new-coverage/dist scripts/qa-body-coverage-room.cjs BUILD evidence/new-coverage
```

The copied `prototype/` files preserve the exact candidate input bytes. Together
with base commit `f824db8`, they restore this candidate; source/recording hashes
are recorded separately. Frozen builds under `experiments/` are local generated
outputs, not a substitute for this source recovery.

Automatic: selection generation, integrity/topology admission, reversible index
composition and numerical checks. Judgment still required: garment coverage
design, boundary safety through actual movements, visible folds and fit. These
remain the implementing agent's responsibility, not the user's manual art task.
Current finite tests do not approve arbitrary clothing or all body proportions.
