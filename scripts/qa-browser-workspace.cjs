const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');

async function launchSession(out, options, profile) {
  const project = await productionRoot();
  const persistent = profile !== undefined;
  if (persistent) profile = await projectOutput(profile, project);
  if (options.recordVideo) {
    const dir = await projectOutput(options.recordVideo.dir, project);
    options = {...options, recordVideo:{...options.recordVideo, dir}};
  }
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
    const launchOptions = {
      ...options,
      headless:options.headless ?? true,
      downloadsPath:scratch,
      tracesDir:scratch,
      env:{...process.env, CHROME_LOG_FILE:path.join(scratch, 'chrome.log'),
        XDG_CACHE_HOME:scratch, CUDA_CACHE_PATH:scratch, __GL_SHADER_DISK_CACHE_PATH:scratch},
      args:['--disk-cache-dir='+path.join(scratch, 'disk-cache'), '--crash-dumps-dir='+scratch],
    };
    const resource = persistent ? await chromium.launchPersistentContext(profile, launchOptions)
      : await chromium.launch(launchOptions);
    return {...(persistent ? {context:resource} : {browser:resource}), async close() {
      try { await resource.close(); }
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

function launchQABrowser(out, options = {}) {
  return launchSession(out, options);
}

function launchPersistentQABrowser(out, profile, options = {}) {
  if (!profile) throw Error('A QA browser profile directory is required');
  return launchSession(out, options, profile);
}

module.exports = {launchQABrowser, launchPersistentQABrowser};
