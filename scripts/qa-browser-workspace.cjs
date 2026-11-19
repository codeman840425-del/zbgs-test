const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');

async function launchQABrowser(out, options = {}) {
  const project = await productionRoot();
  const prefix = await projectOutput(path.join(out, '.browser-'), project);
  const scratch = await fs.mkdtemp(prefix);
  async function cleanup() {
    if (await projectOutput(scratch, project) !== scratch)
      throw Error('Browser scratch directory changed: ' + scratch);
    await fs.rm(scratch, {recursive:true, force:true, maxRetries:3});
  }

  const temporary = {TEMP:scratch, TMP:scratch, TMPDIR:scratch};
  const original = Object.fromEntries(Object.keys(temporary).map(name => [name, process.env[name]]));
  try {
    // Playwright creates its profile and artifacts in the Node process before Chrome starts.
    Object.assign(process.env, temporary);
    const {chromium} = require('../prototype/node_modules/playwright');
    const browser = await chromium.launch({
      ...options,
      headless:true,
      downloadsPath:scratch,
      tracesDir:scratch,
      env:{...process.env, CHROME_LOG_FILE:path.join(scratch, 'chrome.log'),
        XDG_CACHE_HOME:scratch, CUDA_CACHE_PATH:scratch, __GL_SHADER_DISK_CACHE_PATH:scratch},
      args:['--disk-cache-dir='+path.join(scratch, 'disk-cache'), '--crash-dumps-dir='+scratch],
    });
    return {browser, async close() {
      try { await browser.close(); }
      finally { await cleanup(); }
    }};
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

module.exports = {launchQABrowser};
