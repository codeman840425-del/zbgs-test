# Local 1080p input copy — not uploaded

The initial local inventory contained only the 729-frame original. This preparation created one H.264/yuv420p 1920×1080 copy using original frames 0–719 whose observation timestamps are strictly in `[0,30)`. All 720 output PTS exactly equal the source PTS in time base `1/24000`; adjacent observations remain 1001 ticks apart (`24000/1001` fps). No speed change, dropped selected frame, duplicate, interpolation, new detection or audio was introduced. The image is scaled 0.5 in each axis with Lanczos, without cropping or rotation.

Local file: `F:/gamemake/analysis/dance-submit-input-v1/5359146-frames0000-0719-1080p-cfr24000_1001.mp4`

- Size: 12,117,911 bytes.
- SHA256: `3c81333c5da379ea51c0abe20214870c80cef026592ac5b50156440f6dd99597`.
- Actual container and stream duration: **30.03 seconds**, not exactly 30 seconds.
- Final PTS: `719719/24000 = 29.9882916667` seconds. The remaining interval to 30 seconds is `281/24000 = 11.7083333 ms`.
- Tail policy: retain the ordinary final sample duration `1001/24000 = 41.7083333 ms`, ending at 30.03 seconds. The last sample duration was **not** shortened. This is not proof of compatibility with a strict 30-second upload quota.

PyAV 16.1.0 decoded the original and output; separate FFmpeg 7.1 `showinfo` decoded all output frames and checked every PTS. No standalone ffprobe was available or used. `manifest.json` contains tool/library versions, executable hash, actual metadata and exact command arrays; `frame-mapping.csv` contains all 720 mappings. `visual-review.json` records the separate manual review of first/middle/last pairs only, not a claim of visually inspecting all 720 frames. `files.json` hashes this evidence package and the reproduction script.

Reproduce from `F:/gamemake` using the existing Python 3.13 environment (PyAV 16.1.0, imageio-ffmpeg 0.6.0, Pillow 12.1.0):

```powershell
python scripts/pose-reference/prepare-dance-submit-input.py
```

The script reuses an existing output only after matching the recorded SHA, then repeats decoding verification. Encoding uses two CPU threads and one filter thread. A rerun regenerates machine evidence, so its manifest reports manual visual review as pending; the independently hash-bound `visual-review.json` remains the record for the reviewed bytes. Refresh `files.json` if regenerating evidence.

Original source: Pexels / Sergey Makashin / 5359146, governed by the Pexels License (not CC0); see `../source.json`. Original SHA remains `c26ca0a91f8b735c575a142a75504696609bfa024e905b9cec13ba61c70c1c48`. Original, copy and comparison image are under Git-ignored `analysis/`. This agent has not registered an account, uploaded/submitted this media, paid for a service or changed any existing animation asset. Future service compatibility and upload decisions are separate from this local preparation.
