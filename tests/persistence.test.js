const assert = require("node:assert/strict");
const core = require("../chrome/src/core.js");

(async () => {
  let releaseFirst;
  const firstCanFinish = new Promise((resolve) => { releaseFirst = resolve; });
  let value = 1;
  const stored = [];
  const persist = core.createLatestWriteQueue(() => value, async (snapshot) => {
    if (snapshot === 1) await firstCanFinish;
    stored.push(snapshot);
  });
  const first = persist();
  await Promise.resolve();
  value = 2;
  const second = persist();
  assert.deepEqual(stored, []);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(stored, [1, 2]);

  let attempts = 0;
  const retry = core.createLatestWriteQueue(() => ++attempts, async (snapshot) => {
    if (snapshot === 1) throw new Error("storage unavailable");
    stored.push(snapshot);
  });
  await assert.rejects(retry(), /storage unavailable/);
  await retry();
  assert.equal(stored.at(-1), 2);
  console.log("persistence.test.js: todos os testes passaram");
})().catch((error) => { console.error(error); process.exitCode = 1; });
