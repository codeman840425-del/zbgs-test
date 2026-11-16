import hashlib
import json
from pathlib import Path

root = Path('F:/gamemake')
out = root/'evidence/m2-socks-shoe-contact-audit-v1'
source = json.loads((out/'source-result.json').read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
toggle = root/'evidence/m2-socks-shoe-toggle-v1'
toggle_report = json.loads((toggle/'report.json').read_text(encoding='utf-8'))
paired_evidence = []
for body in ['female', 'male']:
    for pose in ['standing', 'seated']:
        paired_evidence.append({'body': body, 'pose': pose,
                               'on': {'path': str((toggle/body/(pose+'-socks-on.png')).relative_to(root)), 'sha256': sha(toggle/body/(pose+'-socks-on.png'))},
                               'off': {'path': str((toggle/body/(pose+'-socks-off.png')).relative_to(root)), 'sha256': sha(toggle/body/(pose+'-socks-off.png'))}})
summary = []
for row in source['rows']:
    patch = row['additiveHeelExposureWhereIntactBodyRemainsBehindShoe']
    p = patch['peakLocationM']
    summary.append({'body': row['bodyType'], 'outwardXExcessMm': patch['peakSignedXExcessM']*1000,
                    'sampledProjectedAreaMm2': patch['projectedAreaEstimateMm2'],
                    'bodyToShoeDistanceUpperBoundAtMeasuredRayMm': (p['bodyX']-p['shoeX'])*1000,
                    'shoeFootWeight': patch['shoeSurfaceSkin']['interpolatedWeightsByRawName']['J_Bip_L_Foot'],
                    'sockFootWeight': patch['sockSurfaceSkin']['interpolatedWeightsByRawName']['J_Bip_L_Foot'],
                    'maxPrescribedPosePairVectorChangeMm': max(r['relativeVectorChangeM'] for r in patch['prescribedPoseTransportDiagnostics'])*1000,
                    'shoeTriangle': patch['peakShoeTriangle'], 'sockTriangle': patch['peakSockTriangle']})
report = {
    'schema': 'independent-sock-shoe-contact-conclusion-v1',
    'sourceAuditScriptSha256': sha(out/'audit.py'), 'numericReportSha256': sha(out/'source-result.json'),
    'browserEvidenceBuild': toggle_report['build'], 'toggleReportSha256': sha(toggle/'report.json'),
    'reviewedPairedEvidence': paired_evidence,
    'finding': 'The pale heel pixels originate from the new sock surface crossing the shoe upper. CPU source-rest projection independently reproduces the male triangular patch at the same heel region. Original shoe UV samples are dark and the embedded shoe images have alpha255 throughout.',
    'causalDetails': [
        'The sock adds an outward offset and thickness to the original foot surface. At the measured heel sample the original Body remains behind the shoe while the added sock surface lies in front.',
        'Source shoe and sock use the same lower-leg/foot raw bones but carry slightly different interpolated weight fields. This changes their local relative surface positions under ankle rotation. The earlier exact loader audit establishes matching raw bone identity and inverse binds.',
        'The observed geometric patch already exists at source rest. A wrong runtime bone mapping is not required to explain it. This review adds no full-motion guarantee.'
    ],
    'measurements': summary,
    'preferredSingleCandidatePlan': {
        'choice': 'One explicit source shoe-fit derivative for each exact sock/base pairing, with a localized heel-upper clearance correction.',
        'inputs': 'Pinned original shoe, original Body, current sock GLB and six raw bind matrices. Preserve original assets as rollback inputs.',
        'construction': 'Locate the measured left heel patch and independently measure its right counterpart. Expand only corresponding shoe-upper vertices and an adjacent smooth transition ring. Use the current sock envelope plus 0.5mm rest clearance as a deterministic target. Keep sole, collar outline, UVs, texture/material, raw joint IDs and inverse binds fixed. Preserve the existing skin field initially and inspect its differential transport explicitly.',
        'attemptBudget': 'One generated candidate. Based on the measured left patch, male lateral correction is about1.17mm and female about0.59mm. These are pointwise estimates, not a general solved displacement field. Cap local displacement at1.5mm and stop/reposition the method if the target cannot be met.',
        'identity': 'New derivative shoe ID/SHA and exact socks pairedWith relationship. Keep the original shoe selection available for the historical outfits.',
        'minimumAcceptance': 'CPU verifies all changes remain in the declared heel patch, skin/IBMs/UVs remain intact and both-side gap at the measured patch is positive for rest plus the prescribed ankle poses. Root then compares same frozen standing/seated socks-on/off views and full-speed actual walk/run/sit/rise. Preserve failed frames and source contact numbers.'
    },
    'ifOriginalShoeShapeAndBodyMustStayFixed': {
        'continuousShellFeasibility': 'At the male measured ray the Body-to-shoe gap is at most0.193mm, below the requested0.5mm shell thickness. A continuous0.5mm sock outside the intact Body cannot fit at that point without geometric overlap. The female0.769mm ray gap is an upper bound and does not establish a full normal-clearance solution.',
        'minimalVisualAlternative': 'Use an exact-shoe-pair sock coverage export or draw-index mask for the fully shoe-enclosed heel/foot patch, retaining the full closed sock source. Retain visible collar/ankle geometry and verify the mask boundary remains shoe-covered in the same actual motions. This resolves pale covered fragments while retaining the known hidden spatial overlap as a documented limit.',
        'requiredSemanticRecord': 'The paired combination gains a coverage adaptation. An independently visible full sock still consumes the complete source mesh. Do not report the coverage result as a new physically separated continuous shell fit.',
        'inwardSockOnlyFitLimit': 'Pushing both sock surfaces inside the fixed shoe can preserve a closed shell but introduces overlap with the intact Body at the constrained male heel. This would need an explicit limit and would not meet a no-overlap shell requirement.'
    },
    'scopeLimits': source['limits']+[
        'All new analysis used CPU source data only. The browser on/off experiment was performed by root and reviewed here through its exact images, script and report.',
        'Only the viewed raw left outer heel is quantitatively sampled. The source correction must independently check the other side.',
        'Prescribed poses transport a fixed barycentric point pair. They do not reproduce the captured seated pose or search every posed contact.',
        'No asset, runtime or source generator was changed. No GPU, encoding sweep or generic collision system was used.'
    ]
}
(out/'conclusion.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'finding': report['finding'], 'measurements': summary}, indent=2))
