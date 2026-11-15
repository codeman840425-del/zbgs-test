# Main-program first-use preparation comparison

| Body / command | Max frame old → new ms | Whole request + first draw old → new ms | First post-commit draw old → new ms |
|---|---:|---:|---:|
| female / first-mouth | 115.4 → 103.2 | 266.7 → 196.4 | 113.0 → 34.9 |
| female / new-eye | 84.9 → 72.8 | 178.6 → 161.6 | 82.5 → 55.2 |
| male / first-mouth | 115.4 → 115.2 | 246.3 → 182.8 | 108.5 → 33.9 |
| male / new-eye | 78.8 → 54.6 | 173.7 → 150.9 | 74.7 → 49.6 |
| m2-male-jaw-v1 / first-mouth | 109.1 → 115.3 | 267.7 → 204.7 | 107.5 → 33.9 |

Timing instrumentation and headless development environment are identical; OS/GPU caches are not cleared.
Task splitting does not make a single GL driver call interruptible; full request and final draw remain included.
A few real clicks cannot prove a worst-case input bound. No ordinary-PC, long-running or user naturalness acceptance.

This generated table is measurement, not a pass. Inspect raw program identity, live-input traces, failure tests and visual checks separately.
