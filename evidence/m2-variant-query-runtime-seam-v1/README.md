# Variant query runtime seam review

The role-main query imports the tracked representative matrix from `assets-source/variant-matrix-v1/representative-matrix.json`. Node query tests, Python matrix validation, and the production Vite build all pass against the same source checkout.

The query returns two exact-body candidate styles for both `female` and `male`. Every one of the four entries remains `candidate`, so `runtimeVariants` is empty for both bodies. The query returns a JSON-detached snapshot. This seam does not admit the candidates or establish fit, motion, budget, surface, attachment, visual, or ordinary-PC acceptance.

The source and query SHA-256 pins are recorded in `report.json`. No generated copy was needed because the repository production build is defined from the full checkout and Vite emits a self-contained bundle.
