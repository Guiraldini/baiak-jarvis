(function () {
  "use strict";
  if (window.top !== window || window.__baiakJarvisCodexBridge) return;
  window.__baiakJarvisCodexBridge = true;

  const originalParse = JSON.parse;
  let latest = null;
  let latestMode = null;
  let lastModePublishAt = 0;
  let latestAuto = null;
  const publish = () => {
    if (latest) document.dispatchEvent(new CustomEvent("baiak-jarvis:codex", { detail: latest }));
  };
  document.addEventListener("baiak-jarvis:codex-request", publish);
  document.addEventListener("baiak-jarvis:mode-request", () => {
    if (latestMode) document.dispatchEvent(new CustomEvent("baiak-jarvis:mode", { detail: latestMode }));
  });
  document.addEventListener("baiak-jarvis:codex-auto-request", () => {
    if (latestAuto) document.dispatchEvent(new CustomEvent("baiak-jarvis:codex-auto", { detail: latestAuto }));
  });

  JSON.parse = function (...args) {
    const result = Reflect.apply(originalParse, this, args);
    const source = args[0];
    if (result && typeof result === "object" && Array.isArray(result.players)
      && ["exercise", "hunt", "boss"].includes(result.mode)
      && (result.mode !== latestMode || Date.now() - lastModePublishAt > 10000)) {
      latestMode = result.mode;
      lastModePublishAt = Date.now();
      document.dispatchEvent(new CustomEvent("baiak-jarvis:mode", { detail: latestMode }));
    }
    if (result && typeof result === "object" && Array.isArray(result.autoCodexTargets)) {
      const nextAuto = JSON.stringify({
        enabled: result.autoCodexOn === true,
        gear: result.autoCodexGear === true,
        pay: result.autoCodexPay === true,
        targets: result.autoCodexTargets.filter((id) => typeof id === "string")
      });
      if (nextAuto !== latestAuto) {
        latestAuto = nextAuto;
        document.dispatchEvent(new CustomEvent("baiak-jarvis:codex-auto", { detail: latestAuto }));
      }
    }
    if (typeof source !== "string" || !source.includes('"codex"') || !result?.codex) return result;
    const codex = result.codex;
    if (!codex.prog || typeof codex.prog !== "object" || !Array.isArray(codex.done)) return result;
    const next = JSON.stringify({
      done: codex.done.filter((id) => typeof id === "string"),
      unlocked: Array.isArray(codex.unlocked) ? codex.unlocked.filter((id) => typeof id === "string") : [],
      prog: Object.fromEntries(Object.entries(codex.prog).filter(([id, counts]) =>
        typeof id === "string" && Array.isArray(counts)).map(([id, counts]) =>
        [id, counts.map((count) => Math.max(0, Math.floor(Number(count) || 0)))]))
    });
    if (next !== latest) {
      latest = next;
      publish();
    }
    return result;
  };
})();
