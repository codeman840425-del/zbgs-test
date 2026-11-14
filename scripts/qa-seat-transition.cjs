const { chromium } = require("../prototype/node_modules/playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const { measureSeatContact } = await import("./seat-contact-probe.mjs");
  const browser = await chromium.launch({ channel: "chrome", headless: true }),
    page = await browser.newPage();
  try {
    await page.goto(process.argv[2] || "http://127.0.0.1:5173/");
    await page.waitForFunction(() => __debug?.ready);
    const results = await page.evaluate((fn) => {
      const measure = eval("(" + fn + ")"),
        d = __debug,
        c = d.game.scene.getScene("CharacterStudio"),
        results = [];
      c.paused = true;
      for (const outfit of [0, 1]) {
        c.reset();
        c.paused = true;
        c.setOutfit(outfit);
        c.action("sit");
        let approachFrames = 0;
        while (c.mode !== "sit" && approachFrames++ < 2400) c.simulate(1 / 60);
        const stages = [];
        for (const action of ["sit", "stand", "idle"]) {
          if (action === "stand") c.action("stand");
          for (let frame = 0; frame < 240; frame++) {
            c.simulate(1 / 60);
            if (frame % 2) continue;
            const p = measure(),
              bad = p.meshes.filter((m) =>
                Object.values(m.overlapCounts).some((n) => n > 0),
              );
            stages.push({
              action,
              frame,
              mode: p.mode,
              progress: p.sitProgress,
              position: p.position,
              counts: bad.map((m) => ({
                mesh: m.mesh,
                counts: m.overlapCounts,
              })),
              maxDepth: Math.max(
                0,
                ...bad.flatMap((m) =>
                  Object.entries(m.overlaps).flatMap(([name, points]) => {
                    const box = p.colliders.find((b) => b.name === name);
                    return points.map((p) =>
                      Math.min(
                        ...p.localPosition.flatMap((x, i) => [
                          x - box.localMin[i],
                          box.localMax[i] - x,
                        ]),
                      ),
                    );
                  }),
                ),
              ),
            });
          }
        }
        results.push({ outfit, approachFrames, stages });
      }
      return results;
    }, measureSeatContact.toString());
    const summary = results.map((r) => ({
      outfit: r.outfit,
      approachFrames: r.approachFrames,
      overlapFrames: r.stages.filter((s) => s.counts.length).length,
      maxDepth: Math.max(...r.stages.map((s) => s.maxDepth)),
      first: r.stages.find((s) => s.counts.length),
    }));
    await fs.mkdir("output/playwright/posture", { recursive: true });
    await fs.writeFile(
      "output/playwright/posture/seat-transition.json",
      JSON.stringify(
        {
          date: new Date().toISOString(),
          url: page.url(),
          buildInfo: await page.evaluate(() => __debug.buildInfo),
          summary,
          results,
          limitation:
            "Sampled 30 Hz actual mesh vertices against chair local boxes; not swept triangle contact or body/cloth self collision.",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(summary, null, 2));
    if (summary.some((s) => s.overlapFrames)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
