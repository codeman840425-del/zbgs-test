// Resolve the producer's write boundary independently of the selected game input.
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

async function productionRoot() {
  const checkout = await fs.realpath(path.join(__dirname, '..'));
  try { await fs.lstat(path.join(checkout, '.git')); }
  catch (error) { if (error.code === 'ENOENT') return checkout; throw error; }
  const env = {...process.env};
  const git = args => execFileSync('git', args, {cwd:checkout, env, encoding:'utf8', windowsHide:true});
  for (const name of git(['rev-parse', '--local-env-vars']).trim().split(/\s+/)) delete env[name];
  const first = git(['worktree', 'list', '--porcelain', '-z']).split('\0', 1)[0];
  if (!first.startsWith('worktree ')) throw Error('Cannot identify the production checkout');
  return fs.realpath(first.slice('worktree '.length));
}

async function canonicalOutput(absolute) {
  try { return await fs.realpath(absolute); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const entry = await fs.lstat(absolute).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (entry || path.dirname(absolute) === absolute) throw error;
    return path.join(await canonicalOutput(path.dirname(absolute)), path.basename(absolute));
  }
}

async function projectOutput(value, root) {
  const absolute = path.resolve(value);
  if (process.platform === 'win32') {
    const parts = absolute.slice(path.parse(absolute).root.length).split(path.sep);
    if (/^\\\\[?.]\\/.test(absolute) || parts.some(part => /[.: ]$/.test(part) ||
        part.includes(':') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
      throw Error('Unsupported Windows output path');
  }
  const target = await canonicalOutput(absolute);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
    throw Object.assign(Error('Production output must be inside the project: ' + target), {code:'outside-project'});
  return target;
}

module.exports = {productionRoot, projectOutput};
