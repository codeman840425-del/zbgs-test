# Final v5 recipe / iris palette technical checks — ab0743684fe6

Fixed independent build from source 2084c43: experiments/m2-appearance-workbench-v23/dist. All 10 checks passed; zero page errors. Actual script, exported inputs/outputs and raw state comparisons are retained.

Original F/M legacy v4 + palette-v1 recipes with mouth width 0.025 retained the legacy operator SHA, amount, body/equipment/hair identity. Saving migrated schema/rules to v5 and palette to v3; it did not silently enlarge the old geometry value. New mouth +/-0.12 and new brow/nose/eye samples round-tripped through real download and file chooser with equal exported JSON. Wrong recipe SHA was rejected while preserving the current state. Male jaw retained its separate 0/+0.04 restriction and rejected +0.12.

Colors survived geometry changes; original map/shade references and pixel hashes restored. An actual second female instance changed independently. One manifest HTTP503 and one neutral-map HTTP503 were deliberately injected in separate fresh contexts: old state/maps/pixels remained intact and real retries succeeded. These injected failures are not naturally observed network failures.

Female and male final technical screenshots were opened and reviewed: controls and faces are visible without a new layout collapse. They show original iris restoration and are not an all-palette, continuous expression or naturalness approval. This run did not add an old-v4-forged-new-endpoint case or a full expression matrix. All browsers/temporary servers closed; no product changes or target-PC performance claim.
