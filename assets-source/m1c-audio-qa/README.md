# Original short PCM for isolated dance-time QA

`node scripts/m1c/generate-beat-pcm.mjs` reproduces `original-beat-120bpm.wav` and `source.json`: mono PCM16, 48 kHz, 2 seconds, four short sine clicks at 120 BPM. First click 880 Hz; remaining clicks 440 Hz. No recorded sample, third-party music, voice or external sound library is used. Project-generated source and output are dedicated under CC0-1.0.

This is an audible timing cue, not a musical composition or a claim that the selected dance choreography matches 120 BPM. Generated peak is at most .3; QA output gain .35. System volume remains user controlled.

Playback is isolated under `scripts/m1c/`; none of these resources are added to the product public asset catalog. The browser harness requires an explicit enable click. Its MediaRecorder records the internal WebAudio graph, not speakers or a microphone. Device timing/listening remain separate observations.
