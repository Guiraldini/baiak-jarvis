(function () {
  "use strict";
  const ext = globalThis.browser || globalThis.chrome;
  const defaults = {
    enabled: true,
    objective: "balanced",
    intervalMs: 1500,
    minimized: false,
    staminaFloorPercent: 16,
    trainingDurationMinutes: 120,
    automationEnabled: true,
    autoReload: true,
    huntName: "Cobras"
  };
  const enabled = document.querySelector("#enabled");
  const objective = document.querySelector("#objective");
  const interval = document.querySelector("#interval");
  const staminaFloor = document.querySelector("#stamina-floor");
  const trainingDuration = document.querySelector("#training-duration");
  const status = document.querySelector("#status");
  const automationEnabled = document.querySelector("#automation-enabled");
  const autoReload = document.querySelector("#auto-reload");
  const huntName = document.querySelector("#hunt-name");

  function flash(message) {
    status.textContent = message;
    setTimeout(() => { status.textContent = "Configurações salvas automaticamente."; }, 1300);
  }

  function populateHunts(names, selected) {
    const options = [...new Set([selected || "Cobras", ...(Array.isArray(names) ? names : [])].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    huntName.innerHTML = options.map((name) => {
      const escaped = String(name).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
      return `<option value="${escaped}">${escaped}</option>`;
    }).join("");
    huntName.value = selected || "Cobras";
  }

  async function load() {
    const { bjSettings, bjHuntOptions } = await ext.storage.local.get({ bjSettings: defaults, bjHuntOptions: ["Cobras"] });
    const settings = { ...defaults, ...bjSettings };
    enabled.checked = settings.enabled;
    objective.value = settings.objective;
    interval.value = String(settings.intervalMs);
    staminaFloor.value = String(settings.staminaFloorPercent);
    trainingDuration.value = String(settings.trainingDurationMinutes);
    automationEnabled.checked = settings.automationEnabled;
    autoReload.checked = settings.autoReload;
    populateHunts(bjHuntOptions, settings.huntName || "Cobras");
  }

  async function save() {
    const current = await ext.storage.local.get({ bjSettings: defaults });
    await ext.storage.local.set({
      bjSettings: {
        ...defaults,
        ...current.bjSettings,
        enabled: enabled.checked,
        objective: objective.value,
        intervalMs: Number(interval.value),
        staminaFloorPercent: Math.min(90, Math.max(1, Number(staminaFloor.value) || 16)),
        trainingDurationMinutes: Math.min(600, Math.max(15, Number(trainingDuration.value) || 120)),
        automationEnabled: automationEnabled.checked,
        autoReload: autoReload.checked,
        huntName: huntName.value.trim() || "Cobras"
      }
    });
    flash("Salvo.");
  }

  enabled.addEventListener("change", save);
  objective.addEventListener("change", save);
  interval.addEventListener("change", save);
  staminaFloor.addEventListener("change", save);
  trainingDuration.addEventListener("change", save);
  automationEnabled.addEventListener("change", save);
  autoReload.addEventListener("change", save);
  huntName.addEventListener("change", save);
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.bjHuntOptions) populateHunts(changes.bjHuntOptions.newValue, huntName.value);
    if (area === "local" && changes.bjSettings) automationEnabled.checked = Boolean(changes.bjSettings.newValue?.automationEnabled);
  });
  document.querySelector("#clear").addEventListener("click", async () => {
    await ext.storage.local.remove(["bjHistory", "bjLatest"]);
    flash("Histórico removido.");
  });
  load();
})();
