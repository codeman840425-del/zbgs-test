# C3 接触资源生命周期 v1

CPU-only Three.js/GLB verification ran with `node prototype/scripts/qa-contact-resources.mjs`.

The five cases passed. They cover visible chair contact across floor/building disposal, two offscreen sofa seats with independent world matrices and same-seat reference counting, busy move/restore rejection, unrelated state identity retention, stale asynchronous resource rejection after facility movement, and authoring cancellation without a leaked handle.

The handle owns cloned seat/back geometry, materials, textures and world matrices. Active contact copies do not keep a full GLB pack retained. Pending exact resource loads are included in authoring `retainOnly` inputs until they settle. This evidence does not claim character motion, lease integration, browser rendering or ordinary-computer performance.
