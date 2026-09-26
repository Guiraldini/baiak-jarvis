const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

(async () => {
  let clock = 1000;
  const listeners = {};
  const reloaded = [];
  const recoveries = [];
  let autoReload = true;
  const ext = {
    alarms: {
      get: async () => ({}), create: () => {},
      onAlarm: { addListener: (callback) => { listeners.alarm = callback; } }
    },
    runtime: {
      getManifest: () => ({}),
      onInstalled: { addListener: () => {} }, onStartup: { addListener: () => {} },
      onMessage: { addListener: (callback) => { listeners.message = callback; } }
    },
    tabs: {
      query: async () => [{ id: 1 }],
      reload: async (id) => { reloaded.push(id); },
      onRemoved: { addListener: () => {} }
    },
    storage: { local: {
      get: async () => ({ bjSettings: { autoReload } }),
      set: async (value) => { recoveries.push(value.bjRecovery); }
    } }
  };
  class FakeDate extends Date { static now() { return clock; } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../chrome/src/background.js"), "utf8"), {
    chrome: ext, Date: FakeDate, navigator: { userAgent: "Chrome/140.0.0.0" }, console
  });

  await listeners.alarm({ name: "bj-watchdog" });
  assert.deepEqual(reloaded, []);
  clock += 181000;
  await listeners.alarm({ name: "bj-watchdog" });
  assert.deepEqual(reloaded, [1]);
  assert.equal(recoveries[0].reason, "A página parou de responder.");

  autoReload = false;
  clock += 301000;
  await listeners.alarm({ name: "bj-watchdog" });
  assert.deepEqual(reloaded, [1]);
  console.log("recovery.test.js: todos os testes passaram");
})().catch((error) => { console.error(error); process.exitCode = 1; });
