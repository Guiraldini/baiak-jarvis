const assert = require("node:assert/strict");
const core = require("../chrome/src/core.js");
require("../chrome/src/equipment-catalog.js");
const equipmentCatalog = globalThis.BaiakJarvisEquipmentCatalog;
assert.ok(equipmentCatalog.items.length > 1500);
const deeplingFork = equipmentCatalog.items.find((item) => item.name === "deepling fork");
const lionSpellbook = equipmentCatalog.items.find((item) => item.name === "lion spellbook");
assert.equal(core.canEquipCatalogItem(deeplingFork, { vocation: "Druid", level: 229 }), false);
assert.equal(core.canEquipCatalogItem(deeplingFork, { vocation: "Druid", level: 230 }), true);
assert.equal(core.canEquipCatalogItem(deeplingFork, { vocation: "Knight", level: 500 }), false);
assert.equal(core.canEquipCatalogItem(lionSpellbook, { vocation: "Druid", level: 230 }), true);
const druidSet = core.equipmentRecommendations({
  vocation: "Druid", level: 230, equipment: [{ name: "Deepling Fork" }]
}, equipmentCatalog.items);
assert.equal(druidSet.pair.weapon.name, "deepling fork");
assert.equal(druidSet.pair.offhand.name, "lion spellbook");
assert.equal(druidSet.slots.find((entry) => entry.slot === "shield").best.name, "lion spellbook");
assert.equal(druidSet.slots.find((entry) => entry.slot === "weapon").equipped.name, "deepling fork");
const twoHandSet = core.equipmentRecommendations({ vocation: "Druid", level: 230 }, [
  { name: "one hand", slot: "weapon", wt: "wand", level: 100, wandMin: 80, wandMax: 100 },
  { name: "two hands", slot: "weapon", wt: "wand", level: 100, twoHanded: true, wandMin: 900, wandMax: 1000 },
  { name: "book", slot: "shield", level: 100, skills: { magic: 4 } }
]);
assert.equal(twoHandSet.pair.weapon.name, "two hands");
assert.equal(twoHandSet.pair.offhand, null);
assert.equal(twoHandSet.slots.some((entry) => entry.slot === "shield"), false);

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
assert.equal(core.skillMemberName("Druid · Gabsm", "ED"), "Gabsm");
assert.equal(core.skillMemberName("Knight · Maxxi", "EK"), "Maxxi");
assert.equal(core.skillMemberName("", "Amigo"), "Amigo");
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
assert.equal(core.brazilDayKey(Date.parse("2026-09-23T02:59:59Z")), "2026-09-22");
assert.equal(core.brazilDayKey(Date.parse("2026-09-23T03:00:00Z")), "2026-09-23");
const dailyRuns = [
  { completedAt: Date.parse("2026-09-23T02:59:59Z"), xpGain: 100 },
  { completedAt: Date.parse("2026-09-23T03:00:00Z"), xpGain: 200 },
  { completedAt: Date.parse("2026-09-23T12:00:00Z"), xpGain: 300 }
];
assert.deepEqual(core.dailyHuntXp(dailyRuns, "2026-09-23"), { day: "2026-09-23", xp: 500, waves: 2, partial: false });
assert.equal(core.dailyHuntXp(Array.from({ length: 200 }, () => dailyRuns[1]), "2026-09-23").partial, true);
assert.deepEqual(core.addDailyHuntRun({ day: "2026-09-22", xp: 900, waves: 3, partial: true }, dailyRuns[1]),
  { day: "2026-09-23", xp: 200, waves: 1, partial: false });
assert.equal(core.mountStaminaBonusMinutes("+15 min"), 15);
assert.equal(core.mountStaminaBonusMinutes("+1h 15 min"), 75);
assert.equal(core.mountStaminaBonusMinutes("—"), null);
assert.deepEqual(core.huntRunTransition(
  { hadBossWave: true, lastWaveNumber: 10, lastDurationSeconds: 160 },
  { waveNumber: 1, durationSeconds: 165 }
), { waveRestarted: true, timerReset: false });
assert.deepEqual(core.huntRunTransition(
  { hadBossWave: false, fromBoundary: true, lastWaveNumber: 1, lastDurationSeconds: 165 },
  { waveNumber: 2, durationSeconds: 8 }
), { waveRestarted: false, timerReset: true });
assert.deepEqual(core.huntRunTransition(
  { hadBossWave: false, lastWaveNumber: 4, lastDurationSeconds: 60 },
  { waveNumber: 5, durationSeconds: 64 }
), { waveRestarted: false, timerReset: false });

const huntSummary = core.summarizeHuntRuns([
  { huntName: "Cobras", durationSeconds: 600, xpGain: 2000000, loot: 300000, balance: 250000, completedAt: 1 },
  { huntName: "Cobras", durationSeconds: 660, xpGain: 2100000, loot: 400000, balance: 320000, completedAt: 2 },
  { huntName: "Dragon Lair", durationSeconds: 480, xpGain: 1800000, loot: 200000, balance: 160000, completedAt: 3 },
  { huntName: "Ignorada", durationSeconds: 0, xpGain: null }
]);
assert.equal(huntSummary.length, 2);
assert.equal(huntSummary[0].huntName, "Dragon Lair");
assert.equal(huntSummary[0].xpPerHour, 13500000);
assert.equal(huntSummary.find((item) => item.huntName === "Cobras").runs, 2);
assert.equal(Math.round(huntSummary.find((item) => item.huntName === "Cobras").averageDurationSeconds), 630);
assert.equal(huntSummary.find((item) => item.huntName === "Cobras").averageLoot, 350000);
const firstHunt = { huntName: "Livraria EARTH", durationSeconds: 180, xpGain: 900000, loot: 120000, balance: 110000 };
const newerHunts = Array.from({ length: 200 }, (_, index) => ({
  huntName: ["Livraria FIRE", "Vexclaw", "Mega Dragon", "Undead Dragon"][index % 4],
  durationSeconds: 180, xpGain: 1000000, loot: 130000, balance: 120000
}));
const archive = core.archiveHuntRuns({}, [firstHunt]);
const fiveHunts = core.summarizeHuntRuns(newerHunts, archive);
assert.equal(fiveHunts.length, 5);
assert.equal(fiveHunts.find((item) => item.huntName === "Livraria EARTH").runs, 1);
assert.equal(fiveHunts.find((item) => item.huntName === "Livraria FIRE").runs, 50);
assert.equal(core.archiveHuntRuns(archive, [{ ...firstHunt, xpGain: 1200000 }])["livraria earth"].runs, 2);
assert.equal(Math.round(core.relativeDifference(18076309, 17056836) * 100) / 100, 5.98);
assert.equal(Math.round(core.relativeDifference(17056836, 18076309) * 100) / 100, -5.64);
assert.equal(core.relativeDifference(100, 0), null);
assert.equal(core.bossModeDetected({ badgeText: "Boss" }), true);
assert.equal(core.bossModeDetected({ partyManageTitle: "Não dá pra mexer na party durante um boss." }), true);
assert.equal(core.bossModeDetected({ badgeText: "", partyManageTitle: "Gerenciar party" }), false);
assert.equal(core.bossModeDetected({
  location: "Mega Dragon", waveCount: 10, timerVisible: true,
  badgeText: "Boss", partyManageTitle: "Não dá pra mexer na party durante um boss."
}), false);
assert.equal(core.bossModeDetected({ location: "Chefes", waveCount: 10, timerVisible: true }), true);

const vipTrainingPlan = core.staminaPlan(snapshot, { vipActive: true });
assert.equal(vipTrainingPlan.phase, "train");
assert.equal(vipTrainingPlan.action, "CONTINUE TREINANDO");
assert.equal(vipTrainingPlan.trainingRate, 8);
assert.equal(vipTrainingPlan.huntFloor, 403);
assert.equal(vipTrainingPlan.huntCeiling, 1363);
assert.equal(vipTrainingPlan.targetPercent, 54);
assert.equal(vipTrainingPlan.remainingRealMinutes, 32.25);

const mountedPlan = core.staminaPlan({ ...snapshot, stamina: { time: "16:56", percent: 40, maxMinutes: 42 * 60 + 15 }, location: "Cobras", activity: "caçando" }, { vipActive: true });
assert.equal(mountedPlan.maxMinutes, 2535);
assert.equal(mountedPlan.huntFloor, 406);
assert.equal(mountedPlan.huntCeiling, 1366);
assert.equal(mountedPlan.remainingRealMinutes, 610);
assert.equal(mountedPlan.plannedHuntMinutes, 960);
assert.deepEqual(core.automationDecision({
  ...snapshot, location: "Cobras", activity: "caçando",
  stamina: { time: "6:46", percent: 16, maxMinutes: 2535 }
}, { enabled: true, huntName: "Cobras", vipActive: true }), {
  type: "train", target: "Treino online", reason: "Stamina chegou a 6h46 (16%)."
});
assert.deepEqual(core.automationDecision({
  ...snapshot, location: "Treino online", activity: "treinando",
  stamina: { time: "22:46", percent: 54, maxMinutes: 2535 }
}, { enabled: true, huntName: "Cobras", vipActive: true }), {
  type: "hunt", target: "Cobras", reason: "Stamina chegou a 22h46 (54%)."
});

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

assert.deepEqual(core.catalogStageFromCells([
  "500+", "Livraria EARTH (dados de catálogo)",
  "Biting Book, Cursed Book, Ink Blob",
  "small diamond, small stone, small topaz, protection amulet"
]), {
  title: "Livraria EARTH", level: 500,
  monsters: ["Biting Book", "Cursed Book", "Ink Blob"],
  drops: ["small diamond", "small stone", "small topaz", "protection amulet"]
});
assert.equal(core.catalogStageFromCells(["Nível mínimo", "Fase", "Monstros", "Drops"]), null);

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

const bossCards = [
  { name: "Ahau", favorite: true, ready: false },
  { name: "Prince Drazzak", favorite: true, ready: true },
  { name: "Lady Tenebris", favorite: true, ready: true },
  { name: "Sem estrela", favorite: false, ready: true }
];
assert.deepEqual(core.bossRunDecision(bossCards, [], 3), { type: "fight", name: "Prince Drazzak" });
assert.deepEqual(core.bossRunDecision(bossCards, ["Prince Drazzak"], 2), { type: "fight", name: "Lady Tenebris" });
assert.deepEqual(core.bossRunDecision(bossCards, ["Prince Drazzak", "Lady Tenebris"], 1), { type: "stop", reason: "none-ready" });
assert.deepEqual(core.bossRunDecision(bossCards, [], 0), { type: "stop", reason: "no-charges" });
assert.deepEqual(core.bossRunDecision(bossCards, [], NaN), { type: "stop", reason: "charges-unknown" });
assert.deepEqual(core.bossRunDecision([{ name: "Outro", favorite: false, ready: true }], [], 3), { type: "stop", reason: "no-favorites" });
assert.deepEqual(core.bossRunDecision([
  { name: "Ahau", favorite: true, ready: true },
  { name: "Áhau", favorite: true, ready: true }
], [], 3), { type: "stop", reason: "ambiguous-boss" });

console.log("core.test.js: todos os testes passaram");
