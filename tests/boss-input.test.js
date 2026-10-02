const assert = require("node:assert/strict");
const { createController } = require("../chrome/src/boss-input.js");

function fixture() {
  const calls = [], events = {};
  let point = { x: 180, y: 240 }, pauseHook = () => {}, clock = 1000;
  const ext = {
    runtime: { id: "jarvis-test" },
    tabs: {
      get: async () => ({ url: "https://baiakidle.com/jogar/" }),
      sendMessage: async (_id, message) => calls.push(message),
      onRemoved: { addListener: (fn) => { events.removed = fn; } }
    },
    debugger: {
      attach: async (target) => calls.push({ attach: target }),
      detach: async (target) => calls.push({ detach: target }),
      sendCommand: async (_target, method, args) => calls.push({ method, ...args }),
      onDetach: { addListener: (fn) => { events.detached = fn; } }
    },
    scripting: { executeScript: async (options) => { calls.push({ target: options.target }); return [{ result: point }]; } }
  };
  const controller = createController(ext, { token: () => "run-token", pause: async (ms) => pauseHook(ms), now: () => clock });
  const sender = { id: "jarvis-test", frameId: 0, documentId: "game-doc", url: "https://baiakidle.com/jogar/", tab: { id: 8, url: "https://baiakidle.com/jogar/" } };
  const send = (type, options = {}, from = sender) => controller.handle({ type: `bj:boss-input-${type}`, token: "run-token", ...options }, from);
  return { calls, events, ext, sender, send, controller, advance: (ms) => { clock += ms; }, setPoint: (value) => { point = value; }, onPause: (fn) => { pauseHook = fn; } };
}

(async () => {
  const run = fixture();
  for (const sender of [ {}, { ...run.sender, id: "other-extension" }, { ...run.sender, frameId: 1 }, { ...run.sender, url: "https://other.example/" } ]) {
    await assert.rejects(run.send("start", {}, sender), /própria aba/);
  }
  assert.equal(run.calls.length, 0);
  assert.equal((await run.send("start")).token, "run-token");
  await assert.rejects(run.send("click", { name: "Ahau", charges: 2, token: "wrong" }), /autorização/);
  await assert.rejects(run.send("click", { name: "Ahau", charges: 2 }, { ...run.sender, documentId: "new-doc" }), /autorização/);
  await run.send("click", { name: "Ahau", charges: 2 });
  await assert.rejects(run.send("click", { name: "ahau", charges: 2 }), /já foi solicitada/);
  await run.send("click", { name: "Prince Drazzak", charges: 1 });
  assert.deepEqual(run.calls.filter((c) => c.method).map((c) => c.type), ["mouseMoved", "mousePressed", "mouseReleased", "mouseMoved", "mousePressed", "mouseReleased"]);
  assert.ok(run.calls.filter((c) => c.target).every((c) => c.target.tabId === 8 && c.target.documentIds[0] === "game-doc"));
  await run.send("end");
  assert.equal(run.calls.filter((c) => c.detach).length, 1);
  await assert.rejects(run.send("click", { name: "Other", charges: 1 }), /autorização/);

  const moved = fixture();
  await moved.send("start");
  moved.onPause(() => moved.setPoint({ x: 380, y: 240 }));
  await assert.rejects(moved.send("click", { name: "Ahau", charges: 2 }), /posição/);
  assert.equal(moved.calls.filter((c) => c.type === "mousePressed").length, 0);
  await moved.send("end");

  const covered = fixture();
  await covered.send("start");
  covered.setPoint({ error: "O botão Enfrentar está oculto ou coberto." });
  await assert.rejects(covered.send("click", { name: "Ahau", charges: 2 }), /coberto/);
  assert.equal(covered.calls.filter((c) => c.method).length, 0);
  await covered.send("end");

  const cancelled = fixture();
  await cancelled.send("start");
  cancelled.onPause((ms) => { if (ms === 80) cancelled.events.detached({ tabId: 8 }, "canceled_by_user"); });
  await assert.rejects(cancelled.send("click", { name: "Ahau", charges: 2 }), /parada/);
  assert.equal(cancelled.calls.filter((c) => c.type === "mouseReleased" && c.x >= 0).length, 0);
  assert.ok(cancelled.calls.some((c) => c.type === "mouseReleased" && c.x === -1));
  await assert.rejects(cancelled.send("status"), /autorização/);
  const stale = fixture();
  await stale.send("start");
  stale.advance(100000);
  stale.controller.touch(stale.sender);
  stale.advance(100000);
  await stale.controller.sweep();
  assert.equal((await stale.send("status")).ok, true);
  stale.advance(181000);
  await stale.controller.sweep();
  assert.equal(stale.calls.filter((c) => c.detach).length, 1);
  await assert.rejects(stale.send("status"), /autorização/);
  console.log("boss-input.test.js: isolamento da aba, sequência, duplicatas, movimento e cancelamento passaram");
})().catch((error) => { console.error(error); process.exitCode = 1; });
