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

const rankingCatalog = {
  missions: [
    { id: "hunt-near", title: "Quase pronta" },
    { id: "hunt-far", title: "Distante" },
    { id: "hunt-locked-2", title: "Bloqueada" },
    { id: "set-gear", title: "Equipamento" }
  ],
  items: {
    flower: [[0, 0, 10, null, null, false], [1, 0, 100, null, null, false], [2, 0, 1, null, null, false]],
    leaf: [[0, 1, 5, null, null, false], [1, 1, 100, null, null, false]],
    sword: [[3, 0, 1, null, null, false]]
  }
};
const best = core.bestCodexMission([
  { name: "flower", count: 3, tier: 0, material: true },
  { name: "sword", count: 1, tier: 0, material: false }
], rankingCatalog, { done: [], unlocked: [], prog: { "hunt-near": [8, 5], "hunt-far": [1, 0] } });
assert.deepEqual(best, { id: "hunt-near", title: "Quase pronta", available: 2, missingAfterPouch: 0 });
assert.equal(core.bestCodexMission([{ name: "sword", count: 1, tier: 0, material: false }], rankingCatalog,
  { done: [], unlocked: [], prog: {} }), null);
assert.deepEqual(core.bestCodexMission([{ name: "flower", count: 1, tier: 0, material: true }], rankingCatalog,
  { done: ["hunt-near", "hunt-far", "hunt-locked"], unlocked: ["hunt-locked-2"], prog: {} })?.id,
"hunt-locked-2");

const allCodexCatalog = {
  missions: [
    { id: "hunt-other", title: "Hunt fora da fase atual" },
    { id: "boss-gravedigger-1", title: "Chefe I" },
    { id: "boss-gravedigger-2", title: "Chefe II" },
    { id: "set-sword", title: "Equipamento" }
  ],
  items: { flower: [[0, 0, 10, null, null, false], [1, 0, 2, null, null, false],
    [2, 0, 4, null, null, false], [3, 0, 1, null, null, false]] }
};
assert.equal(core.bestCodexMission([{ name: "flower", count: 2, tier: 0, material: true }],
  allCodexCatalog, { done: [], unlocked: [], prog: {} })?.id, "boss-gravedigger-1");
assert.equal(core.bestCodexMission([{ name: "flower", count: 2, tier: 0, material: true }],
  allCodexCatalog, { done: ["boss-gravedigger-1"], unlocked: ["boss-gravedigger-2"], prog: {} })?.id,
"boss-gravedigger-2");
assert.equal(core.bestCodexMission([{ name: "flower", count: 2, tier: 0, material: true }],
  allCodexCatalog, { done: ["boss-gravedigger-1"], unlocked: [], prog: {} })?.id, "hunt-other");

const pouch = [{ name: "demonic essence", count: 14, tier: 0, material: true }];
assert.equal(core.codexDeliveryIsMaterialOnly([{ name: "demonic essence", count: 14, valuable: false }], pouch), true);
assert.equal(core.codexDeliveryIsMaterialOnly([{ name: "demonic essence", count: 15, valuable: false }], pouch), false);
assert.equal(core.codexDeliveryIsMaterialOnly([{ name: "demonic essence", count: 14, valuable: false },
  { name: "sword", count: 1, valuable: false }], pouch), false);
assert.equal(core.codexDeliveryIsMaterialOnly([{ name: "demonic essence", count: 14, valuable: true }], pouch), false);

console.log("loot-codex.test.js: todos os testes passaram");
