const { chromium } = require("../prototype/node_modules/playwright");
const fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const out = path.resolve("output/playwright/garment-diagnosis");
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: false }),
    page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  try {
    await page.goto(process.argv[2] || "http://127.0.0.1:4181/");
    await page.waitForFunction(() => __debug?.ready);
    await page.addStyleTag({
      content: ".viewport{height:850px!important;min-height:850px!important;}",
    });
    await page.evaluate(() => {
      __debug.reset();
      __debug.setOutfit(1);
      const r = __debug.renderer,
        original = r.render;
      window.__reviewView = 0;
      r.render = function (scene, camera) {
        const a = __debug.avatar(),
          yaw = a.root.rotation.y + window.__reviewView,
          p = a.root.position;
        camera.position.set(
          p.x + Math.sin(yaw) * 3.2,
          1.35,
          p.z + Math.cos(yaw) * 3.2,
        );
        camera.lookAt(p.x, 0.85, p.z);
        return original.call(this, scene, camera);
      };
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => __debug.pause());
    for (const [name, angle] of [
      ["front", 0],
      ["side", Math.PI / 2],
      ["back", Math.PI],
    ]) {
      await page.evaluate((a) => (window.__reviewView = a), angle);
      await page.waitForTimeout(80);
      await page
        .locator(".viewport")
        .screenshot({ path: path.join(out, `${name}.png`) });
    }
    const materialReport = await page.evaluate(() => {
      window.__reviewView = 0;
      const rows = [];
      __debug.avatar().root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of materials) {
          rows.push({
            mesh: mesh.name,
            name: m.name,
            visible: mesh.visible,
            transparent: m.transparent,
            alphaTest: m.alphaTest,
            side: m.side,
            depthWrite: m.depthWrite,
            isOutline: m.isOutline,
          });
          if (m.isOutline) continue;
          if (m.name?.startsWith("Tops_")) {
            m.color?.set("#ff0000");
            m.shadeColorFactor?.set("#aa0000");
          }
          if (m.name?.startsWith("Bottoms_")) {
            m.color?.set("#ffff00");
            m.shadeColorFactor?.set("#ffff00");
            m.map = null;
            m.needsUpdate = true;
          }
        }
      });
      return rows;
    });
    await page.waitForTimeout(100);
    await page
      .locator(".viewport")
      .screenshot({ path: path.join(out, "identity-colors.png") });
    await fs.writeFile(
      path.join(out, "materials.json"),
      JSON.stringify(
        {
          url: page.url(),
          materialReport,
          diagnosticOnly:
            "Tops red, Bottoms yellow. All meshes remain visible. These color changes are not applied to product.",
        },
        null,
        2,
      ),
    );
    console.log(out);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
