# Seat path endpoint regression

The real fixed29d failure follows `walkTo(-1.4,-.6)` and a sit request. Its root is `[-1.3923669997210397,0,-.5851580550131326]`, with safe chair approach `[2.65,0,1.2881239836487242]`. `failure-input.json` retains the exact selected snapshot data and original report hash. Git confirms the failing4fac and baseline47e main.js blobs are identical.

The source CPU reproduction confirms three conditions together. The exact approach is free, the direct start-to-approach segment crosses the chair obstacle, and rounding the approach to the200mm grid produces `[2.6,1.2]` inside the expanded seat obstacle. The old search required this blocked rounded endpoint and returned an empty path. The original `action('sit')` discarded `go`'s false return, leaving the actual task running. The CPU reproduction also retains its reserved lease.

The search now accepts a reachable grid node with a clear segment to the exact target. Its initial grid nodes connect to the actual start using checked segments in the adjacent3×3 cells. This also handles a free start whose rounded point is blocked and prevents the old unsafe first segment across a thin obstacle. Existing exact segment/OBB checks validate start connections, grid edges, goal connections and path simplification. The actual regression route becomes `[[.2,1],[2.65,1.2881239836487242]]`, with every segment clear.

`action('sit')` propagates `go`'s return. If a sit approach is genuinely unreachable, `go` releases the seat request and fails its matching executing sit task with `seat-path-unreachable`. This includes a deferred approach that only attempts navigation after an outgoing dance. Reservation release uses the existing lease state rules. Successful sit completion retains an occupied seat.

```powershell
node scripts/qa-seat-path-endpoint.mjs --modules-root F:/gamemake/prototype/node_modules
node scripts/qa-behavior-tasks.mjs
node --check prototype/src/main.js
```

The ten focused checks execute the actual main.js navigation functions and CharacterScene request/action/go lifecycle with real Three187 geometry and the existing pure task/lease modules. They cover the actual failure, reversed endpoint/start case, thin-wall first edge, moved/rotated chair, direct paths, blocked endpoints, successful task/occupancy transition, a true separating-wall failure, retry identity and another owner's reservation. Physical arrival is simulated for the task-completion check. No browser, GPU, gait, visual or actual sitting acceptance is claimed. The existing200mm grid and adjacent start connections remain the navigation scope. Root owns the same-path fixed-build recording.
