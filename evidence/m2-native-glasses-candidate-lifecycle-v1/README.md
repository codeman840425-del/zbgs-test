# Native glasses candidate lifecycle report

The report is produced by `node scripts/qa-native-glasses-candidate-chain.cjs BASE OUTPUT_DIR` against the fixed 4196 workbench or an equivalent fixed build.

It machine-checks the exact `bodyType`, body SHA, accessory SHA and candidate fit SHA, then keeps the glasses attached through normal-speed walking, a completed seated pose, standing recovery and a fresh-page reload. It also checks canceled unload, committed unload rollback and identity-error rollback preserve the previous committed attachment, followed by an explicit unload and reload.

This is candidate evidence only. The candidate manifest remains `candidate-only`, each fit remains `verified: false`, and the report does not write a runtime registry or grant visual/performance admission.
