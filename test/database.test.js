const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { databaseUri, pingDatabase } = require('../db');
const { healthHandler } = require('../health');

test('private configuration is mandatory; legacy variable remains supported', () => {
  assert.throws(() => databaseUri({}), /MONGODB_URI/);
  assert.throws(() => databaseUri({ MONGODB_URI: 'invalid-secret-marker' }), /MONGODB_URI/);
  assert.equal(databaseUri({ MONGO_URI: 'mongodb://localhost/legacy' }), 'mongodb://localhost/legacy');
  assert.equal(databaseUri({ MONGODB_URI: 'mongodb://localhost/new', MONGO_URI: 'mongodb://localhost/old' }), 'mongodb://localhost/new');
});

test('disconnected database cannot report healthy', async () => {
  await assert.rejects(pingDatabase());
});

for (const available of [true, false]) {
  test(`health response: ${available ? '200 after ping' : '503 without leaking errors'}`, async () => {
    const res = { set(k, v) { this.header = [k, v]; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    let called = false;
    await healthHandler(async () => { called = true; if (!available) throw new Error('private-secret-marker'); })({}, res);
    assert.equal(called, true);
    assert.equal(res.code, available ? 200 : 503);
    assert.deepEqual(res.header, ['Cache-Control', 'no-store']);
    assert.deepEqual(res.body, available ? { status: 'ok', database: 'up' } : { status: 'unavailable', database: 'down' });
  });
}

test('connection CLI and startup fail closed with invalid URI', () => {
  for (const file of ['scripts/check-db.js', 'server.js']) {
    const result = spawnSync(process.execPath, [file], {
      env: { ...process.env, MONGODB_URI: 'private-secret-marker', MONGO_URI: '' },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /private-secret-marker/);
  }
});

test('HTTP routes distinguish liveness from disconnected readiness', async () => {
  const { app } = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const live = await fetch(`${base}/healthz`);
    assert.equal(live.status, 200);
    const ready = await fetch(`${base}/health`);
    assert.equal(ready.status, 503);
    assert.equal(ready.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await ready.json(), { status: 'unavailable', database: 'down' });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
