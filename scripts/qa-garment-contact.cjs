const { chromium } = require("../prototype/node_modules/playwright");
const fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const { measureGarmentContact } = await import("./garment-contact-probe.mjs");
  const label = process.argv[3] || "after",
    out = path.resolve("output/playwright/garment-contact", label);
  await fs.mkdir(out, { recursive: true });
  const b = await chromium.launch({ channel: "chrome", headless: true }),
    p = await b.newPage({ viewport: { width: 1440, height: 1080 } });
  const results = [];
  try {
    await p.goto(process.argv[2] || "http://127.0.0.1:5173/");
    await p.waitForFunction(() => __debug?.ready);
    await p.evaluate(() => {
      const c = __debug.game.scene.getScene("CharacterStudio");
      c.paused = true;
      c.reset();
      __debug.setOutfit(1);
    });
    async function sample(stage, frames) {
      for (let f = 0; f < frames; f += 12) {
        await p.evaluate(() => {
          const c = __debug.game.scene.getScene("CharacterStudio");
          for (let i = 0; i < 12; i++) c.simulate(1 / 60);
        });
        const contact = await p.evaluate(measureGarmentContact);
        results.push({ stage, frame: f + 12, ...contact });
        if (
          contact.results.some((r) => r.intersections > 0) &&
          !results
            .slice(0, -1)
            .some(
              (r) =>
                r.stage === stage && r.results.some((m) => m.intersections > 0),
            )
        )
          await p.screenshot({
            path: path.join(out, `${stage}-first-intersection.png`),
          });
      }
    }
    await sample("idle", 180);
    await p.evaluate(() => {
      const d = __debug,
        c = d.game.scene.getScene("CharacterStudio");
      c.reset();
      c.paused = true;
      d.avatar().root.position.set(-3.2, 0, 1.8);
      c.yaw = Math.PI / 2;
      d.avatar().root.rotation.y = c.yaw;
      d.motion().reset();
      c.go(3.2, 1.8);
    });
    await sample("walk", 480);
    await p.evaluate(() => {
      const c = __debug.game.scene.getScene("CharacterStudio");
      c.action("sit");
      let i = 0;
      while (c.mode !== "sit" && i++ < 2400) c.simulate(1 / 60);
    });
    await sample("sit", 240);
    await p.evaluate(() => __debug.action("stand"));
    await sample("stand", 240);
    const summary = {
      label,
      url: p.url(),
      buildInfo: await p.evaluate(() => __debug.buildInfo),
      samples: results.length,
      intersectingSamples: results.filter((r) =>
        r.results.some((m) => m.intersections),
      ).length,
      maxPairs: Math.max(
        ...results.flatMap((r) => r.results.map((m) => m.intersections)),
      ),
      results,
    };
    await fs.writeFile(
      path.join(out, "report.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log(JSON.stringify({ ...summary, results: undefined }));
    if (label === "after" && summary.intersectingSamples) process.exitCode = 1;
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
