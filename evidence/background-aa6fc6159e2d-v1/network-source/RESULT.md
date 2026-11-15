# Isolated 404 attribution probe

Same fixed build aa6fc6159e2d, same public URL `http://127.0.0.1:4196/?body=female`, a fresh independent headed Chrome profile, one initial navigation, no repeat of background scenarios or video recording.

The missing resource is **`http://127.0.0.1:4196/favicon.ico`**. CDP `Network.responseReceived` records status 404, resource type `Other`, MIME `text/html`. The matching console error has that exact URL in its location. Playwright's page-response listener did not surface the browser favicon request; this is why the CDP response record matters.

No failed functional asset response or request failure was observed. The actual ready state, fixed build and female avatar SHA identity passed; zero page errors. This isolated reproduction identifies the same-form console failure but does not retroactively add a URL to the earlier raw report. A minimal site icon can remove it; no character/runtime correction is justified by this evidence.

Browser closed, no server started. `executed-script.cjs` and `report.json` preserve the actual probe. The temporary Chrome profile is excluded from archival. The parent background package and its manifest were not rewritten.
