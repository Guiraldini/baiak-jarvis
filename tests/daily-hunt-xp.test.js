const assert = require("node:assert/strict");
const core = require("../chrome/src/core.js");

const timestamp = Date.parse("2026-09-29T03:00:00Z");
const hunt = (xpGain) => ({ valid: true, bossMode: false, xpGain });
let state = { day: "2026-09-28", xp: 999, waves: 3, partial: false, analyzerXp: 1000 };
state = core.observeDailyHuntXp(state, hunt(1500), timestamp);
assert.equal(state.xp, 0, "o contador zera na meia-noite de Brasília");
assert.equal(state.analyzerXp, 1500);
state = core.observeDailyHuntXp(state, hunt(1700), timestamp + 1000);
assert.equal(state.xp, 200, "conta XP durante a wave, antes do boss");
state = core.observeDailyHuntXp(state, hunt(2300), timestamp + 2000);
assert.equal(state.xp, 800, "a troca de hunt não perde XP acumulada no Analyzer");
state = core.observeDailyHuntXp(state, { valid: false, bossMode: true, xpGain: 2600 }, timestamp + 3000);
state = core.observeDailyHuntXp(state, hunt(3000), timestamp + 4000);
assert.equal(state.xp, 800, "a XP do boss não entra no total de hunts");
state = core.observeDailyHuntXp(state, hunt(3100), timestamp + 5000);
assert.equal(state.xp, 900);
state = core.observeDailyHuntXp(state, hunt(50), timestamp + 6000);
assert.equal(state.xp, 900, "um reset do Analyzer não subtrai XP");
state = core.observeDailyHuntXp(state, hunt(90), timestamp + 7000);
assert.equal(state.xp, 940, "continua contando depois do reset do Analyzer");

const morning = Date.parse("2026-09-29T10:00:00Z");
const resumed = core.observeDailyHuntXp(
  { day: "2026-09-29", xp: 0, waves: 0, partial: false },
  { ...hunt(35000000), sessionSeconds: 2 * 60 * 60 }, morning);
assert.equal(resumed.xp, 35000000, "recupera a XP da sessão iniciada depois da meia-noite");
const overnight = core.observeDailyHuntXp(
  { day: "2026-09-29", xp: 0, waves: 0, partial: false },
  { ...hunt(35000000), sessionSeconds: 9 * 60 * 60 }, morning);
assert.equal(overnight.xp, 0, "não atribui ao dia atual a sessão iniciada ontem");
