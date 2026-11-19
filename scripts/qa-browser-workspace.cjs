const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {productionRoot, projectOutput} = require('./project-output.cjs');

async function resolveBrowserConfig(file) {
  const approvedBrowser = require('./production/fusion-cft145.json');
  if (typeof file !== 'string' || !file.trim()) throw Error('Missing browser configuration');
  const config = JSON.parse(await fs.readFile(file, 'utf8'));
  if (Object.keys(config).sort().join(',') !== Object.keys(approvedBrowser).sort().join(',') ||
      !['schema','executableSha256','browserVersion','playwrightVersion'].every(key => config[key] === approvedBrowser[key]) ||
      !path.isAbsolute(config.executablePath) ||
      path.relative(path.resolve(approvedBrowser.executablePath), path.resolve(config.executablePath)) !== '')
    throw Error('Unapproved browser deployment');
  const executablePath = await fs.realpath(config.executablePath);
  if (path.relative(path.resolve(config.executablePath),executablePath) !== '' ||
      !(await fs.stat(executablePath)).isFile()) throw Error('Browser executable path changed');
  const executableSha256 = createHash('sha256').update(await fs.readFile(executablePath)).digest('hex');
  const playwrightVersion = require('../prototype/node_modules/playwright/package.json').version;
  const locked = require('../prototype/package-lock.json').packages['node_modules/playwright'].version;
  if (executableSha256 !== config.executableSha256 || playwrightVersion !== config.playwrightVersion || locked !== playwrightVersion)
    throw Error('Browser executable digest or locked Playwright version mismatch');
  return {executablePath,receipt:{executablePath,executableSha256,playwrightVersion,browserVersion:config.browserVersion}};
}

async function launchSession(out, options, profile) {
  const project = await productionRoot();
  const persistent = profile !== undefined;
  const {browserConfig, ...launch} = options;
  let deployment;
  if (browserConfig !== undefined) {
    if (launch.channel !== undefined || launch.executablePath !== undefined)
      throw Error('Conflicting browser selection');
    deployment = await resolveBrowserConfig(browserConfig);
    launch.executablePath = deployment.executablePath;
  }
  options = launch;
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
    if (deployment) {
      const browser = persistent ? resource.browser() : resource;
      if (browser?.version() !== deployment.receipt.browserVersion) {
        await resource.close();
        throw Error('Running browser version does not match the deployment');
      }
    }
    return {scratch, receipt:deployment?.receipt, ...(persistent ? {context:resource} : {browser:resource}), async close() {
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

module.exports = {launchQABrowser, launchPersistentQABrowser, resolveBrowserConfig};
