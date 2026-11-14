// Actual avatar regression: inspect knees, not only ankle reach error.
const { chromium } = require("../prototype/node_modules/playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const out = path.resolve(__dirname, "../output/playwright/posture");
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    recordVideo: { dir: out, size: { width: 1440, height: 960 } },
  });
  const page = await context.newPage(),
    errors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(process.argv[2] || "http://127.0.0.1:4180/");
    await page.waitForFunction(() => window.__debug?.ready);
    async function stable(label, outfit) {
      const frames = [];
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(100);
        frames.push(
          await page.evaluate(() => {
            const a = __debug.avatar();
            const p = (n) =>
              a.root.worldToLocal(
                a.vrm.humanoid
                  .getNormalizedBoneNode(n)
                  .getWorldPosition(a.root.position.clone()),
              );
            const legs = ["left", "right"].map((s) => {
              const h = p(s + "UpperLeg"),
                k = p(s + "LowerLeg"),
                f = p(s + "Foot");
              const axis = f.clone().sub(h),
                t = k.clone().sub(h).dot(axis) / axis.lengthSq();
              const bend = k.clone().sub(h.clone().addScaledVector(axis, t));
              return {
                side: s,
                knee: k.toArray(),
                foot: f.toArray(),
                lateral: Math.abs(bend.x),
                forward: bend.z,
                flex:
                  (Math.acos(
                    Math.max(
                      -1,
                      Math.min(
                        1,
                        k
                          .clone()
                          .sub(h)
                          .normalize()
                          .dot(f.clone().sub(k).normalize()),
                      ),
                    ),
                  ) *
                    180) /
                  Math.PI,
              };
            });
            return { mode: __debug.snapshot().mode, legs };
          }),
        );
      }
      const legs = frames.flatMap((f) => f.legs);
      const result = {
        label,
        outfit,
        maxFlex: Math.max(...legs.map((l) => l.flex)),
        maxLateral: Math.max(...legs.map((l) => l.lateral)),
        minForward: Math.min(...legs.map((l) => l.forward)),
        frames,
      };
      checks.push(result);
      await page.screenshot({ path: path.join(out, `${outfit}-${label}.png`) });
      assert.ok(
        frames.every((f) => f.mode === "idle"),
        `${label}: must return to idle`,
      );
      assert.ok(
        result.maxFlex < 20,
        `${label}: idle knee flex ${result.maxFlex}`,
      );
      assert.ok(
        result.maxLateral < 0.025,
        `${label}: lateral knee bend ${result.maxLateral}`,
      );
      assert.ok(
        result.minForward > -0.01,
        `${label}: backward knee ${result.minForward}`,
      );
    }
    for (const outfit of [0, 1]) {
      await page.evaluate((n) => {
        __debug.reset();
        __debug.setOutfit(n);
      }, outfit);
      await page.waitForTimeout(2000);
      await stable("idle", outfit);
      await page.evaluate(() => __debug.walkTo(-2, 1.15));
      await page.waitForFunction(() => __debug.snapshot().mode === "walk");
      await page.waitForFunction(
        () => __debug.snapshot().mode === "idle",
        null,
        { timeout: 15000 },
      );
      await page.waitForTimeout(1000);
      await stable("walk-stop", outfit);
      await page.evaluate(() => __debug.action("sit"));
      await page.waitForFunction(
        () => __debug.snapshot().motion.sitProgress > 0.999,
        null,
        { timeout: 30000 },
      );
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(out, `${outfit}-seated.png`) });
      await page.evaluate(() => __debug.action("stand"));
      await page.waitForFunction(
        () => __debug.snapshot().mode === "idle",
        null,
        { timeout: 10000 },
      );
      await page.waitForTimeout(1000);
      await stable("stand-finish", outfit);
      await page.evaluate(() => __debug.action("dance"));
      await page.waitForTimeout(6500);
      await page.evaluate(() => __debug.action("idle"));
      await page.waitForTimeout(2000);
      await stable("dance-stop", outfit);
      await page.evaluate(() => __debug.action("turn"));
      await page.waitForTimeout(8500);
      await page.waitForTimeout(1500);
      await stable("turn-stop", outfit);
    }
    const unchangedPoseError = await page.evaluate(() => {
      const d = __debug,
        a = d.avatar();
      d.pause();
      const pose = () =>
        [
          "hips",
          "leftUpperLeg",
          "leftLowerLeg",
          "leftFoot",
          "rightUpperLeg",
          "rightLowerLeg",
          "rightFoot",
          "leftUpperArm",
        ].flatMap((n) => {
          const b = a.vrm.humanoid.getNormalizedBoneNode(n);
          return [...b.position.toArray(), ...b.quaternion.toArray()];
        });
      const before = pose();
      d.motion().update(0, { action: "idle", moving: false, distanceDelta: 0 });
      a.vrm.update(0);
      return Math.max(...pose().map((v, i) => Math.abs(v - before[i])));
    });
    assert.ok(
      unchangedPoseError < 1e-6,
      `zero-time evaluation changed pose: ${unchangedPoseError}`,
    );
    assert.equal(errors.length, 0);
    await fs.writeFile(
      path.join(out, "report.json"),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          url: page.url(),
          passed: true,
          errors,
          unchangedPoseError,
          checks,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        passed: true,
        unchangedPoseError,
        checks: checks.map(({ frames, ...c }) => c),
      }),
    );
  } finally {
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(path.join(out, "posture-transitions.webm"));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
