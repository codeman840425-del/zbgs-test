# Fixed-package HTTP transport pilot

This optional experiment uses Node's built-in zlib. It does not replace model,
texture, animation or runtime bytes, nor change any fit identity. The production
site is not switched automatically. Inputs are the fixed 801 male/female packages
exported by `scripts/runtime-package`.

```powershell
node scripts/runtime-transfer-http/prepare.mjs SOURCE_PACKAGE NEW_DERIVATIVE_DIRECTORY
node scripts/runtime-transfer-http/qa-browser.cjs SOURCE_PACKAGE DERIVATIVE_DIRECTORY male NEW_EVIDENCE_DIRECTORY
```

Use `female` for the female package. Current tool version is Node 24.13.0, with
exact Node/zlib/Brotli versions recorded by each export. No additional encoder
package is installed. Node and its bundled third-party libraries retain their
upstream licenses. See https://nodejs.org/docs/v24.13.0/api/zlib.html and
https://github.com/nodejs/node/blob/v24.13.0/LICENSE .

One fixed gzip level 6 / Brotli quality 5 configuration is tested. A derivative
is retained only for eligible data of at least 1024 bytes, saving at least
128 bytes and 2%. The manifest includes input/output SHA, original and encoded
sizes, timings and config. Both decoders must reproduce the original bytes.
Existing outputs are refused. Failed stages retain `FAILED.json` separately;
the successful output name remains available for a corrected retry.

`createServer` is a loopback-test building block, not a new production hosting
platform. It validates the exact source-package file set, source identity,
encoded bytes and inverse decoding before listening. It negotiates
Accept-Encoding, reports Content-Encoding and Vary, and handles variant ETags.
Unversioned resource URLs use `no-cache` so they revalidate; only compiler
content-addressed JS/CSS filenames use immutable caching. Do not configure
unversioned avatar URLs with year-long immutable cache in deployment.

The browser experiment runs modes sequentially. Three fresh contexts per mode
provide cold samples; a new page in the same context provides warm samples.
It does not intercept requests, since Playwright routing disables HTTP cache.
All timing samples run without video. Separate normal-speed evidence uses
the unchanged fixed room. `__debug.ready` plus two animation callbacks is an
interactive-render proxy, not measured first-pixel paint. Actual response
bodies and ResourceTiming bytes are reported separately from header overhead.
Hash-audit requests and recording are excluded from loading measurements.

Warm requests can still download resources because existing application code
uses `cache: no-store`; that is measured and not silently optimized here.
Female default outfit is already loaded, so its apply cost is not evidence of
first skirt loading. Current portable female package does not contain a skirt.

HTTP content coding reduces network traffic. It does not reduce decoded GPU
texture dimensions, geometry or animation memory. JS heap snapshots and renderer
object counts are limited observations, not GPU-memory measurements. Loopback on
the development computer is neither WAN loading nor ordinary-PC validation.
Texture coding is a separate bounded follow-up; there is no Meshopt/Draco test
without evidence that it is needed.
