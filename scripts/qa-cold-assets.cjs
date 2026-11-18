const assert = require('node:assert/strict');

async function observeNetwork(context, page) {
  const session = await context.newCDPSession(page);
  await session.send('Network.enable', {maxTotalBufferSize: 96 * 1024 * 1024, maxResourceBufferSize: 32 * 1024 * 1024});
  await session.send('Network.setCacheDisabled', {cacheDisabled: true});
  await session.send('Network.setBypassServiceWorker', {bypass: true});
  const responses = [], finished = new Map(), cached = new Set(), failed = [];
  session.on('Network.responseReceived', row => responses.push(row));
  session.on('Network.loadingFinished', row => finished.set(row.requestId, row));
  session.on('Network.requestServedFromCache', row => cached.add(row.requestId));
  session.on('Network.loadingFailed', row => failed.push(row));

  async function read(url) {
    const matches = responses.filter(row => row.response.url === url);
    assert.equal(matches.length, 1, `Expected one cold response for ${url}, got ${matches.length}`);
    const [{requestId, response}] = matches;
    const done = finished.get(requestId);
    assert.equal(response.status, 200, `Unexpected status for ${url}`);
    assert.ok(done && !failed.some(row => row.requestId === requestId), `Incomplete network response for ${url}`);
    assert.ok(!cached.has(requestId) && !response.fromDiskCache && !response.fromServiceWorker && !response.fromPrefetchCache,
      `Cache or service worker served ${url}`);
    const headers = Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [name.toLowerCase(), value]));
    const contentEncoding = headers['content-encoding'] ?? 'identity';
    assert.equal(contentEncoding, 'identity', `Use the uncompressed fixed-build HTTP harness for ${url}`);
    const body = await session.send('Network.getResponseBody', {requestId});
    const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
    if (headers['content-length'] !== undefined) assert.equal(bytes.length, Number(headers['content-length']), url);
    assert.ok(bytes.length > 0 && done.encodedDataLength >= bytes.length, `Missing measured transfer bytes for ${url}`);
    return {bytes, status:response.status, protocol:response.protocol, contentEncoding, transferBytes:done.encodedDataLength};
  }
  return {read, diagnostics: () => ({
    httpErrors:responses.filter(row => row.response.status >= 400).map(({response}) => ({url:response.url, status:response.status})),
    failed:failed.map(({requestId, type, errorText, canceled}) => ({requestId, type, errorText, canceled})),
  })};
}

module.exports = {observeNetwork};
