const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const version = "0.8.21";
const releaseBase = `https://github.com/Guiraldini/baiak-jarvis/releases/download/v${version}`;
const assetFor = (browser) => `${releaseBase}/baiak-jarvis-${browser}-v${version}.zip`;

async function testBrowser(sourceBrowser, exposeBrowserApi, actualBrowser = sourceBrowser) {
  const listeners = {};
  const downloads = [];
  const openedTabs = [];
  const fetchRequests = [];
  const injections = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, `../${sourceBrowser}/manifest.json`), "utf8"));
  const extension = {
    alarms: { get: async () => ({}), create: () => {}, onAlarm: { addListener: () => {} } },
    runtime: {
      getManifest: () => manifest,
      onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: (listener) => { listeners.message = listener; } }
    },
    tabs: {
      onRemoved: { addListener: () => {} },
      query: async () => [{ id: 17, url: "https://baiakidle.com/jogar/" }],
      create: async (options) => { openedTabs.push(options); return { id: 1 }; }
    },
    scripting: {
      insertCSS: async (options) => { injections.push({ type: "css", ...options }); },
      executeScript: async (options) => { injections.push({ type: "js", ...options }); }
    },
    downloads: { download: async (options) => { downloads.push(options); return 42; } }
  };
  const fetch = async (url) => {
    fetchRequests.push(url);
    return { ok: true, json: async () => ({
      tag_name: `v${version}`,
      assets: ["chrome", "firefox"].map((kind) => ({
        name: `baiak-jarvis-${kind}-v${version}.zip`, browser_download_url: assetFor(kind)
      }))
    }) };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../${sourceBrowser}/src/background.js`), "utf8"), {
    chrome: extension, ...(exposeBrowserApi ? { browser: extension } : {}), fetch, AbortSignal, console,
    navigator: { userAgent: actualBrowser === "firefox" ? "Mozilla/5.0 Firefox/143.0" : "Mozilla/5.0 Chrome/140.0.0.0" }
  });

  function send(message) {
    return new Promise((resolve) => {
      const pending = listeners.message(message, {}, resolve);
      if (!pending) setImmediate(() => resolve(null));
    });
  }

  const release = await send({ type: "bj:latest-release" });
  assert.equal(release.version, `v${version}`);
  assert.equal(release.downloadUrl, assetFor(actualBrowser));
  assert.equal(fetchRequests.length, 1);
  assert.equal((await send({ type: "bj:download-release", url: assetFor(actualBrowser === "chrome" ? "firefox" : "chrome") })).ok, false);
  assert.equal((await send({ type: "bj:download-release", url: "https://evil.example/update.zip" })).ok, false);
  assert.equal(downloads.length, 0);
  assert.equal((await send({ type: "bj:download-release", url: release.downloadUrl })).ok, true);
  assert.equal(downloads[0].url, assetFor(actualBrowser));
  assert.equal(openedTabs.length, 0);
  await listeners.installed({ reason: "update" });
  assert.equal(injections.length, 3);
  assert.equal(injections[0].type, "css");
  assert.deepEqual(Array.from(injections[0].files), ["src/content.css"]);
  assert.equal(injections[1].world, "MAIN");
  assert.equal(injections[2].files.at(-1), "src/content.js");
  assert.equal(injections[2].target.tabId, 17);
}

(async () => {
  await testBrowser("chrome", false);
  await testBrowser("chrome", true);
  await testBrowser("firefox", true);
  await testBrowser("firefox", true, "chrome");
  console.log("background.test.js: todos os testes passaram");
})().catch((error) => { console.error(error); process.exitCode = 1; });
