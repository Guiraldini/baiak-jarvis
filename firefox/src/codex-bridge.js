(function () {
  "use strict";
  if (window.top !== window || window.__baiakJarvisCodexBridge) return;
  window.__baiakJarvisCodexBridge = true;

  const originalParse = JSON.parse;
  let latest = null;
  const publish = () => {
    if (latest) document.dispatchEvent(new CustomEvent("baiak-jarvis:codex", { detail: latest }));
  };
  document.addEventListener("baiak-jarvis:codex-request", publish);

  JSON.parse = function (...args) {
    const result = Reflect.apply(originalParse, this, args);
    const source = args[0];
    if (typeof source !== "string" || !source.includes('"codex"') || !result?.codex) return result;
    const codex = result.codex;
    if (!codex.prog || typeof codex.prog !== "object" || !Array.isArray(codex.done)) return result;
    const next = JSON.stringify({
      done: codex.done.filter((id) => typeof id === "string"),
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
