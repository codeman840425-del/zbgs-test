const fs = require('node:fs/promises');
const path = require('node:path');

const checkout = path.resolve(__dirname, '../..');
const defaultDist = path.join(checkout, 'prototype', 'dist-company');

async function prepareQaOutput(requested, runName) {
  const {checkManagedOutput, findManagedProject} = await import('./package-company.mjs');
  const project = await findManagedProject(checkout) || checkout;
  const destination = requested ? path.resolve(requested) : path.join(project, 'output', 'playwright', runName);
  await checkManagedOutput(destination, checkout, {allowDelivery: false});
  let out;
  if (requested) {
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.mkdir(destination);
    out = destination;
  } else {
    await fs.mkdir(destination, {recursive: true});
    out = await fs.mkdtemp(path.join(destination, 'run-'));
  }
  const temp = path.join(out, 'tmp');
  await fs.mkdir(temp);
  for (const name of ['TEMP', 'TMP', 'TMPDIR']) process.env[name] = temp;
  console.log('QA output:', out);
  return out;
}

module.exports = {defaultDist, prepareQaOutput};
