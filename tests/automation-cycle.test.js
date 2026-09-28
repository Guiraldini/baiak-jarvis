const assert = require("node:assert/strict");
const core = require("../chrome/src/core.js");

const options = { enabled: true, huntName: "Hunt A", trainingMode: "house", vipActive: true };
const stamina = { time: "22:43", percent: 54 };
const hunting = { location: "Hunt B", activity: "caçando", isTraining: false, stamina };
assert.equal(core.automationDecision(hunting, options), null);
assert.equal(core.automationDecision({ ...hunting, activity: "treinando" }, options), null);
assert.equal(core.automationDecision({ ...hunting, stamina: { time: "23:10", percent: 55 } }, options), null);

const training = { location: "Casa", activity: "treinando", isTraining: true, stamina };
assert.deepEqual(core.automationDecision(training, options), {
  type: "hunt", target: "Hunt A", reason: "Stamina chegou a 22h43 (54%)."
});
assert.equal(core.automationDecision({ ...training, stamina: { time: "22:42", percent: 53 } }, options), null);

console.log("automation-cycle.test.js: todos os testes passaram");
