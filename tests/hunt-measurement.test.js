const assert = require("node:assert/strict");
const core = require("../chrome/src/core.js");

const run = (name, start, xp, loot = 100, balance = 80) => ({
  huntName: name, startedAt: start, completedAt: start + 180000,
  durationSeconds: 180, xpGain: xp, loot, balance,
  characterXp: { hero: { name: "Hero", gain: xp * 0.6 } }
});
const old = Array.from({ length: 1587 }, (_, i) => run("Livraria FIRE", i * 200000, 1000000));
const resetAt = old.at(-1).completedAt + 100000;
let historyArchive = core.archiveHuntRuns({}, old.slice(0, -200));
let recent = old.slice(-200).concat(run("Cobras", resetAt - 200000, 500000));
let windows = { "livraria fire": { huntName: "Livraria FIRE", resetAt, archive: {} } };
const daily = core.dailyHuntXp(recent, core.brazilDayKey(resetAt));
const untouchedHistory = JSON.stringify({ historyArchive, recent, daily });
let summaries = core.summarizeHuntRuns(recent, historyArchive, windows);
assert.equal(summaries.find((h) => h.huntName === "Livraria FIRE").runs, 0);
assert.equal(summaries.find((h) => h.huntName === "Livraria FIRE").xpPerHour, 0);
assert.equal(summaries.find((h) => h.huntName === "Cobras").xpPerHour, 10000000);
assert.equal(JSON.stringify({ historyArchive, recent, daily }), untouchedHistory, "reset não apaga histórico nem XP diária");

// A wave iniciada antes do clique não mistura XP anterior ao evento com a nova média.
recent.push(run("Livraria FIRE", resetAt - 10000, 1100000));
assert.equal(core.summarizeHuntRuns(recent, historyArchive, windows).find((h) => h.huntName === "Livraria FIRE").runs, 0);
recent.push(run("Livraria FIRE", resetAt + 200000, 1250000, 200, 150));
let measured = core.summarizeHuntRuns(recent, historyArchive, windows).find((h) => h.huntName === "Livraria FIRE");
assert.equal(measured.xpPerHour, 25000000);
assert.equal(measured.averageLoot, 200);
assert.equal(measured.averageBalance, 150);
assert.equal(core.projectLevelFromWaves(core.huntMeasurementRuns(recent, "Livraria FIRE", windows), "Livraria FIRE", { name: "Hero", xpRemaining: 1000000 }).waves, 2);

// A nova medição sobrevive ao limite das últimas 200 waves e à reabertura da extensão.
for (let i = 2; i <= 250; i++) {
  recent.push(run("Livraria FIRE", resetAt + i * 200000, 1250000, 200, 150));
  const expired = recent.splice(0, Math.max(0, recent.length - 200));
  historyArchive = core.archiveHuntRuns(historyArchive, expired);
  windows = core.archiveHuntMeasurements(windows, expired);
}
windows = JSON.parse(JSON.stringify(windows));
measured = core.summarizeHuntRuns(recent, historyArchive, windows).find((h) => h.huntName === "Livraria FIRE");
assert.equal(measured.runs, 250);
assert.equal(measured.xpPerHour, 25000000);
assert.equal(measured.totalXp, 312500000);
assert.equal(core.summarizeHuntRuns(recent, historyArchive).find((h) => h.huntName === "Livraria FIRE").runs, 1838, "histórico continua completo");

// Segundo reset não reutiliza o arquivo da primeira medição.
windows["livraria fire"] = { huntName: "Livraria FIRE", resetAt: resetAt + 251 * 200000, archive: {} };
assert.equal(core.summarizeHuntRuns(recent, historyArchive, windows).find((h) => h.huntName === "Livraria FIRE").runs, 0);
recent.push(run("Livraria FIRE", resetAt + 252 * 200000, 1500000));
assert.equal(core.summarizeHuntRuns(recent, historyArchive, windows).find((h) => h.huntName === "Livraria FIRE").xpPerHour, 30000000);
assert.equal(core.summarizeHuntRuns(recent, historyArchive, windows).find((h) => h.huntName === "Cobras").runs, 1);
console.log("hunt-measurement.test.js: todos os testes passaram");
