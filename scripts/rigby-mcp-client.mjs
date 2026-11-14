/** Official Rigby2D MCP stdio client. No SDK and no replacement animation runtime.
 * node scripts/rigby-mcp-client.mjs --server vendor/rigby2d/src/mcp/server.js list
 * node scripts/rigby-mcp-client.mjs --server ... audit path/to/hero.json walk
 * node scripts/rigby-mcp-client.mjs --server ... call sample_pose --args-file request.json
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class RigbyMcpClient {
  constructor({ server, root = projectRoot, timeout = 30000 }) {
    this.nextId = 1;
    this.pending = new Map();
    this.transcript = [];
    this.stderr = '';
    this.timeout = timeout;
    this.child = spawn(process.execPath, [path.resolve(server), '--root', path.resolve(root)], {
      cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', text => { this.stderr += text; });
    const failPending = error => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.pending.clear();
    };
    this.child.on('error', failPending);
    this.child.on('exit', (code, signal) => failPending(new Error(`Rigby MCP exited ${code ?? signal}: ${this.stderr}`)));
    createInterface({ input: this.child.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); }
      catch { failPending(new Error(`Non-JSON on MCP stdout: ${line.slice(0, 200)}`)); return; }
      this.transcript.push({ direction: 'received', message });
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }
  request(method, params = {}) {
    const message = { jsonrpc: '2.0', id: this.nextId++, method, params };
    this.transcript.push({ direction: 'sent', message });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error(`MCP timeout: ${method}; ${this.stderr}`));
      }, this.timeout);
      this.pending.set(message.id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify(message) + '\n');
    });
  }
  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'zbgs-reproducible-qa', version: '1.0.0' },
    });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return result;
  }
  async call(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    if (result.isError) throw new Error(`Rigby tool ${name}: ${JSON.stringify(result.content)}`);
    return result.structuredContent ?? result;
  }
  close() { this.child.stdin.end(); }
}

async function main() {
  const args = process.argv.slice(2);
  function option(name, fallback) {
    const at = args.indexOf(name);
    if (at < 0) return fallback;
    if (!args[at + 1]) throw new Error(`Missing value for ${name}`);
    const value = args[at + 1]; args.splice(at, 2); return value;
  }
  const server = option('--server', path.join(projectRoot, 'vendor/rigby2d/src/mcp/server.js'));
  const root = option('--root', projectRoot);
  const output = option('--output', path.join(projectRoot, 'output/rigby/mcp-audit.json'));
  const argsFile = option('--args-file', null);
  const client = new RigbyMcpClient({ server, root });
  const report = { server: path.relative(projectRoot, server), root, startedAt: new Date().toISOString() };
  try {
    report.initialize = await client.initialize();
    const { tools } = await client.request('tools/list');
    report.tools = tools;
    if (args[0] === 'call') {
      const parameters = argsFile ? JSON.parse(await readFile(argsFile, 'utf8')) : JSON.parse(args[2] ?? '{}');
      report.result = await client.call(args[1], parameters);
    } else if (args[0] === 'audit') {
      const project = args[1];
      if (!project) throw new Error('audit needs a project path');
      report.inspect = await client.call('inspect_project', { path: project });
      report.validation = await client.call('validate_project', { path: project });
      report.rig = await client.call('describe_rig', { path: project });
      report.samples = [];
      if (args[2]) {
        report.animation = await client.call('describe_animation', { path: project, animation: args[2] });
        for (const time of [0, .25, .5, .75, 1]) {
          report.samples.push({ time, pose: await client.call('sample_pose', { path: project, animation: args[2], time }) });
        }
      } else report.samples.push({ time: 0, pose: await client.call('sample_pose', { path: project }) });
    } else if (args[0] !== 'list') throw new Error('Expected list, call TOOL, or audit PROJECT [ANIMATION]');
    report.ok = true;
  } catch (error) { report.ok = false; report.error = error.stack; process.exitCode = 1; }
  finally {
    report.stderr = client.stderr;
    report.transcript = client.transcript;
    client.close();
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.ok, server: report.initialize?.serverInfo, tools: report.tools?.length, output, error: report.error }, null, 2));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
