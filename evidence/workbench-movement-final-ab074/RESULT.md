# Final movement feedback — ab0743684fe6

Fixed independent build from source 2084c43: experiments/m2-appearance-workbench-v23/dist. All 10 actual browser checks passed, with zero page errors. See raw report and executed-script snapshot for inputs and states.

The cases cover near-view floor miss; explicit room entry and actual root movement; speed-only semantics/UI isolation; reset retaining inspection camera and restoring speed 0.85; paused route/resume feedback; stop and no-destination pause; male run route; seated-to-walk; actual dance interruption; and the added route rejection while a real greeting is playing. The last case observed applied=false, persistent wait-for-greeting feedback, unchanged root/target/sequence/index.

The greeting rejection and resumed-route screenshots were personally opened: the red wait message and the resumed movement message are legible, with the three tabs and room entry available. The tests validate actual state and input isolation, not merely the presence of CANVAS event targets. No motion/source/controller edits were made.

All test Chrome and temporary servers closed. No performance benchmark or whole-animation/visual acceptance is claimed. The companion native normal-speed recording is in ../workbench-movement-after-ab074. Earlier trial evidence is retained under its original identity.
