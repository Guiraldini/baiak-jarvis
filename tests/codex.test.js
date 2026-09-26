const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "chrome", "src", "codex-bridge.js"), "utf8");
const listeners = new Map();
const events = [];
const document = {
  addEventListener(name, listener) { listeners.set(name, listener); },
  dispatchEvent(event) {
    events.push(event);
    listeners.get(event.type)?.(event);
  }
};
class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}
const window = {};
window.top = window;
const context = vm.createContext({ window, document, CustomEvent });
vm.runInContext(source, context);

assert.equal(vm.runInContext('JSON.parse("{\\"ordinary\\":true}").ordinary', context), true);
assert.equal(events.length, 0);
vm.runInContext('JSON.parse(JSON.stringify({codex:{done:[],prog:{"hunt-troll-cave":[125,50,16]}}}))', context);
assert.equal(events.length, 1);
assert.deepEqual(JSON.parse(events[0].detail).prog["hunt-troll-cave"], [125, 50, 16]);
document.dispatchEvent(new CustomEvent("baiak-jarvis:codex-request"));
assert.equal(events.length, 3);
assert.equal(events[2].detail, events[0].detail);
vm.runInContext('JSON.parse(JSON.stringify({codex:{done:[],prog:{"hunt-troll-cave":[125,50,16]}}}))', context);
assert.equal(events.length, 3);
vm.runInContext('JSON.parse(JSON.stringify({codex:{done:[],prog:{"hunt-troll-cave":[125,50,17]}}}))', context);
assert.equal(events.length, 4);

const catalogSource = fs.readFileSync(path.join(__dirname, "..", "chrome", "src", "codex-catalog.js"), "utf8");
vm.runInContext(catalogSource, context);
const catalog = vm.runInContext("BaiakJarvisCodexCatalog", context);
const troll = catalog.find((hunt) => hunt.id === "troll-cave");
assert.equal(troll.name, "Troll Cave");
assert.equal(troll.req[0].item, "fish");
assert.equal(troll.req[0].qty, 125);
assert.equal(catalog.find((hunt) => hunt.id === "cobra-cave")?.name, "Cobras");
console.log("codex.test.js: todos os testes passaram");
