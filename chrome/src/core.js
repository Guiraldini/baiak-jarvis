(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BaiakJarvisCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VOCATIONS = "Druid|Knight|Sorcerer|Paladin";

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function numberFromPtBr(value) {
    if (value == null || value === "") return null;
    const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function firstMatch(text, expression, transform) {
    const match = text.match(expression);
    if (!match) return null;
    return transform ? transform(match) : match[1];
  }

  function section(text, heading, nextHeadings) {
    const upper = text.toUpperCase();
    const start = upper.indexOf(heading.toUpperCase());
    if (start < 0) return "";
    let end = text.length;
    for (const next of nextHeadings) {
      const candidate = upper.indexOf(next.toUpperCase(), start + heading.length);
      if (candidate >= 0 && candidate < end) end = candidate;
    }
    return text.slice(start, end);
  }

  function parseCharacters(text) {
    const results = [];
    const seen = new Set();
    const trainingPattern = new RegExp(
      `([A-Za-zÀ-ÿ0-9_-]{2,24})\\s*[·|]\\s*(${VOCATIONS})\\s*[·|]\\s*(Magic|Melee|Distance|Shielding)\\s*(\\d+)\\s*\\((\\d+)%\\)`,
      "gi"
    );
    let match;
    while ((match = trainingPattern.exec(text)) !== null) {
      const name = clean(match[1]);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        name,
        vocation: match[2],
        level: null,
        skillType: match[3],
        skillLevel: Number(match[4]),
        skillProgress: Number(match[5])
      });
    }

    const partyPattern = new RegExp(`([A-Za-zÀ-ÿ0-9_-]{2,24})\\s+(${VOCATIONS})\\s*[·|]?\\s*lvl\\s*(\\d+)`, "gi");
    while ((match = partyPattern.exec(text)) !== null) {
      const name = clean(match[1]);
      const existing = results.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.level = Number(match[3]);
      } else {
        results.push({
          name,
          vocation: match[2],
          level: Number(match[3]),
          skillType: null,
          skillLevel: null,
          skillProgress: null
        });
      }
    }

    const vitalsPattern = new RegExp(
      `([A-Za-zÀ-ÿ0-9_-]{2,24})\\s+(${VOCATIONS})\\s*[·|]\\s*lvl\\s*(\\d+)\\s+([\\d.]+)\\/([\\d.]+)\\s+([\\d.]+)\\/([\\d.]+)\\s+(\\d+)%`,
      "gi"
    );
    while ((match = vitalsPattern.exec(text)) !== null) {
      const name = clean(match[1]);
      const existing = results.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (!existing) continue;
      existing.level = Number(match[3]);
      existing.hp = numberFromPtBr(match[5]);
      existing.mana = numberFromPtBr(match[7]);
      existing.levelProgress = Number(match[8]);
    }
    return results;
  }

  function parseSlots(text, heading, nextHeadings) {
    const source = section(text, heading, nextHeadings);
    const match = source.match(/Slots\s*(\d+)\s*\/\s*(\d+)/i);
    if (!match) return null;
    return { used: Number(match[1]), total: Number(match[2]) };
  }

  function parseMetrics(text) {
    const xpPerHour = firstMatch(text, /(?:XP|EXP)(?:\s*\/\s*h|\s+por\s+hora|\s+per\s+hour)\s*[:]?\s*([\d.,]+)/i, (m) => numberFromPtBr(m[1]));
    const loot = firstMatch(text, /Loot(?:\s+Value|\s+valor)?\s*[:]?\s*([\d.,]+)/i, (m) => numberFromPtBr(m[1]));
    const supplies = firstMatch(text, /Suppl(?:y|ies)(?:\s+Value|\s+valor)?\s*[:]?\s*([\d.,]+)/i, (m) => numberFromPtBr(m[1]));
    return { xpPerHour, loot, supplies };
  }

  function parseSnapshot(input) {
    const text = String(input && input.text ? input.text : "");
    const compact = clean(text.replace(/\r?\n/g, " "));
    const title = clean(input && input.title);
    const stamina = compact.match(/Stamina\s*(\d{1,2}:\d{2})[\s\S]{0,180}?(\d{1,3})%/i);
    const inbox = compact.match(/(\d+)\s*item\(ns\)\s*esperando/i);
    const gold = compact.match(/\b(\d{1,3}(?:\.\d{3}){1,5})\b/);

    return {
      capturedAt: input && input.now ? input.now : Date.now(),
      player: firstMatch(title, /^([^·]+)/, (m) => clean(m[1])),
      location: clean(input && input.location) || firstMatch(compact, /\b(Cidade|Treino online|Hunts?|Chefes?)\b/i),
      activity: firstMatch(compact, /\b(treinando|caçando|em combate|parado)\b/i),
      loopEnabled: input && typeof input.loopEnabled === "boolean" ? input.loopEnabled : null,
      stamina: stamina ? { time: stamina[1], percent: Number(stamina[2]) } : null,
      gold: gold ? numberFromPtBr(gold[1]) : null,
      inboxCount: inbox ? Number(inbox[1]) : null,
      backpack: parseSlots(compact, "Backpack", ["Supply Pouch", "Loot Pouch"]),
      lootPouch: parseSlots(compact, "Loot Pouch", []),
      characters: parseCharacters(compact),
      metrics: parseMetrics(compact)
    };
  }

  function usage(slots) {
    return slots && slots.total ? slots.used / slots.total : null;
  }

  function durationToMinutes(value) {
    const match = String(value || "").match(/^(\d{1,3}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function formatMinutes(value) {
    if (!Number.isFinite(value)) return "—";
    const rounded = Math.max(0, Math.ceil(value));
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    if (!hours) return `${minutes}min`;
    return `${hours}h${String(minutes).padStart(2, "0")}`;
  }

  function staminaPlan(snapshot, options) {
    const config = {
      maxMinutes: 42 * 60,
      floorPercent: 16,
      trainingDurationMinutes: 120,
      trainingRate: options && options.vipActive ? 8 : 4,
      ...options
    };
    const currentMinutes = snapshot && snapshot.stamina ? durationToMinutes(snapshot.stamina.time) : null;
    if (currentMinutes == null) return null;

    const huntFloor = Math.round(config.maxMinutes * config.floorPercent / 100);
    const trainingGain = config.trainingDurationMinutes * config.trainingRate;
    const huntCeiling = Math.min(config.maxMinutes, huntFloor + trainingGain);
    const plannedHuntMinutes = huntCeiling - huntFloor;
    const isTraining = /treino/i.test(`${snapshot.location || ""} ${snapshot.activity || ""}`);
    const vipActive = config.trainingRate >= 8;
    const floorPercent = Math.round((huntFloor / config.maxMinutes) * 100);
    const ceilingPercent = Math.round((huntCeiling / config.maxMinutes) * 100);
    const currentPercent = Math.min(100, Math.max(0, (currentMinutes / config.maxMinutes) * 100));

    if (isTraining && currentMinutes < huntCeiling) {
      const staminaMissing = huntCeiling - currentMinutes;
      const remainingRealMinutes = staminaMissing / config.trainingRate;
      return {
        phase: "train",
        action: "CONTINUE TREINANDO",
        currentMinutes,
        currentPercent,
        huntFloor,
        huntCeiling,
        floorPercent,
        targetPercent: ceilingPercent,
        plannedHuntMinutes,
        remainingRealMinutes,
        nextAt: snapshot.capturedAt + remainingRealMinutes * 60000,
        trainingRate: config.trainingRate,
        vipActive,
        detail: `Pare em ${formatMinutes(huntCeiling)} (${ceilingPercent}%). Faltam ${formatMinutes(remainingRealMinutes)} reais.`
      };
    }

    if (isTraining && currentMinutes >= huntCeiling) {
      return {
        phase: "hunt",
        action: "HORA DE CAÇAR",
        currentMinutes,
        currentPercent,
        huntFloor,
        huntCeiling,
        floorPercent,
        targetPercent: ceilingPercent,
        plannedHuntMinutes,
        remainingRealMinutes: 0,
        nextAt: snapshot.capturedAt,
        trainingRate: config.trainingRate,
        vipActive,
        detail: `Cace até ${formatMinutes(huntFloor)} (${floorPercent}%). Isso rende ${formatMinutes(plannedHuntMinutes)} de hunt.`
      };
    }

    const remainingHuntMinutes = currentMinutes - huntFloor;
    if (remainingHuntMinutes > 0) {
      return {
        phase: "hunt",
        action: "CONTINUE CAÇANDO",
        currentMinutes,
        currentPercent,
        huntFloor,
        huntCeiling,
        floorPercent,
        targetPercent: ceilingPercent,
        plannedHuntMinutes,
        remainingRealMinutes: remainingHuntMinutes,
        nextAt: snapshot.capturedAt + remainingHuntMinutes * 60000,
        trainingRate: config.trainingRate,
        vipActive,
        detail: `Pare em ${formatMinutes(huntFloor)} (${floorPercent}%). Restam ${formatMinutes(remainingHuntMinutes)} de hunt.`
      };
    }

    const staminaMissing = huntCeiling - currentMinutes;
    const remainingRealMinutes = staminaMissing / config.trainingRate;
    return {
      phase: "train",
      action: "HORA DE TREINAR",
      currentMinutes,
      currentPercent,
      huntFloor,
      huntCeiling,
      floorPercent,
      targetPercent: ceilingPercent,
      plannedHuntMinutes,
      remainingRealMinutes,
      nextAt: snapshot.capturedAt + remainingRealMinutes * 60000,
      trainingRate: config.trainingRate,
      vipActive,
      detail: `Treine até ${formatMinutes(huntCeiling)} (${ceilingPercent}%). Faltam ${formatMinutes(remainingRealMinutes)} reais.`
    };
  }

  function normalizeLookup(value) {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function elementMentions(value) {
    const aliases = {
      physical: ["physical", "fisico", "fisica"], earth: ["earth", "terra"], death: ["death", "morte"],
      fire: ["fire", "fogo"], ice: ["ice", "gelo"], energy: ["energy", "energia"],
      holy: ["holy", "sagrado"]
    };
    const normalized = normalizeLookup(value);
    return Object.entries(aliases)
      .filter(([, words]) => words.some((word) => new RegExp(`\\b${word}\\b`).test(normalized)))
      .map(([element]) => element);
  }

  function compareKnightToStage(stage, knight) {
    if (!stage) return null;
    const risk = normalizeLookup(stage.risk || "");
    const focus = stage.focus || "";
    const protectionText = focus.split(/\b(?:dano|damage|ataque|attack)\b/i)[0];
    const requiredProtection = elementMentions(protectionText);
    const physicalResistance = /resistencia fisic/.test(risk);
    const physicalWeakness = /fraqueza (?:a |ao )?fisic/.test(risk);
    const mostDangerous = [...(stage.monsters || [])].sort((a, b) => (b.maxDamage || 0) - (a.maxDamage || 0))[0] || null;
    const hp = knight && knight.hp ? knight.hp : null;
    const hitPercent = hp && mostDangerous && mostDangerous.maxDamage ? (mostDangerous.maxDamage / hp) * 100 : null;
    const protections = knight && knight.protections ? knight.protections : {};
    const knownProtectionValues = Object.entries(protections).filter(([, value]) => Number.isFinite(value));
    const maxProtection = knownProtectionValues.length ? Math.max(...knownProtectionValues.map(([, value]) => value)) : null;
    const strongestDefense = maxProtection == null
      ? []
      : knownProtectionValues.filter(([, value]) => value === maxProtection).map(([element]) => element);
    const uncovered = requiredProtection.filter((element) => !Number.isFinite(protections[element]) || protections[element] < 1);

    let severity = "positive";
    if (physicalResistance || uncovered.length) severity = "warning";
    if (hitPercent != null && hitPercent >= 25) severity = "critical";
    return {
      severity,
      strongestAttack: "physical",
      strongestDefense,
      requiredProtection,
      uncovered,
      physicalResistance,
      physicalWeakness,
      mostDangerous,
      hitPercent,
      verdict: physicalResistance
        ? "Parte da fase resiste ao ataque físico do Knight. O ritmo pode cair."
        : physicalWeakness
          ? "A fase favorece o ataque físico do Knight."
          : "O ataque físico não tem vantagem elemental confirmada nesta fase."
    };
  }

  function automationDecision(snapshot, options) {
    if (!snapshot || !snapshot.stamina) return null;
    const config = {
      enabled: true,
      huntName: "Cobras",
      floorPercent: 16,
      trainingDurationMinutes: 120,
      vipActive: true,
      ...options
    };
    if (!config.enabled) return null;
    const plan = staminaPlan(snapshot, config);
    if (!plan) return null;
    const location = normalizeLookup(snapshot.location || "");
    const isTraining = location.includes("treino online") || /treinando/i.test(snapshot.activity || "");
    const huntKey = normalizeLookup(config.huntName);
    const isTargetHunt = Boolean(huntKey) && (location.includes(huntKey) || huntKey.includes(location));

    if (plan.currentMinutes <= plan.huntFloor && !isTraining) {
      return { type: "train", target: "Treino online", reason: `Stamina chegou a ${formatMinutes(plan.huntFloor)} (${plan.floorPercent}%).` };
    }
    if (plan.currentMinutes >= plan.huntCeiling && !isTargetHunt) {
      return { type: "hunt", target: config.huntName, reason: `Stamina chegou a ${formatMinutes(plan.huntCeiling)} (${plan.targetPercent}%).` };
    }
    return null;
  }

  function recommendation(id, severity, title, detail) {
    return { id, severity, title, detail };
  }

  function buildRecommendations(snapshot, objective) {
    const items = [];
    if (!snapshot) return [recommendation("waiting", "info", "Aguardando o jogo", "Abra o Baiak Idle e mantenha esta extensão ativa.")];

    if (snapshot.inboxCount >= 100) {
      items.push(recommendation("inbox", "warning", "Caixa de entrada acumulada", `${snapshot.inboxCount} itens estão esperando. Revise antes que o volume esconda drops importantes.`));
    }

    const backpackUsage = usage(snapshot.backpack);
    if (backpackUsage != null && backpackUsage >= 0.85) {
      items.push(recommendation("backpack", "critical", "Mochila quase cheia", `${snapshot.backpack.used}/${snapshot.backpack.total} slots ocupados. Libere espaço antes da próxima hunt.`));
    } else if (backpackUsage != null && backpackUsage >= 0.65) {
      items.push(recommendation("backpack", "warning", "Atenção ao espaço", `${Math.round(backpackUsage * 100)}% da mochila está ocupada.`));
    }

    if (snapshot.stamina) {
      if (snapshot.stamina.percent <= 20) {
        items.push(recommendation("stamina", "critical", "Stamina muito baixa", `Stamina em ${snapshot.stamina.percent}%. Priorize recuperação e evite uma hunt longa.`));
      } else if (snapshot.stamina.percent < 50 && /treino/i.test(snapshot.location || snapshot.activity || "")) {
        items.push(recommendation("training", "positive", "Recuperando stamina", `Stamina em ${snapshot.stamina.percent}%. O treino online está alinhado com a recuperação.`));
      } else if (snapshot.stamina.percent < 50) {
        items.push(recommendation("stamina", "warning", "Stamina abaixo de 50%", `Stamina em ${snapshot.stamina.percent}%. Considere o Treino Online antes de priorizar XP.`));
      }
    }

    if (snapshot.characters.length > 0 && snapshot.characters.length < 3) {
      items.push(recommendation("party", "warning", "Party incompleta", `Só ${snapshot.characters.length} personagem(ns) foram detectados.`));
    }

    if (snapshot.loopEnabled === false && /treinando|caçando/i.test(snapshot.activity || "")) {
      items.push(recommendation("loop", "info", "Loop desativado", "Ative o loop se quiser repetir a atividade atual continuamente."));
    }

    if (objective === "xp" && snapshot.stamina && snapshot.stamina.percent >= 80 && /treino/i.test(snapshot.location || "")) {
      items.push(recommendation("xp-ready", "positive", "Pronto para ganhar XP", "A stamina já permite considerar uma hunt de progressão."));
    }

    if (objective === "profit" && snapshot.lootPouch && snapshot.lootPouch.total > 0 && usage(snapshot.lootPouch) >= 0.8) {
      items.push(recommendation("loot-pouch", "warning", "Loot Pouch quase cheia", "Venda ou organize o loot antes de continuar focando lucro."));
    }

    if (!items.length) {
      items.push(recommendation("stable", "positive", "Situação estável", "Nenhum gargalo imediato foi detectado nos painéis visíveis."));
    }
    return items.slice(0, 4);
  }

  function compactHistory(snapshot) {
    return {
      capturedAt: snapshot.capturedAt,
      location: snapshot.location,
      stamina: snapshot.stamina ? snapshot.stamina.percent : null,
      backpackUsed: snapshot.backpack ? snapshot.backpack.used : null,
      backpackTotal: snapshot.backpack ? snapshot.backpack.total : null,
      xpPerHour: snapshot.metrics ? snapshot.metrics.xpPerHour : null,
      loot: snapshot.metrics ? snapshot.metrics.loot : null,
      supplies: snapshot.metrics ? snapshot.metrics.supplies : null
    };
  }

  return {
    buildRecommendations,
    clean,
    compactHistory,
    durationToMinutes,
    elementMentions,
    formatMinutes,
    numberFromPtBr,
    parseSnapshot,
    compareKnightToStage,
    automationDecision,
    normalizeLookup,
    staminaPlan,
    usage
  };
});
