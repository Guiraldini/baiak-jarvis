const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const listeners = new Map();
const seen = [];
const document = {
  addEventListener(name, callback) { listeners.set(name, callback); },
  dispatchEvent(event) { seen.push(event); listeners.get(event.type)?.(event); }
};
const window = {};
window.top = window;
const context = vm.createContext({ window, document, CustomEvent: class {
  constructor(type, options) { this.type = type; this.detail = options.detail; }
} });
vm.runInContext(fs.readFileSync(require.resolve("../chrome/src/codex-bridge.js"), "utf8"), context);
vm.runInContext('JSON.parse(\'{"mode":"exercise","players":[{"name":"Mox"}]}\')', context);
assert.equal(seen.find((event) => event.type === "baiak-jarvis:mode")?.detail, "exercise");
vm.runInContext('JSON.parse(\'{"codex":{"done":[],"unlocked":["hunt-cobra-cave-2"],"prog":{"hunt-cobra-cave-2":[2]}}}\')', context);
const codex = JSON.parse(seen.find((event) => event.type === "baiak-jarvis:codex")?.detail);
assert.deepEqual(codex.unlocked, ["hunt-cobra-cave-2"]);
vm.runInContext('JSON.parse(\'{"autoCodexOn":true,"autoCodexGear":false,"autoCodexPay":false,"autoCodexTargets":["hunt-cobra-cave-2"]}\')', context);
const auto = JSON.parse(seen.find((event) => event.type === "baiak-jarvis:codex-auto")?.detail);
assert.deepEqual(auto, { enabled: true, gear: false, pay: false, targets: ["hunt-cobra-cave-2"] });
console.log("bridge.test.js: todos os testes passaram");
