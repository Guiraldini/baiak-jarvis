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
    huntName: "Cobras"
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

  const host = document.createElement("aside");
  host.id = "baiak-jarvis";
  host.innerHTML = `
    <header class="bj-header">
      <div><strong><span class="bj-pulse"></span> JARVIS</strong><small>copiloto local</small></div>
      <div class="bj-actions">
        <button type="button" data-action="refresh" title="Atualizar agora">↻</button>
        <button type="button" data-action="minimize" title="Minimizar">−</button>
      </div>
    </header>
    <div class="bj-body">
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
      </section>
      <details class="bj-details" open>
        <summary>Poder da party</summary>
        <div id="bj-characters"></div>
      </details>
      <section class="bj-stage bj-hidden-section" id="bj-stage">
        <div class="bj-section-title">ANÁLISE DA HUNT</div>
        <div id="bj-stage-content"></div>
      </section>
      <section><div class="bj-section-title">RECOMENDAÇÕES</div><div id="bj-recommendations"></div></section>
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
    if (skillsScanBusy || (!force && Date.now() - lastSkillsScanAt < 30000)) return;
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
    renderProfiles(snapshot);

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

  function visibleActivityCandidates() {
    return [...document.querySelectorAll('button, [role="option"], [role="menuitem"], [data-wave], [data-wave-id], .wave-option, .dropdown-item')]
      .filter((element) => {
        if (host.contains(element) || element.id === "wave-title") return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
  }

  function chooseCandidate(candidates, target) {
    const wanted = core.normalizeLookup(target).replace(/s$/, "");
    return candidates.map((element) => {
      const text = core.normalizeLookup(element.textContent).replace(/s$/, "");
      let score = 99;
      if (text === wanted) score = 0;
      else if (text.startsWith(`${wanted} `)) score = 1;
      else if (text.includes(wanted)) score = 2;
      return { element, score, length: text.length };
    }).filter((item) => item.score < 99).sort((a, b) => a.score - b.score || a.length - b.length)[0]?.element || null;
  }

  async function selectActivity(target) {
    const toggle = document.querySelector("#wave-title");
    if (!toggle) throw new Error("O seletor de atividade não apareceu no jogo.");
    if (locationMatches(toggle.textContent, target)) return true;
    toggle.click();
    await delay(250);
    const option = chooseCandidate(visibleActivityCandidates(), target);
    if (!option) {
      toggle.click();
      throw new Error(`A opção “${target}” não foi encontrada no menu.`);
    }
    option.click();
    for (let attempt = 0; attempt < 16; attempt += 1) {
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
    if (!settings.automationEnabled || automationBusy) return;
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
    host.querySelector("#bj-cycle-detail").textContent = `${plan.detail} Troca por volta de ${actionTime}.`;
    host.querySelector("#bj-progress-fill").style.width = `${Math.min(100, plan.currentPercent)}%`;
    host.querySelector("#bj-floor-marker").style.left = `${(plan.huntFloor / (42 * 60)) * 100}%`;
    host.querySelector("#bj-ceiling-marker").style.left = `${(plan.huntCeiling / (42 * 60)) * 100}%`;
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

  async function maybeLoadStage(location) {
    const name = core.clean(location).replace(/▾/g, "");
    const key = lookupKey(name);
    const section = host.querySelector("#bj-stage");
    if (!isHuntLocation(name)) {
      section.classList.add("bj-hidden-section");
      stageState = { key: null, status: "idle", data: null, error: null };
      return;
    }
    section.classList.remove("bj-hidden-section");
    if (stageState.key === key) return;
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
      let data = cached && Date.now() - cached.capturedAt < 7 * 86400000 ? cached : null;
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

  function tick(forceSkillsScan) {
    if (!settings.enabled) return;
    latestSnapshot = readSnapshot();
    render(latestSnapshot);
    scanSkillsPanel(Boolean(forceSkillsScan)).catch(() => {});
    saveHistory(latestSnapshot).catch(() => {});
  }

  function gameFailureDetected() {
    const gameRoot = document.querySelector("#app");
    if (!gameRoot) return true;
    const text = core.normalizeLookup(gameRoot.innerText).slice(0, 12000);
    return /desconectad|conexao perdida|connection lost|sessao expirada|erro ao carregar|falha ao conectar/.test(text);
  }

  function sendHeartbeat() {
    ext.runtime.sendMessage({
      type: "bj:heartbeat",
      online: navigator.onLine,
      errorDetected: gameFailureDetected(),
      stalled: !document.hidden && Date.now() - lastGameMutationAt > 3 * 60 * 1000,
      location: latestSnapshot?.location || null,
      stamina: latestSnapshot?.stamina?.time || null
    }).catch(() => {});
  }

  function schedule() {
    if (timer) clearInterval(timer);
    host.classList.toggle("bj-hidden", !settings.enabled);
    host.classList.toggle("bj-minimized", settings.minimized);
    const minimizeButton = host.querySelector('[data-action="minimize"]');
    minimizeButton.textContent = settings.minimized ? "+" : "−";
    minimizeButton.title = settings.minimized ? "Expandir" : "Minimizar";
    if (!settings.enabled) return;
    tick();
    timer = setInterval(tick, Math.max(750, Number(settings.intervalMs) || defaults.intervalMs));
  }

  host.addEventListener("click", async (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action === "refresh") tick(true);
    if (action === "reload-stage") {
      stageState.key = null;
      maybeLoadStage(latestSnapshot?.location).catch(() => {});
    }
    if (action === "minimize") {
      settings.minimized = !settings.minimized;
      await ext.storage.local.set({ bjSettings: settings });
      schedule();
    }
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

  ext.storage.local.get({ bjSettings: defaults, bjProfiles: null }).then(({ bjSettings, bjProfiles }) => {
    settings = { ...defaults, ...bjSettings };
    profiles = { ...profiles, ...(bjProfiles || {}) };
    schedule();
  });

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.bjSettings) {
      settings = { ...defaults, ...changes.bjSettings.newValue };
      schedule();
    }
  });

  const gameRoot = document.querySelector("#app");
  if (gameRoot) {
    new MutationObserver(() => {
      if (!skillsScanBusy) lastGameMutationAt = Date.now();
    }).observe(gameRoot, {
      subtree: true, childList: true, characterData: true, attributes: true
    });
  }
  setInterval(sendHeartbeat, 15000);
  window.addEventListener("online", sendHeartbeat);
  sendHeartbeat();

  enableDrag();
})();
