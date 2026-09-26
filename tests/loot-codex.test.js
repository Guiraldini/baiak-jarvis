const assert = require("node:assert/strict");
const core = require("../chrome/src/core.js");
require("../chrome/src/codex-item-catalog.js");
const catalog = globalThis.BaiakJarvisCodexItemCatalog;

assert.equal(catalog.missions.length, 690);
assert.ok(Object.keys(catalog.items).length > 1000);
assert.ok(catalog.missions.some((mission) => mission.id === "hunt-cobra-cave-3"));
assert.ok(catalog.missions.some((mission) => mission.id === "boss-ahau-1"));
assert.ok(catalog.missions.some((mission) => mission.id.startsWith("set-leather-")));
assert.ok(catalog.items["cobra crest"].length === 3);

const progress = {
  done: ["hunt-cobra-cave"],
  prog: { "hunt-cobra-cave-2": [400, 0, 0], "hunt-cobra-cave-3": [13500, 13500, 13500] }
};
const needs = core.codexItemNeeds("Cobra Crest", 0, catalog, progress);
assert.deepEqual(needs.map((entry) => [entry.id, entry.missing]), [["hunt-cobra-cave-2", 4100]]);
assert.deepEqual(core.codexItemNeeds("item sem codex", 0, catalog, progress), []);
assert.equal(core.codexItemNeeds("cobra crest", 0, catalog, null), null);

const tierCatalog = {
  missions: [{ id: "set-test-2", title: "Set Teste (Raro)" }],
  items: { sword: [[0, 0, 1, 2, null, false]] }
};
assert.deepEqual(core.codexItemNeeds("sword", 1, tierCatalog, { done: [], prog: {} }), []);
assert.equal(core.codexItemNeeds("sword", 2, tierCatalog, { done: [], prog: {} }).length, 1);
assert.deepEqual(core.codexItemNeeds("sword", 2, tierCatalog, { done: [], prog: { "set-test-2": [1] } }), []);

console.log("loot-codex.test.js: todos os testes passaram");
