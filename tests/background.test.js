const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const listeners = {};
const downloads = [];
const openedTabs = [];
const releaseUrl = "https://github.com/Guiraldini/baiak-jarvis/releases/download/v0.8.18/baiak-jarvis-chrome-v0.8.18.zip";
const extension = {
  alarms: { get: async () => ({}), create: () => {}, onAlarm: { addListener: () => {} } },
  runtime: {
    onInstalled: { addListener: () => {} }, onStartup: { addListener: () => {} },
    onMessage: { addListener: (listener) => { listeners.message = listener; } }
  },
  tabs: {
    onRemoved: { addListener: () => {} },
    create: async (options) => { openedTabs.push(options); return { id: 1 }; }
  },
  downloads: { download: async (options) => { downloads.push(options); return 42; } }
};
const fetchRequests = [];
const fetch = async (url) => {
  fetchRequests.push(url);
  return { ok: true, json: async () => ({
    tag_name: "v0.8.18", assets: [{ name: "baiak-jarvis-chrome-v0.8.18.zip", browser_download_url: releaseUrl }]
  }) };
};
vm.runInNewContext(fs.readFileSync(require.resolve("../chrome/src/background.js"), "utf8"), {
  chrome: extension, fetch, AbortSignal, console
});

function send(message) {
  return new Promise((resolve) => {
    const pending = listeners.message(message, {}, resolve);
    if (!pending) setImmediate(() => resolve(null));
  });
}

(async () => {
  const release = await send({ type: "bj:latest-release" });
  assert.equal(release.version, "v0.8.18");
  assert.equal(release.downloadUrl, releaseUrl);
  assert.equal(fetchRequests.length, 1);
  assert.equal((await send({ type: "bj:download-release", url: "https://evil.example/update.zip" })).ok, false);
  assert.equal(downloads.length, 0);
  assert.equal((await send({ type: "bj:download-release", url: release.downloadUrl })).ok, true);
  assert.equal(downloads[0].url, releaseUrl);
  assert.equal(openedTabs.length, 0);
  console.log("background.test.js: todos os testes passaram");
})().catch((error) => { console.error(error); process.exitCode = 1; });
