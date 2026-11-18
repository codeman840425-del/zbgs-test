import {execFileSync} from 'node:child_process';
import {realpath} from 'node:fs/promises';
import path from 'node:path';
import {productionRoot, projectOutput} from '../project-output.cjs';
import {compareGameRuntimeBuilds} from './game-record-inventory.mjs';
import {jsonBytes, writeFresh} from './files.mjs';

const [published, rebuilt, checkout, output] = process.argv.slice(2);
if (!output || process.argv.length !== 6) throw Error('Expected PUBLISHED_DIST REBUILT_DIST CLEAN_CHECKOUT NEW_REVIEW_FILE');
const destination = await projectOutput(output, await productionRoot());
const [dist, repeat, sourceRoot] = await Promise.all([published, rebuilt, checkout].map(file => realpath(file)));
if (!path.relative(dist, repeat) || path.relative(sourceRoot, repeat) !== path.join('prototype', 'dist'))
  throw Error('Use the independently rebuilt prototype/dist in a separate clean checkout');
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], {encoding:'utf8'}).trim();
if (git('status', '--porcelain', '--untracked-files=normal')) throw Error('Source checkout has local changes');
const sourceCommit = git('rev-parse', 'HEAD');
const review = await compareGameRuntimeBuilds({dist, rebuilt:repeat, sourceRoot, sourceCommit});
await writeFresh(destination, jsonBytes(review));
console.log(JSON.stringify({sourceCommit, sourceDigest:review.sourceDigest, files:Object.keys(review.files).length}));
