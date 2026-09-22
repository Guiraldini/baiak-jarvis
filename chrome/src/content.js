(function () {
  "use strict";

  if (window.top !== window || document.getElementById("baiak-jarvis")) return;

  const ext = globalThis.browser || globalThis.chrome;
  const core = globalThis.BaiakJarvisCore;
  const extensionVersion = ext.runtime.getManifest().version;
  const defaults = {
    enabled: true,
    objective: "balanced",
    intervalMs: 1500,
    minimized: false,
    staminaFloorPercent: 16,
    trainingDurationMinutes: 120,
    automationEnabled: true,
    autoReload: true,
    huntName: "Cobras",
    activeView: "dashboard"
  };
  let settings = { ...defaults };
  let profiles = {};
  let latestSnapshot = null;
  let latestPlan = null;
  let timer = null;
  let lastHistoryAt = 0;
  let stageState = { key: null, status: "idle", data: null, error: null };
  let autoState = { status: "idle", message: "Aguardando leitura da stamina." };
  let automationBusy = false;
  let lastAutomationAt = 0;
  let lastGameMutationAt = Date.now();
  let skillsScanBusy = false;
  let lastSkillsScanAt = 0;
  let huntOptions = ["Cobras"];
  let huntScanBusy = false;
  let refreshBusy = false;
  let huntRuns = [];
  let huntTracker = null;
  let huntMonitorMessage = "Aguardando uma hunt começar.";
  let selectedHuntKey = null;
  let knownStaminaMaxMinutes = 42 * 60;

  const host = document.createElement("aside");
  host.id = "baiak-jarvis";
  host.innerHTML = `
    <header class="bj-header">
      <div><strong><span class="bj-pulse"></span> JARVIS</strong><small>stamina · party · builds</small></div>
      <div class="bj-actions">
        <button type="button" data-action="refresh" title="Atualizar agora">↻</button>
        <button type="button" data-action="minimize" title="Minimizar">−</button>
      </div>
    </header>
    <div class="bj-body">
      <nav class="bj-tabs" aria-label="Áreas do Jarvis">
        <button type="button" data-action="view-dashboard" aria-selected="true">Painel</button>
        <button type="button" data-action="view-hunts" aria-selected="false">Hunts</button>
        <button type="button" data-action="view-optimizer" aria-selected="false">Otimizador</button>
      </nav>
      <section class="bj-view" id="bj-view-dashboard">
        <div class="bj-columns">
          <div class="bj-column bj-column-main">
            <div class="bj-context"><span id="bj-location">Lendo o jogo…</span><span id="bj-clock">--:--</span></div>
            <section class="bj-cycle" id="bj-cycle">
              <div class="bj-cycle-top"><span id="bj-cycle-action">CALCULANDO CICLO</span><span id="bj-rate">—</span></div>
              <strong id="bj-countdown">—</strong>
              <span id="bj-cycle-detail">Lendo a stamina atual…</span>
              <div class="bj-progress"><i id="bj-progress-fill"></i><b id="bj-floor-marker"></b><b class="bj-ceiling" id="bj-ceiling-marker"></b></div>
              <div class="bj-scale"><span>0h</span><span id="bj-floor-label">16% · treinar</span><span id="bj-ceiling-label">54% · caçar</span></div>
            </section>
            <div class="bj-grid">
              <div class="bj-stat"><small>Stamina</small><strong id="bj-stamina">—</strong></div>
              <div class="bj-stat"><small>Mochila</small><strong id="bj-backpack">—</strong></div>
              <div class="bj-stat"><small>Party</small><strong id="bj-party">—</strong></div>
              <div class="bj-stat"><small>Objetivo</small><strong id="bj-objective">Equilíbrio</strong></div>
            </div>
            <section class="bj-auto" id="bj-auto">
              <div><span class="bj-auto-dot"></span><strong id="bj-auto-title">AUTOMAÇÃO</strong></div>
              <small id="bj-auto-message">Aguardando leitura da stamina.</small>
              <label class="bj-hunt-choice"><span>Hunt após o treino</span><select id="bj-hunt-select" title="Hunt automática"></select></label>
            </section>
            <section><div class="bj-section-title">RECOMENDAÇÕES</div><div id="bj-recommendations"></div></section>
          </div>
          <div class="bj-column bj-column-details">
            <details class="bj-details" open>
              <summary>Poder da party</summary>
              <div id="bj-characters"></div>
            </details>
            <details class="bj-stage bj-hidden-section" id="bj-stage">
              <summary class="bj-section-title">ANÁLISE DA HUNT</summary>
              <div id="bj-stage-content"></div>
            </details>
          </div>
        </div>
      </section>
      <section class="bj-view bj-view-hidden" id="bj-view-hunts">
        <div class="bj-hunts-view">
          <div class="bj-hunts-heading"><div><strong>HISTÓRICO DE HUNTS</strong><small>Uma medição vai da wave 1 até a queda do boss.</small></div><span id="bj-hunt-run-count">0 waves</span></div>
          <section class="bj-live-run" id="bj-live-run"></section>
          <div class="bj-hunt-summary" id="bj-hunt-summary"></div>
          <section class="bj-hunt-comparison"><div class="bj-section-title">COMPARATIVO DE RENDIMENTO</div><div id="bj-hunt-comparison"></div></section>
          <section class="bj-run-history"><div class="bj-section-title">ÚLTIMAS WAVES CONCLUÍDAS</div><div id="bj-run-history"></div></section>
        </div>
      </section>
      <section class="bj-view bj-view-hidden" id="bj-view-optimizer">
        <div class="bj-optimizer-bar"><div><strong>OTIMIZADOR DE BUILD</strong><small>Monte e compare a árvore da sua vocação.</small></div><a href="https://baiakidle-build-optimizer.pages.dev/build-optimizer/" target="_blank" rel="noreferrer">Abrir separado ↗</a></div>
        <iframe id="bj-optimizer-frame" title="Baiak Idle — Otimizador de Build" data-src="https://baiakidle-build-optimizer.pages.dev/build-optimizer/" allow="clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </section>
      <footer>Jarvis ${extensionVersion} AUTO · execução local</footer>
    </div>`;
  document.documentElement.appendChild(host);

  function detectLoop() {
    const element = document.querySelector("#loop-toggle");
    if (!element) return null;
    const explicit = element.getAttribute("aria-pressed");
    if (explicit === "true" || explicit === "false") return explicit === "true";
    const classes = String(element.className || "").toLowerCase();
    if (/\b(active|enabled|on|is-active)\b/.test(classes)) return true;
    if (/\b(disabled|off|is-inactive)\b/.test(classes)) return false;
    return null;
  }

  function detectVip() {
    const element = document.querySelector("#hud-vip-crown");
    if (!element) return false;
    const description = [element.title, element.getAttribute("aria-label"), element.dataset.tooltip, element.getAttribute("alt")]
      .filter(Boolean).join(" ");
    return !/expirado|inactive|inativo/i.test(description);
  }

  function readPartyCharacters() {
    return [...document.querySelectorAll("#party-list .member")].map((member) => {
      const name = core.clean(member.querySelector(".m-name")?.textContent);
      const role = core.clean(member.querySelector(".role")?.textContent).toUpperCase() || null;
      const meta = core.clean(member.querySelector(".m-meta")?.textContent);
      const match = meta.match(/(Druid|Knight|Sorcerer|Paladin)\s*[·|]\s*lvl\s*(\d+)/i);
      const hp = core.parseVitalBar(member.querySelector(".bar.hp b")?.textContent || member.querySelector(".bar.hp")?.dataset.tip);
      const mana = core.parseVitalBar(member.querySelector(".bar.mana b")?.textContent || member.querySelector(".bar.mana")?.dataset.tip);
      const levelProgress = core.numberFromPtBr(member.querySelector(".bar.xp b")?.textContent);
      if (!name || !match) return null;
      return {
        name,
        vocation: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(),
        role,
        level: Number(match[2]),
        currentHp: hp?.current ?? null,
        hp: hp?.max ?? null,
        currentMana: mana?.current ?? null,
        mana: mana?.max ?? null,
        levelProgress
      };
    }).filter(Boolean);
  }

  function mergeCharacters(parsed, structural) {
    const result = [...parsed];
    for (const character of structural) {
      const existing = result.find((item) => core.normalizeLookup(item.name) === core.normalizeLookup(character.name));
      if (existing) Object.assign(existing, Object.fromEntries(Object.entries(character).filter(([, value]) => value != null)));
      else result.push(character);
    }
    return result;
  }

  function readSnapshot() {
    const gameRoot = document.querySelector("#app") || document.body;
    const location = (document.querySelector("#wave-title")?.textContent || "").replace(/▾/g, "");
    const snapshot = core.parseSnapshot({ text: gameRoot ? gameRoot.innerText : "", title: document.title, location, loopEnabled: detectLoop(), now: Date.now() });
    const mountBonus = [...document.querySelectorAll("#skills-panel-body .sk-stat")].find((row) => {
      const label = core.normalizeLookup(row.querySelector(":scope > span")?.textContent);
      return /montaria|mount/.test(label) && /stamina/.test(label) && /max|cap/.test(label);
    });
    if (mountBonus) {
      const bonus = core.mountStaminaBonusMinutes(mountBonus.querySelector(":scope > span:nth-child(2)")?.textContent);
      if (bonus != null) knownStaminaMaxMinutes = 42 * 60 + bonus;
    }
    if (snapshot.stamina) snapshot.stamina.maxMinutes = knownStaminaMaxMinutes;
    snapshot.characters = mergeCharacters(snapshot.characters, readPartyCharacters());
    return snapshot;
  }

  function valueRows(selector) {
    return [...document.querySelectorAll(selector)].map((row) => {
      const cells = row.querySelectorAll(":scope > span");
      return { label: core.clean(cells[0]?.textContent), value: core.clean(cells[1]?.textContent) };
    }).filter((item) => item.label && item.value);
  }

  function vocationFromPanel(value) {
    const normalized = core.normalizeLookup(value);
    if (normalized.includes("knight")) return "Knight";
    if (normalized.includes("druid")) return "Druid";
    if (normalized.includes("sorcerer")) return "Sorcerer";
    if (normalized.includes("paladin")) return "Paladin";
    return null;
  }

  function readSelectedSkillProfile(button) {
    const name = core.clean(button?.textContent);
    const vocation = vocationFromPanel(document.querySelector("#skills-panel-body .sk-voc")?.textContent || button?.title);
    const primarySkill = ({ Knight: "Melee", Druid: "Magic", Sorcerer: "Magic", Paladin: "Distance" })[vocation];
    const skillRows = [...document.querySelectorAll("#skills-panel-body .sk-skill:not(#sk-xp-row)")].map((row) => {
      const cells = row.querySelectorAll(".sk-row > span");
      return {
        label: core.clean(cells[0]?.textContent),
        value: core.clean(cells[1]?.textContent),
        progress: Number.parseFloat(row.querySelector(".sk-bar i")?.style.width) || null
      };
    });
    const skill = skillRows.find((item) => item.label === primarySkill);
    const skillNumbers = skill?.value.match(/-?[\d.,]+/g) || [];
    const bonusEntries = valueRows("#skills-panel-body .sk-bonuses .sk-stat");
    const protections = {};
    const damageBonuses = {};
    for (const entry of bonusEntries) {
      const elements = core.elementMentions(entry.label);
      if (/^prote[cç][aã]o\b/i.test(entry.label)) {
        for (const element of elements) protections[element] = core.percentFromPtBr(entry.value);
      }
      if (/^dano\b/i.test(entry.label)) {
        for (const element of elements) damageBonuses[element] = core.percentFromPtBr(entry.value);
      }
    }
    const equipment = [...document.querySelectorAll("#skills-panel-body .sk-itemstats .sk-itemblock")].map((block) => ({
      name: core.clean(block.querySelector(".sk-itemstat-name")?.textContent),
      bonuses: [...block.querySelectorAll(":scope > .sk-stat")].map((row) => {
        const cells = row.querySelectorAll(":scope > span");
        return { label: core.clean(cells[0]?.textContent), value: core.clean(cells[1]?.textContent) };
      }).filter((entry) => entry.label && entry.value)
    })).filter((item) => item.name);
    const basic = Object.fromEntries(valueRows("#skills-panel-body > .sk-stats:not(.sk-bonuses):not(.sk-itemstats)").map((item) => [item.label, item.value]));
    const bonusMap = Object.fromEntries(bonusEntries.map((item) => [core.normalizeLookup(item.label), item.value]));
    const defenseParts = ["defesa", "armadura"].filter((key) => bonusMap[key]).map((key) => `${key[0].toUpperCase() + key.slice(1)} ${bonusMap[key]}`);
    const sustainParts = ["life leech", "mana leech"].filter((key) => bonusMap[key]).map((key) => `${key === "life leech" ? "Life" : "Mana"} Leech ${bonusMap[key]}`);
    return {
      name,
      vocation,
      level: core.numberFromPtBr(basic["Nível"]),
      hp: core.numberFromPtBr(basic["Pontos de Vida"]),
      mana: core.numberFromPtBr(basic.Mana),
      skillType: primarySkill,
      skillLevel: core.numberFromPtBr(skillNumbers[0]),
      skillBonus: core.numberFromPtBr(skillNumbers[1]),
      skillProgress: skill?.progress,
      bonusEntries,
      protections,
      damageBonuses,
      equipment,
      defense: defenseParts.length ? defenseParts.join(" · ") : `${Object.keys(protections).length} proteções elementais detectadas`,
      sustain: sustainParts.join(" · ") || null
    };
  }

  async function scanSkillsPanel(force) {
    if (skillsScanBusy) {
      if (!force) return;
      for (let attempt = 0; attempt < 100 && skillsScanBusy; attempt += 1) await delay(50);
      if (skillsScanBusy) return;
    }
    if (!force && Date.now() - lastSkillsScanAt < 30000) return;
    const buttons = [...document.querySelectorAll("#skills-members .sk-mem")];
    if (!buttons.length) return;
    skillsScanBusy = true;
    const original = buttons.find((button) => button.classList.contains("on")) || buttons[0];
    try {
      for (const button of buttons) {
        button.click();
        for (let attempt = 0; attempt < 10 && !button.classList.contains("on"); attempt += 1) await delay(25);
        await delay(50);
        const scanned = readSelectedSkillProfile(button);
        if (!scanned.name) continue;
        const current = profiles[scanned.name] || genericProfile(scanned);
        Object.assign(current, Object.fromEntries(Object.entries(scanned).filter(([, value]) => value != null)));
        const skillText = `${current.skillType || "Skill"} ${current.skillLevel || "—"}${current.skillBonus ? ` +${current.skillBonus}` : ""}`;
        current.attack = `${current.vocation === "Knight" ? "Físico" : current.vocation === "Paladin" ? "Distância" : "Magia"} · ${skillText}`;
        current.attackElements = [...new Set([...(current.vocation === "Knight" || current.vocation === "Paladin" ? ["physical"] : []), ...Object.keys(current.damageBonuses || {})])];
        profiles[scanned.name] = current;
      }
      if (original && !original.classList.contains("on")) {
        original.click();
        await delay(50);
      }
      lastSkillsScanAt = Date.now();
      if (latestSnapshot) renderProfiles(latestSnapshot);
    } finally {
      skillsScanBusy = false;
    }
  }

  function genericProfile(character) {
    const vocation = character.vocation || "";
    const skill = character.skillLevel ? `${character.skillType || "Skill"} ${character.skillLevel}` : "skill aguardando leitura";
    const presets = {
      Knight: { role: "TANK", attack: `Físico · ${skill}`, attackElements: ["physical"] },
      Druid: { role: "SUP", attack: `Magia · ${skill}`, attackElements: [] },
      Sorcerer: { role: "DPS", attack: `Magia · ${skill}`, attackElements: [] },
      Paladin: { role: "DPS", attack: `Distância · ${skill}`, attackElements: ["physical"] }
    };
    const preset = presets[vocation] || { role: vocation, attack: skill, attackElements: [] };
    return {
      name: character.name,
      vocation,
      role: character.role || preset.role,
      attack: preset.attack,
      attackElements: preset.attackElements,
      defense: "Bônus de equipamento ainda não visíveis",
      protections: {},
      sustain: null
    };
  }

  function mergeLiveProfiles(snapshot) {
    for (const character of snapshot.characters) {
      const current = profiles[character.name] || genericProfile(character);
      for (const key of ["vocation", "role", "level", "currentHp", "hp", "currentMana", "mana", "skillType", "skillLevel", "skillBonus", "skillProgress", "levelProgress"]) {
        if (character[key] != null) current[key] = character[key];
      }
      if (!profiles[character.name]) Object.assign(current, genericProfile({ ...character, ...current }));
      if (current.vocation === "Knight") {
        current.attack = `Físico · ${current.skillType || "Melee"} ${current.skillLevel || "—"}${current.skillBonus ? ` +${current.skillBonus}` : ""}`;
        current.attackElements = [...new Set(["physical", ...Object.keys(current.damageBonuses || {})])];
      }
      profiles[character.name] = current;
    }
  }

  function objectiveLabel(value) {
    return { balanced: "Equilíbrio", xp: "XP", profit: "Lucro", safety: "Segurança" }[value] || "Equilíbrio";
  }

  function formatNumber(value) {
    return Number.isFinite(value) ? new Intl.NumberFormat("pt-BR").format(value) : "—";
  }

  function formatVital(current, maximum) {
    if (Number.isFinite(current) && Number.isFinite(maximum)) return `${formatNumber(current)}/${formatNumber(maximum)}`;
    return formatNumber(maximum);
  }

  function formatStamina(minutes) {
    const rounded = Math.max(0, Math.round(minutes));
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  }

  function elementLabel(element) {
    return ({ physical: "Físico", earth: "Terra", death: "Morte", fire: "Fogo", ice: "Gelo", energy: "Energia", holy: "Sagrado" })[element] || element;
  }

  function render(snapshot) {
    mergeLiveProfiles(snapshot);
    host.querySelector("#bj-location").textContent = snapshot.location || snapshot.activity || "Baiak Idle";
    host.querySelector("#bj-clock").textContent = new Date(snapshot.capturedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    host.querySelector("#bj-stamina").textContent = snapshot.stamina ? `${snapshot.stamina.percent}% · ${snapshot.stamina.time}` : "—";
    host.querySelector("#bj-backpack").textContent = snapshot.backpack ? `${snapshot.backpack.used}/${snapshot.backpack.total}` : "—";
    host.querySelector("#bj-party").textContent = snapshot.characters.length || "—";
    host.querySelector("#bj-objective").textContent = objectiveLabel(settings.objective);

    latestPlan = core.staminaPlan(snapshot, {
      vipActive: detectVip(), floorPercent: Number(settings.staminaFloorPercent) || 16,
      trainingDurationMinutes: Number(settings.trainingDurationMinutes) || 120
    });
    renderCycle(latestPlan);
    renderAutomationStatus();
    renderHuntOptions();
    renderProfiles(snapshot);
    monitorHuntRun(snapshot);
    renderHuntHistory();

    const recommendations = core.buildRecommendations(snapshot, settings.objective);
    host.querySelector("#bj-recommendations").innerHTML = recommendations.map((item) => `
      <article class="bj-recommendation bj-${item.severity}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></article>`).join("");
    maybeLoadStage(snapshot.location).catch(() => {});
    maybeAutomate(snapshot).catch(() => {});
  }

  function setAutoState(status, message) {
    autoState = { status, message };
    renderAutomationStatus();
  }

  function renderAutomationStatus() {
    const section = host.querySelector("#bj-auto");
    if (!section) return;
    const enabled = Boolean(settings.automationEnabled);
    section.dataset.status = enabled ? autoState.status : "disabled";
    host.querySelector("#bj-auto-title").textContent = enabled
      ? `AUTOMAÇÃO ATIVA · ${(settings.huntName || "Cobras").toUpperCase()}`
      : "AUTOMAÇÃO DESATIVADA";
    host.querySelector("#bj-auto-message").textContent = enabled
      ? autoState.message
      : "Ative pelo botão da extensão.";
  }

  function renderHuntOptions() {
    const select = host.querySelector("#bj-hunt-select");
    if (!select) return;
    const selected = settings.huntName || "Cobras";
    const names = [...new Set([selected, ...huntOptions].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const signature = names.join("\n");
    if (select.dataset.signature !== signature) {
      select.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
      select.dataset.signature = signature;
    }
    select.value = selected;
  }

  async function switchView(view, persist = false) {
    const selected = ["dashboard", "hunts", "optimizer"].includes(view) ? view : "dashboard";
    host.querySelector("#bj-view-dashboard").classList.toggle("bj-view-hidden", selected !== "dashboard");
    host.querySelector("#bj-view-hunts").classList.toggle("bj-view-hidden", selected !== "hunts");
    host.querySelector("#bj-view-optimizer").classList.toggle("bj-view-hidden", selected !== "optimizer");
    host.querySelector('[data-action="view-dashboard"]').setAttribute("aria-selected", String(selected === "dashboard"));
    host.querySelector('[data-action="view-hunts"]').setAttribute("aria-selected", String(selected === "hunts"));
    host.querySelector('[data-action="view-optimizer"]').setAttribute("aria-selected", String(selected === "optimizer"));
    if (selected === "optimizer") {
      const frame = host.querySelector("#bj-optimizer-frame");
      if (!frame.getAttribute("src")) frame.src = frame.dataset.src;
    }
    settings.activeView = selected;
    if (persist) await ext.storage.local.set({ bjSettings: settings });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function locationMatches(value, target) {
    const current = core.normalizeLookup(value);
    const wanted = core.normalizeLookup(target);
    if (!current || !wanted) return false;
    if (wanted === "treino online") return current.includes("treino online");
    const singularCurrent = current.replace(/s$/, "");
    const singularWanted = wanted.replace(/s$/, "");
    return singularCurrent.includes(singularWanted) || singularWanted.includes(singularCurrent);
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  async function waitForElement(selector, timeoutMs = 5000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const element = document.querySelector(selector);
      if (isVisible(element)) return element;
      await delay(50);
    }
    return null;
  }

  function setSearchValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function openHuntPicker() {
    const toggle = document.querySelector("#wave-title");
    if (!toggle) throw new Error("O seletor de atividade não apareceu no jogo.");
    let picker = document.querySelector("#picker-modal .pick-search");
    if (isVisible(picker)) return document.querySelector("#picker-modal");
    if (!isVisible(document.querySelector("#teleport-menu"))) toggle.click();
    const huntsOption = await waitForElement('#teleport-menu .tp-opt[data-tp="hunts"]', 2500);
    if (!huntsOption) throw new Error("A opção Hunts não apareceu no menu de teleportes.");
    huntsOption.click();
    picker = await waitForElement("#picker-modal .pick-search", 5000);
    if (!picker) throw new Error("A janela de Hunts não abriu.");
    return document.querySelector("#picker-modal");
  }

  function closeHuntPicker() {
    const close = document.querySelector("#picker-modal-close");
    if (isVisible(close)) close.click();
  }

  async function filterHuntRows(value) {
    const search = await waitForElement("#picker-modal .pick-search", 2500);
    if (!search) throw new Error("O campo de busca das Hunts não apareceu.");
    setSearchValue(search, value);
    let previousCount = -1;
    let stableReads = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await delay(50);
      const rows = [...document.querySelectorAll("#picker-modal .stage-row")];
      if (value && rows.some((row) => core.normalizeLookup(row.querySelector(".stage-name-line b")?.textContent) === core.normalizeLookup(value))) return rows;
      if (!value) {
        stableReads = rows.length === previousCount ? stableReads + 1 : 0;
        previousCount = rows.length;
        if (rows.length > 1 && stableReads >= 3) return rows;
      }
    }
    return [...document.querySelectorAll("#picker-modal .stage-row")];
  }

  async function scanHuntOptions(force = false) {
    if (huntScanBusy) {
      if (!force) return huntOptions;
      for (let attempt = 0; attempt < 100 && huntScanBusy; attempt += 1) await delay(50);
      if (huntScanBusy) return huntOptions;
    }
    if (!force && huntOptions.length > 1) return huntOptions;
    huntScanBusy = true;
    const pickerWasOpen = isVisible(document.querySelector("#picker-modal .pick-search"));
    try {
      await openHuntPicker();
      const rows = await filterHuntRows("");
      const names = rows.map((row) => core.clean(row.querySelector(".stage-name-line b")?.textContent)).filter(Boolean);
      if (names.length) {
        huntOptions = [...new Set(names)];
        await ext.storage.local.set({ bjHuntOptions: huntOptions });
        renderHuntOptions();
      }
      return huntOptions;
    } finally {
      if (!pickerWasOpen) closeHuntPicker();
      huntScanBusy = false;
    }
  }

  async function selectHunt(target) {
    await openHuntPicker();
    try {
      const rows = await filterHuntRows(target);
      const wanted = core.normalizeLookup(target);
      const row = rows.find((item) => core.normalizeLookup(item.querySelector(".stage-name-line b")?.textContent) === wanted);
      if (!row) throw new Error(`A hunt “${target}” não foi encontrada.`);
      if (!row.classList.contains("expanded")) {
        (row.querySelector(".stage-info") || row).click();
        await delay(150);
      }
      let huntButton = row.querySelector(".stage-go");
      for (let attempt = 0; attempt < 20 && !isVisible(huntButton); attempt += 1) {
        await delay(50);
        huntButton = row.querySelector(".stage-go");
      }
      if (!huntButton || !isVisible(huntButton)) throw new Error(`O botão Caçar de “${target}” não apareceu.`);
      if (huntButton.disabled) {
        if (locationMatches(document.querySelector("#wave-title")?.textContent, target)) {
          closeHuntPicker();
          return true;
        }
        throw new Error(`O botão Caçar de “${target}” está desativado.`);
      }
      if (!core.normalizeLookup(huntButton.textContent).includes("cacar")) throw new Error(`O botão Caçar de “${target}” não foi confirmado.`);
      huntButton.click();
      for (let attempt = 0; attempt < 32; attempt += 1) {
        await delay(250);
        if (locationMatches(document.querySelector("#wave-title")?.textContent, target)) return true;
      }
      throw new Error(`O jogo não confirmou a entrada em “${target}”.`);
    } catch (error) {
      closeHuntPicker();
      throw error;
    }
  }

  async function selectActivity(target) {
    const toggle = document.querySelector("#wave-title");
    if (!toggle) throw new Error("O seletor de atividade não apareceu no jogo.");
    if (locationMatches(toggle.textContent, target)) return true;
    if (core.normalizeLookup(target) !== "treino online") return selectHunt(target);
    if (!isVisible(document.querySelector("#teleport-menu"))) toggle.click();
    const trainingOption = await waitForElement('#teleport-menu .tp-opt[data-tp="exercise"]', 2500);
    if (!trainingOption) throw new Error("A opção Treino online não apareceu no menu de teleportes.");
    trainingOption.click();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await delay(250);
      if (locationMatches(document.querySelector("#wave-title")?.textContent, target)) return true;
    }
    throw new Error(`O jogo não confirmou a mudança para “${target}”.`);
  }

  async function recordAutomation(decision, ok, error) {
    const stored = await ext.storage.local.get({ bjAutomationLog: [] });
    const entry = {
      at: Date.now(), type: decision.type, target: decision.target,
      reason: decision.reason, ok, error: error || null
    };
    await ext.storage.local.set({
      bjLastAutomation: entry,
      bjAutomationLog: [...stored.bjAutomationLog, entry].slice(-50)
    });
  }

  async function maybeAutomate(snapshot) {
    if (!settings.automationEnabled || automationBusy || refreshBusy) return;
    const decision = core.automationDecision(snapshot, {
      enabled: true,
      huntName: settings.huntName || "Cobras",
      floorPercent: Number(settings.staminaFloorPercent) || 16,
      trainingDurationMinutes: Number(settings.trainingDurationMinutes) || 120,
      vipActive: true
    });
    if (!decision) {
      if (latestPlan) {
        const next = latestPlan.phase === "train" ? `Caçar em ${formatStamina(latestPlan.huntCeiling)}.` : `Treinar em ${formatStamina(latestPlan.huntFloor)}.`;
        setAutoState("active", next);
      }
      return;
    }
    if (Date.now() - lastAutomationAt < 60000) return;
    automationBusy = true;
    lastAutomationAt = Date.now();
    setAutoState("working", `${decision.reason} Mudando para ${decision.target}…`);
    try {
      await selectActivity(decision.target);
      setAutoState("success", `Mudança confirmada: ${decision.target}.`);
      await recordAutomation(decision, true, null);
    } catch (error) {
      setAutoState("error", error.message);
      await recordAutomation(decision, false, error.message);
    } finally {
      automationBusy = false;
    }
  }

  function renderCycle(plan) {
    const cycle = host.querySelector("#bj-cycle");
    if (!plan) {
      host.querySelector("#bj-cycle-action").textContent = "STAMINA NÃO DETECTADA";
      host.querySelector("#bj-countdown").textContent = "—";
      host.querySelector("#bj-cycle-detail").textContent = "Mantenha o painel de stamina visível no jogo.";
      return;
    }
    cycle.dataset.phase = plan.phase;
    host.querySelector("#bj-cycle-action").textContent = plan.action;
    host.querySelector("#bj-rate").textContent = plan.vipActive ? "VIP · recuperação 8×" : "recuperação 4×";
    host.querySelector("#bj-countdown").textContent = core.formatMinutes(plan.remainingRealMinutes);
    const actionTime = new Date(plan.nextAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const mountNote = plan.maxMinutes > 42 * 60
      ? ` Teto ${formatStamina(plan.maxMinutes)} (montaria +${plan.maxMinutes - 42 * 60}min).`
      : "";
    host.querySelector("#bj-cycle-detail").textContent = `${plan.detail}${mountNote} Troca por volta de ${actionTime}.`;
    host.querySelector("#bj-progress-fill").style.width = `${Math.min(100, plan.currentPercent)}%`;
    host.querySelector("#bj-floor-marker").style.left = `${(plan.huntFloor / plan.maxMinutes) * 100}%`;
    host.querySelector("#bj-ceiling-marker").style.left = `${(plan.huntCeiling / plan.maxMinutes) * 100}%`;
    host.querySelector("#bj-floor-label").textContent = `${formatStamina(plan.huntFloor)} · treinar`;
    host.querySelector("#bj-ceiling-label").textContent = `${formatStamina(plan.huntCeiling)} · caçar`;
  }

  function renderProfiles(snapshot) {
    const openDetails = new Set([...host.querySelectorAll("#bj-characters .bj-profile-details[open]")].map((details) => {
      const profileName = details.closest(".bj-profile")?.dataset.profile || "";
      return `${profileName}|${details.dataset.detail || ""}`;
    }));
    const orderedNames = snapshot.characters.map((item) => item.name);
    const ordered = [...new Set(orderedNames)].map((name) => profiles[name]).filter(Boolean);
    if (!ordered.length) {
      host.querySelector("#bj-characters").innerHTML = `<div class="bj-stage-status">Aguardando os personagens aparecerem no painel Party.</div>`;
      return;
    }
    host.querySelector("#bj-characters").innerHTML = ordered.map((profile) => {
      const skill = profile.skillLevel ? `${profile.skillType} ${profile.skillLevel}${profile.skillBonus ? ` +${profile.skillBonus}` : ""}${profile.skillProgress != null ? ` (${Math.round(profile.skillProgress)}%)` : ""}` : "Skill —";
      const attacks = (profile.attackElements || []).map((element) => `<em>${elementLabel(element)}</em>`).join("");
      const entries = Object.entries(profile.protections || {});
      const max = entries.length ? Math.max(...entries.map(([, value]) => value)) : null;
      const strongest = max == null ? "não detectada" : entries.filter(([, value]) => value === max).map(([element]) => elementLabel(element)).join(", ");
      const damageEntries = Object.entries(profile.damageBonuses || {});
      const maxDamage = damageEntries.length ? Math.max(...damageEntries.map(([, value]) => value)) : null;
      const strongestDamage = maxDamage == null ? "não detectado" : damageEntries.filter(([, value]) => value === maxDamage).map(([element]) => elementLabel(element)).join(", ");
      const bonuses = (profile.bonusEntries || []).map((item) => `<span>${escapeHtml(item.label)} <b>${escapeHtml(item.value)}</b></span>`).join("");
      const equipment = (profile.equipment || []).map((item) => `<li><b>${escapeHtml(item.name)}</b>${item.bonuses.map((entry) => `<span>${escapeHtml(entry.label)} ${escapeHtml(entry.value)}</span>`).join("")}</li>`).join("");
      const bonusOpen = openDetails.has(`${profile.name}|bonuses`) ? " open" : "";
      const equipmentOpen = openDetails.has(`${profile.name}|equipment`) ? " open" : "";
      return `<article class="bj-profile ${profile.vocation === "Knight" ? "bj-knight" : ""}" data-profile="${escapeHtml(profile.name)}">
        <div class="bj-profile-head"><strong>${escapeHtml(profile.name)}</strong><span>${escapeHtml(profile.role || profile.vocation || "")} · Nv. ${escapeHtml(profile.level || "—")}</span></div>
        <div class="bj-vitals"><span>♥ ${formatVital(profile.currentHp, profile.hp)}</span><span>◆ ${formatVital(profile.currentMana, profile.mana)}</span><span>${escapeHtml(skill)}</span></div>
        <div class="bj-power-row"><b>ATQ</b><span>${escapeHtml(profile.attack || "Aguardando leitura")}</span>${attacks}</div>
        <div class="bj-power-row"><b>DEF</b><span>${escapeHtml(profile.defense || "Aguardando leitura")}</span></div>
        ${profile.vocation === "Knight" ? `<div class="bj-power-row"><b>MAIOR DEF. ELEMENTAL</b><span>${escapeHtml(strongest)}${max != null ? ` · ${max}% total` : ""}</span></div><div class="bj-power-row"><b>MAIOR BÔNUS DE DANO</b><span>${escapeHtml(strongestDamage)}${maxDamage != null ? ` · +${maxDamage}%` : ""}</span></div>` : ""}
        ${profile.sustain ? `<div class="bj-power-row"><b>SUSTAIN</b><span>${escapeHtml(profile.sustain)}</span></div>` : ""}
        ${bonuses ? `<details class="bj-profile-details" data-detail="bonuses"${bonusOpen}><summary>Bônus detectados (${profile.bonusEntries.length})</summary><div class="bj-bonus-list">${bonuses}</div></details>` : ""}
        ${equipment ? `<details class="bj-profile-details" data-detail="equipment"${equipmentOpen}><summary>Equipamentos (${profile.equipment.length})</summary><ul class="bj-equipment-list">${equipment}</ul></details>` : ""}
      </article>`;
    }).join("");
  }

  function isHuntLocation(value) {
    const normalized = core.normalizeLookup(value);
    return Boolean(normalized) && !/^(treino online|cidade|hunts?|chefes?|arena)$/.test(normalized);
  }

  function readAnalyzerNumber(selector) {
    return core.numberFromPtBr(document.querySelector(selector)?.textContent);
  }

  function readHuntTelemetry(snapshot) {
    const huntName = core.clean(snapshot?.location).replace(/▾/g, "");
    const timerElement = document.querySelector("#run-timer");
    const timerText = core.clean(timerElement?.textContent);
    const durationSeconds = core.elapsedToSeconds(timerText);
    const dots = [...document.querySelectorAll("#wave-dots > i")];
    const currentIndex = dots.findIndex((dot) => dot.classList.contains("now"));
    const partyManage = document.querySelector("#party-manage");
    const bossMode = core.bossModeDetected({
      badgeText: document.querySelector("#bar-shooters .bar-pvp-tag")?.textContent,
      partyManageTitle: partyManage?.title,
      partyManageTip: partyManage?.dataset.tip
    });
    const timerVisible = isVisible(timerElement);
    const xpGain = readAnalyzerNumber("#an-raw");
    return {
      huntName,
      durationSeconds,
      timerText,
      waveNumber: currentIndex >= 0 ? currentIndex + 1 : null,
      waveCount: dots.length || null,
      xpGain,
      kills: readAnalyzerNumber("#an-kills"),
      loot: readAnalyzerNumber("#an-loot"),
      supplies: readAnalyzerNumber("#an-supplies"),
      balance: readAnalyzerNumber("#an-balance"),
      capturedAt: snapshot?.capturedAt || Date.now(),
      bossMode,
      timerVisible,
      invalidReason: bossMode ? "boss" : !timerVisible ? "outside-hunt" : null,
      valid: !bossMode && timerVisible && isHuntLocation(huntName) && Number.isFinite(durationSeconds) && Number.isFinite(xpGain)
    };
  }

  function beginHuntTracker(telemetry, forceEligible = false, fromBoundary = false) {
    const eligible = forceEligible || (telemetry.waveNumber === 1 && telemetry.durationSeconds <= 5);
    huntTracker = {
      huntName: telemetry.huntName,
      startedAt: fromBoundary ? telemetry.capturedAt : telemetry.capturedAt - telemetry.durationSeconds * 1000,
      startTimerSeconds: fromBoundary ? telemetry.durationSeconds : 0,
      fromBoundary,
      startXp: telemetry.xpGain,
      startKills: telemetry.kills,
      startLoot: telemetry.loot,
      startSupplies: telemetry.supplies,
      startBalance: telemetry.balance,
      lastXp: telemetry.xpGain,
      lastDurationSeconds: telemetry.durationSeconds,
      lastWaveNumber: telemetry.waveNumber,
      maxDurationSeconds: telemetry.durationSeconds,
      hadBossWave: telemetry.waveCount > 0 && telemetry.waveNumber === telemetry.waveCount,
      eligible,
      completed: false
    };
    huntMonitorMessage = eligible
      ? `${telemetry.huntName}: wave ${telemetry.waveNumber || "—"}/${telemetry.waveCount || "—"} em andamento.`
      : `${telemetry.huntName}: medição começou no meio da fase; o registro inicia na próxima wave 1.`;
  }

  function metricDelta(endValue, startValue) {
    return Number.isFinite(endValue) && Number.isFinite(startValue) ? Math.max(0, endValue - startValue) : null;
  }

  function saveCompletedHunt(telemetry, durationSeconds) {
    if (!huntTracker?.eligible || huntTracker.completed || durationSeconds < 10) return;
    const xpGain = metricDelta(telemetry.xpGain, huntTracker.startXp);
    if (!Number.isFinite(xpGain)) return;
    huntTracker.completed = true;
    const completedAt = telemetry.capturedAt;
    const record = {
      id: `${completedAt}-${core.normalizeLookup(huntTracker.huntName).replace(/\s+/g, "-")}`,
      huntName: huntTracker.huntName,
      startedAt: huntTracker.startedAt,
      completedAt,
      durationSeconds,
      xpGain,
      kills: metricDelta(telemetry.kills, huntTracker.startKills),
      loot: metricDelta(telemetry.loot, huntTracker.startLoot),
      supplies: metricDelta(telemetry.supplies, huntTracker.startSupplies),
      balance: metricDelta(telemetry.balance, huntTracker.startBalance)
    };
    huntRuns = [...huntRuns, record].slice(-200);
    huntMonitorMessage = `${record.huntName}: wave concluída em ${formatElapsed(record.durationSeconds)}, com ${formatNumber(record.xpGain)} XP.`;
    ext.storage.local.set({ bjHuntRuns: huntRuns }).catch(() => {});
  }

  function monitorHuntRun(snapshot) {
    const telemetry = readHuntTelemetry(snapshot);
    if (!telemetry.valid) {
      huntTracker = null;
      huntMonitorMessage = telemetry.invalidReason === "boss"
        ? "Modo Chefes detectado: tempo e XP do boss estão sendo ignorados."
        : "Aguardando uma hunt começar.";
      return;
    }
    if (!huntTracker || core.normalizeLookup(huntTracker.huntName) !== core.normalizeLookup(telemetry.huntName)) {
      beginHuntTracker(telemetry);
      return;
    }
    const { waveRestarted, timerReset } = core.huntRunTransition(huntTracker, telemetry);
    const bossFinished = huntTracker.hadBossWave && telemetry.waveNumber == null && !huntTracker.completed;
    if (timerReset && huntTracker.fromBoundary && !huntTracker.hadBossWave && !waveRestarted) {
      // O contador do jogo zera alguns segundos depois de voltar à wave 1.
      // Mantém a XP inicial já capturada e apenas ajusta a base do relógio.
      huntTracker.startTimerSeconds = 0;
      huntTracker.maxDurationSeconds = telemetry.durationSeconds;
      huntTracker.fromBoundary = false;
    } else if (waveRestarted || timerReset) {
      const endTimer = timerReset ? huntTracker.maxDurationSeconds : telemetry.durationSeconds;
      if (telemetry.xpGain >= huntTracker.lastXp) {
        saveCompletedHunt(telemetry, endTimer - huntTracker.startTimerSeconds);
      }
      // Em loop, o jogo pode voltar da wave final à primeira sem zerar o
      // cronômetro. A virada das waves também marca uma nova medição.
      beginHuntTracker(telemetry, true, !timerReset);
      return;
    }
    if (telemetry.xpGain < huntTracker.lastXp) {
      beginHuntTracker(telemetry);
      huntTracker.eligible = false;
      huntMonitorMessage = "O Hunt Analyzer foi zerado; a medição recomeça na próxima wave 1.";
      return;
    }
    if (bossFinished) saveCompletedHunt(telemetry, Math.max(telemetry.durationSeconds, huntTracker.maxDurationSeconds) - huntTracker.startTimerSeconds);

    huntTracker.lastXp = telemetry.xpGain;
    huntTracker.lastDurationSeconds = telemetry.durationSeconds;
    if (telemetry.waveNumber != null) huntTracker.lastWaveNumber = telemetry.waveNumber;
    huntTracker.maxDurationSeconds = Math.max(huntTracker.maxDurationSeconds, telemetry.durationSeconds);
    huntTracker.hadBossWave = huntTracker.hadBossWave || (telemetry.waveCount > 0 && telemetry.waveNumber === telemetry.waveCount);
    if (!huntTracker.completed && huntTracker.eligible) {
      huntMonitorMessage = `${telemetry.huntName}: wave ${telemetry.waveNumber || "boss"}/${telemetry.waveCount || "—"} · ${telemetry.timerText} · ${formatNumber(metricDelta(telemetry.xpGain, huntTracker.startXp))} XP até agora.`;
    }
  }

  function formatElapsed(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function runXpPerHour(run) {
    return run.durationSeconds > 0 ? run.xpGain * 3600 / run.durationSeconds : 0;
  }

  function formatDecimal(value, digits = 2) {
    return Number.isFinite(value) ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value) : "—";
  }

  function formatSignedPercent(value, suffix = "%") {
    if (!Number.isFinite(value)) return "—";
    return `${value >= 0 ? "+" : ""}${formatDecimal(value, 2)}${suffix}`;
  }

  function formatSignedNumber(value) {
    if (!Number.isFinite(value)) return "—";
    return `${value >= 0 ? "+" : "−"}${formatNumber(Math.abs(Math.round(value)))}`;
  }

  function renderHuntComparisons(item, summaries) {
    const references = summaries.filter((candidate) => candidate !== item);
    if (!references.length) return "";
    return `<div class="bj-versus-list"><b>COMPARAÇÃO COM TODAS AS HUNTS</b>${references.map((reference) => {
      const xpPercent = core.relativeDifference(item.xpPerHour, reference.xpPerHour);
      const xpDifference = item.xpPerHour - reference.xpPerHour;
      const goldDifference = Number.isFinite(item.averageBalance) && Number.isFinite(reference.averageBalance)
        ? item.averageBalance - reference.averageBalance
        : null;
      const goldPercent = core.relativeDifference(item.averageBalance, reference.averageBalance);
      return `<div class="bj-versus">
        <span>vs. <b>${escapeHtml(reference.huntName)}</b></span>
        <strong class="${xpPercent >= 0 ? "bj-up" : "bj-down"}">${formatSignedPercent(xpPercent)} XP/h</strong>
        <small>${formatSignedNumber(xpDifference)} XP/h · ${formatSignedNumber(goldDifference)} gold/wave${Number.isFinite(goldPercent) ? ` (${formatSignedPercent(goldPercent)})` : ""}</small>
      </div>`;
    }).join("")}</div>`;
  }

  function renderHuntHistory() {
    const summaries = core.summarizeHuntRuns(huntRuns);
    const best = summaries[0] || null;
    host.querySelector("#bj-hunt-run-count").textContent = `${huntRuns.length} ${huntRuns.length === 1 ? "wave" : "waves"}`;
    host.querySelector("#bj-live-run").innerHTML = `<span class="bj-live-dot"></span><div><b>MEDIÇÃO EM TEMPO REAL</b><small>${escapeHtml(huntMonitorMessage)}</small></div>`;
    host.querySelector("#bj-hunt-summary").innerHTML = huntRuns.length ? `
      <article><small>Melhor rendimento</small><strong>${escapeHtml(best.huntName)}</strong><span>${formatNumber(Math.round(best.xpPerHour))} XP/h</span></article>
      <article><small>Hunts comparadas</small><strong>${summaries.length}</strong><span>${huntRuns.length} waves completas</span></article>
      <article><small>XP registrado</small><strong>${formatNumber(huntRuns.reduce((sum, run) => sum + run.xpGain, 0))}</strong><span>somando todas as waves</span></article>` : "";

    const comparison = host.querySelector("#bj-hunt-comparison");
    if (!summaries.length) {
      comparison.innerHTML = `<div class="bj-empty-state">Ainda não há wave completa. Deixe a hunt rodar da wave 1 até o boss.</div>`;
    } else {
      const maxRate = Math.max(...summaries.map((item) => item.xpPerHour), 1);
      comparison.innerHTML = `${summaries.length < 2 ? '<p class="bj-comparison-note">Registre outra hunt para liberar a comparação direta.</p>' : ""}<div class="bj-comparison-list">${summaries.map((item, index) => {
        const key = core.normalizeLookup(item.huntName);
        const expanded = selectedHuntKey === key;
        return `<article class="bj-hunt-card ${index === 0 ? "bj-best-hunt" : ""} ${expanded ? "bj-expanded" : ""}" data-hunt-card="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${expanded}">
          <div class="bj-comparison-head"><strong>${escapeHtml(item.huntName)}</strong><div><b>Média ${formatNumber(Math.round(item.xpPerHour))} XP/h</b><i>${expanded ? "−" : "+"}</i></div></div>
          <div class="bj-rate-bar"><i style="width:${Math.max(3, item.xpPerHour / maxRate * 100).toFixed(1)}%"></i></div>
          <small>Média recalculada com ${item.runs} ${item.runs === 1 ? "wave" : "waves"} · ${formatElapsed(item.averageDurationSeconds)} · ${formatNumber(Math.round(item.averageXp))} XP/wave</small>
          ${expanded ? `<div class="bj-card-details">${renderHuntComparisons(item, summaries)}
            <div class="bj-hunt-metrics">
              <span><b>Loot médio</b>${Number.isFinite(item.averageLoot) ? formatNumber(Math.round(item.averageLoot)) : "—"} gold</span>
              <span><b>Lucro médio</b>${Number.isFinite(item.averageBalance) ? formatNumber(Math.round(item.averageBalance)) : "—"} gold</span>
            </div>
          </div>` : '<span class="bj-expand-hint">Clique para abrir as comparações</span>'}
        </article>`;
      }).join("")}</div>`;
    }

    const recent = [...huntRuns].sort((a, b) => b.completedAt - a.completedAt).slice(0, 20);
    host.querySelector("#bj-run-history").innerHTML = recent.length ? `<div class="bj-run-table"><div class="bj-run-row bj-run-table-head"><span>Hunt</span><span>Tempo</span><span>XP</span><span>Loot</span><span>Lucro</span><span></span></div>${recent.map((run) => `
      <div class="bj-run-row"><span><b>${escapeHtml(run.huntName)}</b><small>${new Date(run.completedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></span><span>${formatElapsed(run.durationSeconds)}</span><span><b>${formatNumber(run.xpGain)}</b><small>${formatNumber(Math.round(runXpPerHour(run)))} XP/h</small></span><span>${formatNumber(run.loot)}</span><span>${formatNumber(run.balance)}</span><button type="button" class="bj-delete-run" data-action="delete-hunt-run" data-run-id="${escapeHtml(run.id)}" title="Excluir esta medição">×</button></div>`).join("")}</div>` : `<div class="bj-empty-state">As últimas 20 waves aparecerão aqui.</div>`;
  }

  function lookupKey(value) {
    return core.normalizeLookup(value).split(" ").map((word) => word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word).join(" ");
  }

  async function fetchGuide(url) {
    const response = await ext.runtime.sendMessage({ type: "bj:fetch-guide", url });
    if (!response || !response.ok) throw new Error(response?.error || "Catálogo indisponível");
    return response;
  }

  function parseStageIndex(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const result = {};
    for (const link of doc.querySelectorAll('a[href^="/fases/"]')) {
      const href = link.getAttribute("href");
      const name = core.clean(link.textContent);
      if (!name || !href || href === "/fases/") continue;
      result[lookupKey(name)] = href;
    }
    return result;
  }

  function findStagePath(index, location) {
    const wanted = lookupKey(location);
    if (index[wanted]) return index[wanted];
    const partial = Object.entries(index).find(([key]) => key.includes(wanted) || wanted.includes(key));
    if (partial) return partial[1];
    return ({ cobra: "/fases/cobra-cave/", cobras: "/fases/cobra-cave/" })[core.normalizeLookup(location)] || null;
  }

  function paragraphAfterLabel(doc, label) {
    const paragraphs = [...doc.querySelectorAll("#editorial-decision p")];
    const wanted = core.normalizeLookup(label);
    const paragraph = paragraphs.find((item) => core.normalizeLookup(item.querySelector("strong")?.textContent).startsWith(wanted));
    if (!paragraph) return "";
    return core.clean(paragraph.textContent).replace(new RegExp(`^${label}:?\\s*`, "i"), "");
  }

  function monsterNote(name, risk) {
    const full = core.normalizeLookup(name);
    const short = full.split(" ").at(-1);
    return risk.split(/[,;.]/).map(core.clean).find((part) => {
      const normalized = core.normalizeLookup(part);
      return normalized.includes(full) || (short.length > 4 && normalized.includes(short));
    }) || "Sem afinidade elemental descrita.";
  }

  function parseStagePage(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = core.clean(doc.querySelector("h1")?.textContent).replace(/\s+—[\s\S]*$/, "");
    const intro = [...doc.querySelectorAll("main p")].map((item) => core.clean(item.textContent)).find((text) => /nível indicativo/i.test(text)) || "";
    const level = Number((intro.match(/nível indicativo\s+(\d+)/i) || [])[1]) || null;
    const risk = paragraphAfterLabel(doc, "Risco principal");
    const focus = paragraphAfterLabel(doc, "Foco de equipamento");
    let table = doc.querySelector("#monsters")?.nextElementSibling;
    while (table && table.tagName !== "TABLE") table = table.nextElementSibling;
    const monsters = table ? [...table.querySelectorAll("tbody tr")].map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => core.clean(cell.textContent));
      return { name: cells[0], hp: core.numberFromPtBr(cells[1]), xp: core.numberFromPtBr(cells[2]), maxDamage: core.numberFromPtBr(cells[3]), armor: core.numberFromPtBr(cells[4]), note: monsterNote(cells[0], risk) };
    }).filter((item) => item.name) : [];
    return { title, level, risk, focus, monsters, url, capturedAt: Date.now() };
  }

  async function maybeLoadStage(location, force = false) {
    const name = core.clean(location).replace(/▾/g, "");
    const key = lookupKey(name);
    const section = host.querySelector("#bj-stage");
    if (!isHuntLocation(name)) {
      section.classList.add("bj-hidden-section");
      stageState = { key: null, status: "idle", data: null, error: null };
      return;
    }
    section.classList.remove("bj-hidden-section");
    if (stageState.key === key && !force) return;
    stageState = { key, status: "loading", data: null, error: null };
    renderStage();
    try {
      const stored = await ext.storage.local.get({ bjStageIndex: null, bjStageCache: {} });
      let indexRecord = stored.bjStageIndex;
      if (!indexRecord || Date.now() - indexRecord.savedAt > 7 * 86400000) {
        const indexResponse = await fetchGuide("https://guiabaiakidle.com/fases/");
        indexRecord = { savedAt: Date.now(), entries: parseStageIndex(indexResponse.html) };
        await ext.storage.local.set({ bjStageIndex: indexRecord });
      }
      const path = findStagePath(indexRecord.entries || {}, name);
      if (!path) throw new Error(`Fase “${name}” não encontrada no catálogo.`);
      const cached = stored.bjStageCache[key];
      let data = !force && cached && Date.now() - cached.capturedAt < 7 * 86400000 ? cached : null;
      if (!data) {
        const response = await fetchGuide(`https://guiabaiakidle.com${path}`);
        data = parseStagePage(response.html, response.url);
        const nextCache = { ...stored.bjStageCache, [key]: data };
        await ext.storage.local.set({ bjStageCache: Object.fromEntries(Object.entries(nextCache).slice(-30)) });
      }
      if (stageState.key !== key) return;
      stageState = { key, status: "ready", data, error: null };
    } catch (error) {
      if (stageState.key !== key) return;
      stageState = { key, status: "error", data: null, error: error.message };
    }
    renderStage();
  }

  function renderStage() {
    const target = host.querySelector("#bj-stage-content");
    if (stageState.status === "loading") {
      target.innerHTML = `<div class="bj-stage-status"><span class="bj-spinner"></span> Buscando monstros e elementos…</div>`;
      return;
    }
    if (stageState.status === "error") {
      target.innerHTML = `<div class="bj-stage-status bj-error">${escapeHtml(stageState.error)} <button data-action="reload-stage">Tentar novamente</button></div>`;
      return;
    }
    if (!stageState.data) return;
    const stage = stageState.data;
    const knight = core.findPartyKnight(latestSnapshot, profiles);
    const matchup = core.compareKnightToStage(stage, knight);
    const partyMembers = (latestSnapshot?.characters || []).map((character) => profiles[character.name] || character);
    const advice = core.buildBalanceAdvice(stage, partyMembers);
    const knightName = knight?.name || "Knight não detectado";
    const required = matchup.requiredProtection.map(elementLabel).join(", ") || "não informado";
    const danger = matchup.mostDangerous;
    target.innerHTML = `
      <div class="bj-stage-head"><strong>${escapeHtml(stage.title)}</strong><span>${stage.level ? `nível ${stage.level}+` : "catálogo"}</span></div>
      <article class="bj-matchup bj-${matchup.severity}">
        <b>${escapeHtml(knightName.toUpperCase())} × FASE</b><strong>${escapeHtml(matchup.verdict)}</strong>
        ${knight ? "" : "<span>Abra ou expanda o painel Party para identificar automaticamente o Knight.</span>"}
        <span>Ataque principal: Físico · Proteções pedidas: ${escapeHtml(required)}.</span>
        ${danger ? `<span>Maior golpe: ${escapeHtml(danger.name)} · ${formatNumber(danger.maxDamage)} (${matchup.hitPercent == null ? "HP do Knight não visível" : matchup.hitPercent.toFixed(1) + "% do HP bruto de " + escapeHtml(knightName)}).</span>` : ""}
      </article>
      <div class="bj-balance">
        <section><b>MATAR MAIS RÁPIDO</b><ul>${advice.speed.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section><b>SOBREVIVER</b><ul>${advice.survival.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      </div>
      <div class="bj-monsters">${stage.monsters.map((monster) => `
        <article><div><strong>${escapeHtml(monster.name)}</strong><span>${escapeHtml(monster.note)}</span></div>
        <dl><div><dt>HP</dt><dd>${formatNumber(monster.hp)}</dd></div><div><dt>XP</dt><dd>${formatNumber(monster.xp)}</dd></div><div><dt>Dano</dt><dd>${formatNumber(monster.maxDamage)}</dd></div><div><dt>Armor</dt><dd>${formatNumber(monster.armor)}</dd></div></dl></article>`).join("")}</div>
      ${stage.focus ? `<p class="bj-focus"><b>Equipamento:</b> ${escapeHtml(stage.focus)}</p>` : ""}
      <a class="bj-source" href="${escapeHtml(stage.url)}" target="_blank" rel="noreferrer">Fonte: Guia Baiak Idle</a>`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[char]);
  }

  async function saveHistory(snapshot) {
    const now = Date.now();
    if (now - lastHistoryAt < 60000) return;
    lastHistoryAt = now;
    const stored = await ext.storage.local.get({ bjHistory: [] });
    const history = [...stored.bjHistory, core.compactHistory(snapshot)].slice(-360);
    await ext.storage.local.set({ bjHistory: history, bjLatest: core.compactHistory(snapshot), bjProfiles: profiles });
  }

  async function refreshAll() {
    if (refreshBusy) return;
    refreshBusy = true;
    const button = host.querySelector('[data-action="refresh"]');
    button.disabled = true;
    button.textContent = "…";
    button.title = "Atualizando Party, Skills, Hunts e análise";
    setAutoState("working", "Atualizando Party, equipamentos, lista de Hunts e análise…");
    try {
      latestSnapshot = readSnapshot();
      await scanSkillsPanel(true);
      await scanHuntOptions(true);
      latestSnapshot = readSnapshot();
      mergeLiveProfiles(latestSnapshot);
      await maybeLoadStage(latestSnapshot.location, true);
      render(latestSnapshot);
      lastHistoryAt = 0;
      await saveHistory(latestSnapshot);
      setAutoState("success", "Party, equipamentos, Hunts e análise atualizados agora.");
    } catch (error) {
      setAutoState("error", `Atualização incompleta: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "↻";
      button.title = "Atualizar agora";
      refreshBusy = false;
    }
  }

  function tick(forceSkillsScan) {
    if (!settings.enabled) return;
    latestSnapshot = readSnapshot();
    render(latestSnapshot);
    if (!refreshBusy) scanSkillsPanel(Boolean(forceSkillsScan)).catch(() => {});
    saveHistory(latestSnapshot).catch(() => {});
  }

  function gameFailureDetected() {
    const gameRoot = document.querySelector("#app");
    if (!gameRoot) return true;
    const text = core.normalizeLookup(gameRoot.innerText).slice(0, 12000);
    return /desconectad|conexao perdida|connection lost|sessao expirada|erro ao carregar|falha ao conectar/.test(text);
  }

  function sendHeartbeat() {
    try {
      if (!ext.runtime?.id) return;
      const request = ext.runtime.sendMessage({
        type: "bj:heartbeat",
        online: navigator.onLine,
        errorDetected: gameFailureDetected(),
        stalled: !document.hidden && Date.now() - lastGameMutationAt > 3 * 60 * 1000,
        location: latestSnapshot?.location || null,
        stamina: latestSnapshot?.stamina?.time || null
      });
      if (request && typeof request.catch === "function") request.catch(() => {});
    } catch (_error) {
      if (timer) clearInterval(timer);
    }
  }

  function schedule() {
    if (timer) clearInterval(timer);
    host.classList.toggle("bj-hidden", !settings.enabled);
    host.classList.toggle("bj-minimized", settings.minimized);
    const minimizeButton = host.querySelector('[data-action="minimize"]');
    minimizeButton.textContent = settings.minimized ? "+" : "−";
    minimizeButton.title = settings.minimized ? "Expandir" : "Minimizar";
    switchView(settings.activeView || "dashboard", false).catch(() => {});
    if (!settings.enabled) return;
    tick();
    timer = setInterval(tick, Math.max(750, Number(settings.intervalMs) || defaults.intervalMs));
  }

  host.addEventListener("click", async (event) => {
    const huntCard = event.target.closest("[data-hunt-card]");
    if (huntCard) {
      selectedHuntKey = selectedHuntKey === huntCard.dataset.huntCard ? null : huntCard.dataset.huntCard;
      renderHuntHistory();
      return;
    }
    const action = event.target.closest("button")?.dataset.action;
    if (action === "refresh") refreshAll();
    if (action === "view-dashboard") await switchView("dashboard", true);
    if (action === "view-hunts") await switchView("hunts", true);
    if (action === "view-optimizer") await switchView("optimizer", true);
    if (action === "delete-hunt-run") {
      const id = event.target.closest("button")?.dataset.runId;
      huntRuns = huntRuns.filter((run) => run.id !== id);
      await ext.storage.local.set({ bjHuntRuns: huntRuns });
      renderHuntHistory();
    }
    if (action === "reload-stage") {
      maybeLoadStage(latestSnapshot?.location, true).catch(() => {});
    }
    if (action === "minimize") {
      settings.minimized = !settings.minimized;
      await ext.storage.local.set({ bjSettings: settings });
      schedule();
    }
  });

  host.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const huntCard = event.target.closest("[data-hunt-card]");
    if (!huntCard) return;
    event.preventDefault();
    selectedHuntKey = selectedHuntKey === huntCard.dataset.huntCard ? null : huntCard.dataset.huntCard;
    renderHuntHistory();
  });

  host.addEventListener("change", async (event) => {
    if (event.target.id !== "bj-hunt-select") return;
    settings.huntName = event.target.value || "Cobras";
    await ext.storage.local.set({ bjSettings: settings });
    renderAutomationStatus();
    setAutoState("success", `Após o treino, a party voltará para ${settings.huntName}.`);
  });

  function enableDrag() {
    const header = host.querySelector(".bj-header");
    let origin = null;
    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = host.getBoundingClientRect();
      origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener("pointermove", (event) => {
      if (!origin) return;
      const maxLeft = Math.max(0, window.innerWidth - host.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - host.offsetHeight);
      host.style.left = `${Math.min(maxLeft, Math.max(0, origin.left + event.clientX - origin.x))}px`;
      host.style.top = `${Math.min(maxTop, Math.max(0, origin.top + event.clientY - origin.y))}px`;
      host.style.right = "auto";
    });
    header.addEventListener("pointerup", () => { origin = null; });
    header.addEventListener("pointercancel", () => { origin = null; });
  }

  ext.storage.local.get({ bjSettings: defaults, bjProfiles: null, bjHuntOptions: ["Cobras"], bjHuntRuns: [] }).then(({ bjSettings, bjProfiles, bjHuntOptions, bjHuntRuns }) => {
    settings = { ...defaults, ...bjSettings };
    profiles = { ...profiles, ...(bjProfiles || {}) };
    huntOptions = Array.isArray(bjHuntOptions) && bjHuntOptions.length ? bjHuntOptions : ["Cobras"];
    huntRuns = Array.isArray(bjHuntRuns) ? bjHuntRuns : [];
    schedule();
    setTimeout(() => scanHuntOptions(false).catch(() => {}), 1500);
  });

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.bjSettings) {
      settings = { ...defaults, ...changes.bjSettings.newValue };
      schedule();
    }
    if (area === "local" && changes.bjHuntOptions) {
      huntOptions = changes.bjHuntOptions.newValue || ["Cobras"];
      renderHuntOptions();
    }
    if (area === "local" && changes.bjHuntRuns) {
      huntRuns = Array.isArray(changes.bjHuntRuns.newValue) ? changes.bjHuntRuns.newValue : [];
      renderHuntHistory();
    }
  });

  const gameRoot = document.querySelector("#app");
  if (gameRoot) {
    new MutationObserver(() => {
      if (!skillsScanBusy && !huntScanBusy) lastGameMutationAt = Date.now();
    }).observe(gameRoot, {
      subtree: true, childList: true, characterData: true, attributes: true
    });
  }
  setInterval(sendHeartbeat, 15000);
  window.addEventListener("online", sendHeartbeat);
  sendHeartbeat();

  enableDrag();
})();
