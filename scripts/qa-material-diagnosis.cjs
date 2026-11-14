const { chromium } = require("../prototype/node_modules/playwright");
const fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const out = path.resolve("output/playwright/material-diagnosis");
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: false }),
    page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
      deviceScaleFactor: 1,
    });
  try {
    await page.goto(process.argv[2] || "http://127.0.0.1:5173/");
    await page.waitForFunction(() => __debug?.ready);
    await page.evaluate(() => {
      __debug.reset();
      __debug.view("side");
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => __debug.setPaused(true));
    await page
      .locator(".viewport")
      .screenshot({ path: path.join(out, "a-original.png") });
    const report = await page.evaluate(() => {
      const rows = [];
      __debug.avatar().root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          rows.push({
            mesh: mesh.name,
            material: m.name,
            side: m.side,
            outlineWidthFactor: m.outlineWidthFactor,
            isOutline: m.isOutline,
            depthWrite: m.depthWrite,
          });
          if (m.isOutline) m.visible = false;
        }
      });
      return rows;
    });
    await page.waitForTimeout(80);
    await page
      .locator(".viewport")
      .screenshot({ path: path.join(out, "b-no-outline.png") });
    await page.evaluate(() => {
      __debug.avatar().root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          if (m.isOutline) m.visible = true;
          else {
            m.side = 0;
            m.needsUpdate = true;
          }
        }
      });
    });
    await page.waitForTimeout(80);
    await page
      .locator(".viewport")
      .screenshot({ path: path.join(out, "c-front-side.png") });
    await page.evaluate(() => {
      __debug.avatar().root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          m.side = m.isOutline ? 1 : 2;
          if (m.outlineWidthMode !== "none") {
            m.outlineWidthMode = "screenCoordinates";
            m.outlineWidthFactor = 0.0018;
          }
          m.needsUpdate = true;
        }
      });
    });
    await page.waitForTimeout(80);
    await page
      .locator(".viewport")
      .screenshot({ path: path.join(out, "d-screen-outline.png") });
    await fs.writeFile(
      path.join(out, "report.json"),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          url: page.url(),
          report,
          diagnosticOnly: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
