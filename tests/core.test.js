const assert = require("node:assert/strict");
const core = require("../chrome/src/core.js");

const fixture = `
BAIAK IDLE NatureMage 74.774.148
Stamina 18:25 Cai caçando · use o Treino online para recuperar 43%
Treino online treinando Loop
Training Information
NatureMage · Druid · Magic 99 (60%)
Steelguard · Knight · Melee 96 (41%)
Arcana · Sorcerer · Magic 94 (75%)
Party
SUP NatureMage Druid · lvl 267
TANK Steelguard Knight · lvl 234
DPS Arcana Sorcerer · lvl 238
Backpack Slots 6 / 74
Supply Pouch
Loot Pouch Slots 0 / 42
1115 item(ns) esperando na Caixa de entrada
`;

const snapshot = core.parseSnapshot({
  text: fixture,
  title: "NatureMage · Treino online — Baiak Idle",
  location: "Treino online",
  loopEnabled: true,
  now: 12345
});

assert.equal(snapshot.player, "NatureMage");
assert.deepEqual(snapshot.stamina, { time: "18:25", percent: 43 });
assert.deepEqual(snapshot.backpack, { used: 6, total: 74 });
assert.deepEqual(snapshot.lootPouch, { used: 0, total: 42 });
assert.equal(snapshot.inboxCount, 1115);
assert.equal(snapshot.gold, 74774148);
assert.equal(snapshot.characters.length, 3);
assert.equal(snapshot.characters.find((item) => item.name === "Steelguard").level, 234);
assert.equal(snapshot.characters.find((item) => item.name === "Steelguard").role, "TANK");

const detectedKnight = core.findPartyKnight(snapshot, {
  Steelguard: { name: "Steelguard", vocation: "Knight", hp: 5000, protections: { earth: 4 } }
});
assert.equal(detectedKnight.name, "Steelguard");
assert.equal(detectedKnight.hp, 5000);
assert.equal(detectedKnight.role, "TANK");

const twoKnights = {
  characters: [
    { name: "KnightDps", vocation: "Knight", role: "DPS" },
    { name: "PartyTank", vocation: "Knight", role: "TANK" }
  ]
};
assert.equal(core.findPartyKnight(twoKnights, {}).name, "PartyTank");

const recommendations = core.buildRecommendations(snapshot, "balanced");
assert.ok(recommendations.some((item) => item.id === "inbox"));
assert.ok(recommendations.some((item) => item.id === "training"));

assert.equal(core.numberFromPtBr("74.774.148"), 74774148);
assert.equal(core.percentFromPtBr("+21.346%"), 21.346);
assert.equal(core.percentFromPtBr("-4,04%"), -4.04);
assert.deepEqual(core.parseVitalBar("5.631/5.631"), { current: 5631, max: 5631 });
assert.deepEqual(core.parseVitalBar("1.567 / 1.700"), { current: 1567, max: 1700 });
assert.equal(core.parseVitalBar("sem leitura"), null);
assert.equal(core.usage({ used: 6, total: 12 }), 0.5);
assert.equal(core.elapsedToSeconds("03:28"), 208);
assert.equal(core.elapsedToSeconds("1:02:03"), 3723);
assert.equal(core.elapsedToSeconds("sem tempo"), null);
assert.equal(core.elapsedToSeconds("03:70"), null);

const huntSummary = core.summarizeHuntRuns([
  { huntName: "Cobras", durationSeconds: 600, xpGain: 2000000 },
  { huntName: "Cobras", durationSeconds: 660, xpGain: 2100000 },
  { huntName: "Dragon Lair", durationSeconds: 480, xpGain: 1800000 },
  { huntName: "Ignorada", durationSeconds: 0, xpGain: null }
]);
assert.equal(huntSummary.length, 2);
assert.equal(huntSummary[0].huntName, "Dragon Lair");
assert.equal(huntSummary[0].xpPerHour, 13500000);
assert.equal(huntSummary.find((item) => item.huntName === "Cobras").runs, 2);
assert.equal(Math.round(huntSummary.find((item) => item.huntName === "Cobras").averageDurationSeconds), 630);
assert.equal(core.bossModeDetected({ badgeText: "Boss" }), true);
assert.equal(core.bossModeDetected({ partyManageTitle: "Não dá pra mexer na party durante um boss." }), true);
assert.equal(core.bossModeDetected({ badgeText: "", partyManageTitle: "Gerenciar party" }), false);

const vipTrainingPlan = core.staminaPlan(snapshot, { vipActive: true });
assert.equal(vipTrainingPlan.phase, "train");
assert.equal(vipTrainingPlan.action, "CONTINUE TREINANDO");
assert.equal(vipTrainingPlan.trainingRate, 8);
assert.equal(vipTrainingPlan.huntFloor, 403);
assert.equal(vipTrainingPlan.huntCeiling, 1363);
assert.equal(vipTrainingPlan.targetPercent, 54);
assert.equal(vipTrainingPlan.remainingRealMinutes, 32.25);

const huntingSnapshot = {
  ...snapshot,
  location: "Hunt",
  activity: "caçando",
  stamina: { time: "22:43", percent: 54 }
};
const huntingPlan = core.staminaPlan(huntingSnapshot, { vipActive: true });
assert.equal(huntingPlan.phase, "hunt");
assert.equal(huntingPlan.remainingRealMinutes, 960);
assert.equal(huntingPlan.huntFloor, 403);
assert.equal(core.durationToMinutes("6:43"), 403);
assert.equal(core.formatMinutes(32.25), "33min");

const cobraStage = {
  focus: "Proteção física, terra e morte. Dano sagrado ajuda.",
  risk: "Cobra Assassin tem resistência física; Cobra Vizier tem fraqueza a holy.",
  monsters: [
    { name: "Cobra Vizier", maxDamage: 192 },
    { name: "Cobra Assassin", maxDamage: 202 },
    { name: "Cobra Scout", maxDamage: 200 }
  ]
};
const cobraMatchup = core.compareKnightToStage(cobraStage, {
  hp: 3906,
  protections: { physical: 0.2, earth: 0.2, death: 0.2 }
});
assert.deepEqual(core.elementMentions(cobraStage.focus), ["physical", "earth", "death", "holy"]);
assert.deepEqual(cobraMatchup.requiredProtection, ["physical", "earth", "death"]);
assert.equal(core.normalizeLookup("Cobra Cave — Físico"), "cobra cave fisico");
assert.equal(cobraMatchup.physicalResistance, true);
assert.equal(cobraMatchup.mostDangerous.name, "Cobra Assassin");
assert.ok(cobraMatchup.hitPercent > 5 && cobraMatchup.hitPercent < 6);

const balanceAdvice = core.buildBalanceAdvice(cobraStage, [
  { name: "PartyTank", vocation: "Knight", skillType: "Melee", skillLevel: 100, skillBonus: 7, protections: { physical: 10, earth: 6, death: 11 }, bonusEntries: [{ label: "Chance de crítico", value: "+1%" }] },
  { name: "PartyMage", vocation: "Sorcerer", skillType: "Magic", skillLevel: 103, skillBonus: 21, protections: { physical: 3, earth: 0, death: 6 }, bonusEntries: [] }
]);
assert.deepEqual(balanceAdvice.suggestedDamage, ["holy"]);
assert.ok(balanceAdvice.speed.some((item) => item.includes("resistência física")));
assert.ok(balanceAdvice.survival.some((item) => item.includes("PartyMage") && item.includes("Terra")));

const startTraining = core.automationDecision({
  ...snapshot,
  location: "Cobras",
  activity: "caçando",
  stamina: { time: "6:43", percent: 16 }
}, { enabled: true, huntName: "Cobras", vipActive: true });
assert.deepEqual(startTraining, {
  type: "train",
  target: "Treino online",
  reason: "Stamina chegou a 6h43 (16%)."
});

const startHunt = core.automationDecision({
  ...snapshot,
  location: "Treino online",
  activity: "treinando",
  stamina: { time: "22:43", percent: 54 }
}, { enabled: true, huntName: "Cobras", vipActive: true });
assert.deepEqual(startHunt, {
  type: "hunt",
  target: "Cobras",
  reason: "Stamina chegou a 22h43 (54%)."
});

assert.equal(core.automationDecision({
  ...snapshot,
  location: "Cobras",
  activity: "caçando",
  stamina: { time: "12:00", percent: 29 }
}, { enabled: true, huntName: "Cobras", vipActive: true }), null);

console.log("core.test.js: todos os testes passaram");
