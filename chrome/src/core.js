(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BaiakJarvisCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VOCATIONS = "Druid|Knight|Sorcerer|Paladin";
  const brazilDayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  });

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function skillMemberName(title, fallbackName) {
    const titleName = clean(title).match(/(?:·|\||—|–)\s*(.+)$/);
    return clean(titleName ? titleName[1] : fallbackName);
  }

  function numberFromPtBr(value) {
    if (value == null || value === "") return null;
    const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function percentFromPtBr(value) {
    if (value == null || value === "") return null;
    let normalized = String(value).replace(/[%+\s]/g, "");
    if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseVitalBar(value) {
    const match = String(value || "").match(/([\d.,]+)\s*\/\s*([\d.,]+)/);
    if (!match) return null;
    return { current: numberFromPtBr(match[1]), max: numberFromPtBr(match[2]) };
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

    const partyPattern = new RegExp(`(?:\\b(SUP|TANK|DPS)\\s+)?([A-Za-zÀ-ÿ0-9_-]{2,24})\\s+(${VOCATIONS})\\s*[·|]?\\s*lvl\\s*(\\d+)`, "gi");
    while ((match = partyPattern.exec(text)) !== null) {
      const role = match[1] ? match[1].toUpperCase() : null;
      const name = clean(match[2]);
      const existing = results.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.level = Number(match[4]);
        if (role) existing.role = role;
      } else {
        results.push({
          name,
          vocation: match[3],
          role,
          level: Number(match[4]),
          skillType: null,
          skillLevel: null,
          skillProgress: null
        });
      }
    }

    const vitalsPattern = new RegExp(
      `(?:\\b(SUP|TANK|DPS)\\s+)?([A-Za-zÀ-ÿ0-9_-]{2,24})\\s+(${VOCATIONS})\\s*[·|]\\s*lvl\\s*(\\d+)\\s+([\\d.]+)\\/([\\d.]+)\\s+([\\d.]+)\\/([\\d.]+)\\s+(\\d+)%`,
      "gi"
    );
    while ((match = vitalsPattern.exec(text)) !== null) {
      const role = match[1] ? match[1].toUpperCase() : null;
      const name = clean(match[2]);
      const existing = results.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (!existing) continue;
      existing.level = Number(match[4]);
      if (role) existing.role = role;
      existing.hp = numberFromPtBr(match[6]);
      existing.mana = numberFromPtBr(match[8]);
      existing.levelProgress = Number(match[9]);
    }
    return results;
  }

  function activePartyCharacters(parsed, members) {
    const parsedByName = new Map((Array.isArray(parsed) ? parsed : [])
      .filter((character) => character?.name)
      .map((character) => [normalizeLookup(character.name), character]));
    const seen = new Set();
    return (Array.isArray(members) ? members : []).flatMap((member) => {
      const key = normalizeLookup(member?.name);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      const live = Object.fromEntries(Object.entries(member).filter(([, value]) => value != null));
      return [{ ...parsedByName.get(key), ...live }];
    });
  }

  function compareVersions(first, second) {
    const parse = (value) => {
      const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/i);
      return match ? match.slice(1).map((part) => Number(part || 0)) : null;
    };
    const left = parse(first);
    const right = parse(second);
    if (!left || !right) return null;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
    }
    return 0;
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

  function elapsedToSeconds(value) {
    const parts = String(value || "").trim().split(":").map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
    if (parts.at(-1) >= 60 || (parts.length === 3 && parts[1] >= 60)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  function brazilDayKey(timestamp) {
    const parts = brazilDayFormatter.formatToParts(new Date(timestamp));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function dailyHuntXp(runs, day) {
    const records = (Array.isArray(runs) ? runs : []).filter((run) =>
      Number.isFinite(run?.completedAt) && Number.isFinite(run?.xpGain) && brazilDayKey(run.completedAt) === day
    );
    const oldest = Math.min(...(Array.isArray(runs) ? runs : []).map((run) => run?.completedAt).filter(Number.isFinite));
    return {
      day,
      xp: records.reduce((sum, run) => sum + run.xpGain, 0),
      waves: records.length,
      partial: runs?.length >= 200 && Number.isFinite(oldest) && brazilDayKey(oldest) === day
    };
  }

  function addDailyHuntRun(state, run) {
    const day = brazilDayKey(run.completedAt);
    const current = state?.day === day ? state : { day, xp: 0, waves: 0, partial: false };
    return { ...current, xp: current.xp + run.xpGain, waves: current.waves + 1 };
  }

  function huntRunTransition(previous, current) {
    const waveRestarted = previous.hadBossWave && current.waveNumber != null && previous.lastWaveNumber != null
      && current.waveNumber < previous.lastWaveNumber;
    const timerReset = current.durationSeconds + 3 < previous.lastDurationSeconds
      && (previous.hadBossWave || previous.fromBoundary || waveRestarted);
    return { waveRestarted, timerReset };
  }

  function archiveHuntRuns(archive, runs) {
    const groups = new Map(Object.entries(archive || {}).map(([key, value]) => [key, { ...value }]));
    for (const run of Array.isArray(runs) ? runs : []) {
      const durationSeconds = Number(run && run.durationSeconds);
      const xpGain = Number(run && run.xpGain);
      const huntName = clean(run && run.huntName);
      if (!huntName || run?.durationSeconds == null || run?.xpGain == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(xpGain) || xpGain < 0) continue;
      const key = normalizeLookup(huntName);
      const current = groups.get(key) || { huntName, runs: 0, totalDurationSeconds: 0, totalXp: 0, totalLoot: 0, lootRuns: 0, totalBalance: 0, balanceRuns: 0, bestXpPerHour: 0 };
      const xpPerHour = xpGain * 3600 / durationSeconds;
      current.huntName = huntName;
      current.runs += 1;
      current.totalDurationSeconds += durationSeconds;
      current.totalXp += xpGain;
      if (Number.isFinite(run.loot)) {
        current.totalLoot += run.loot;
        current.lootRuns += 1;
      }
      if (Number.isFinite(run.balance)) {
        current.totalBalance += run.balance;
        current.balanceRuns += 1;
      }
      current.bestXpPerHour = Math.max(current.bestXpPerHour, xpPerHour);
      groups.set(key, current);
    }
    return Object.fromEntries(groups);
  }

  function summarizeHuntRuns(runs, archive = {}) {
    return Object.values(archiveHuntRuns(archive, runs)).map((group) => ({
        ...group,
        averageDurationSeconds: group.totalDurationSeconds / group.runs,
        averageXp: group.totalXp / group.runs,
        averageLoot: group.lootRuns ? group.totalLoot / group.lootRuns : null,
        averageBalance: group.balanceRuns ? group.totalBalance / group.balanceRuns : null,
        xpPerHour: group.totalXp * 3600 / group.totalDurationSeconds
      })).sort((a, b) => b.xpPerHour - a.xpPerHour || a.averageDurationSeconds - b.averageDurationSeconds);
  }

  function projectLevelFromWaves(runs, huntName, character) {
    const huntKey = normalizeLookup(huntName);
    const nameKey = normalizeLookup(character?.name);
    const remaining = Number(character?.xpRemaining);
    const gains = [...(Array.isArray(runs) ? runs : [])].reverse()
      .filter((run) => normalizeLookup(run?.huntName) === huntKey)
      .map((run) => Number(run?.characterXp?.[nameKey]?.gain))
      .filter((gain) => Number.isFinite(gain) && gain >= 0)
      .slice(0, 5);
    const averageXpPerWave = gains.length ? gains.reduce((sum, gain) => sum + gain, 0) / gains.length : null;
    const xpRemaining = character?.xpRemaining != null && Number.isFinite(remaining) && remaining >= 0 ? remaining : null;
    return {
      xpRemaining,
      averageXpPerWave,
      samples: gains.length,
      waves: xpRemaining != null && averageXpPerWave > 0 ? Math.ceil(xpRemaining / averageXpPerWave) : null
    };
  }

  function relativeDifference(value, baseline) {
    const current = Number(value);
    const reference = Number(baseline);
    if (!Number.isFinite(current) || !Number.isFinite(reference) || reference === 0) return null;
    return (current - reference) / Math.abs(reference) * 100;
  }

  function bossModeDetected(input) {
    const location = normalizeLookup(input && input.location);
    if (/^(chefes?|bosses?)$/.test(location)) return true;
    if (location && input?.timerVisible) return false;
    const signal = normalizeLookup([
      input && input.badgeText,
      input && input.partyManageTitle,
      input && input.partyManageTip
    ].filter(Boolean).join(" "));
    return /\b(boss|bosses|chefe|chefes)\b/.test(signal);
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

  function mountStaminaBonusMinutes(value) {
    const text = clean(value).toLowerCase();
    const hours = text.match(/\+?\s*(\d+)\s*h(?:ora(?:s)?)?/);
    const minutes = text.match(/\+?\s*(\d+)\s*min(?:uto(?:s)?)?/);
    if (!hours && !minutes) return null;
    return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  }

  function staminaPlan(snapshot, options) {
    const config = {
      maxMinutes: snapshot?.stamina?.maxMinutes || 42 * 60,
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
        maxMinutes: config.maxMinutes,
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
        maxMinutes: config.maxMinutes,
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
        maxMinutes: config.maxMinutes,
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
      maxMinutes: config.maxMinutes,
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

  function canEquipCatalogItem(item, profile) {
    const vocation = normalizeLookup(profile?.vocation);
    const level = Number(profile?.level);
    if (!vocation || !Number.isFinite(level) || level < 1 || !item?.slot) return false;
    if (Number(item.level || 0) > level) return false;
    if (Array.isArray(item.vocs) && item.vocs.length && !item.vocs.some((allowed) => normalizeLookup(allowed) === vocation)) return false;
    if (item.durationSec || item.charges) return false;
    if (item.slot === "ammo") return vocation === "paladin";
    if (item.slot !== "weapon") return true;
    const types = {
      knight: ["sword", "axe", "club"],
      druid: ["wand"], sorcerer: ["wand"],
      paladin: ["distance"], monk: ["fist"]
    };
    return Boolean(types[vocation]?.includes(item.wt));
  }

  function catalogItemScore(item, profile, objective = "balanced", priorityElements = []) {
    const vocation = normalizeLookup(profile?.vocation);
    const skills = item.skills || {};
    const primarySkill = vocation === "druid" || vocation === "sorcerer" ? Number(skills.magic || 0)
      : vocation === "knight" ? Math.max(Number(skills.sword || 0), Number(skills.axe || 0), Number(skills.club || 0))
        : vocation === "paladin" ? Number(skills.distance || 0) : Number(skills.fist || 0);
    const wandAverage = (Number(item.wandMin || 0) + Number(item.wandMax || 0)) / 2;
    const weaponPower = vocation === "druid" || vocation === "sorcerer"
      ? wandAverage * 0.2 + (item.manaShot ? wandAverage / Number(item.manaShot) * 10 : 0)
      : Number(item.atk || 0) * 1.35;
    const magicElements = Object.values(item.magicEl || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const elementAttack = typeof item.elementAtk === "object"
      ? Object.values(item.elementAtk).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
      : Number(item.elementAtk || 0);
    const offensive = primarySkill * 14 + weaponPower + magicElements * 2
      + Number(item.critChance || 0) * 2 + Number(item.critDmg || 0) * 0.6
      + elementAttack * 0.4 + Number(item.hitChance || 0) * 0.5;
    const protection = Object.entries(item.absorb || {}).reduce((sum, [element, value]) => {
      const weight = priorityElements.includes(element) ? 2.5 : 1.4;
      return sum + (Number(value) || 0) * weight;
    }, 0);
    const defensive = Number(item.arm || 0) * 1.5 + Number(item.def || 0) * 0.4
      + protection + Number(item.lifeLeech || 0) * 0.5 + Number(item.manaLeech || 0) * 0.3
      + Number(item.moveSpeed || 0) * 0.4;
    const weights = objective === "xp" ? [1.5, 0.5] : objective === "safety" ? [0.55, 1.5] : [1, 1];
    return offensive * weights[0] + defensive * weights[1];
  }

  function equipmentRecommendations(profile, catalog, objective = "balanced", priorityElements = []) {
    const entries = Array.isArray(catalog) ? catalog : [];
    const eligible = entries.filter((item) => canEquipCatalogItem(item, profile));
    const rank = (items) => [...items].sort((a, b) =>
      catalogItemScore(b, profile, objective, priorityElements) - catalogItemScore(a, profile, objective, priorityElements)
      || Number(b.level || 0) - Number(a.level || 0) || a.name.localeCompare(b.name));
    const bySlot = (slot) => rank(eligible.filter((item) => item.slot === slot));
    const offhands = bySlot("shield");
    const ammunition = bySlot("ammo");
    const weapons = bySlot("weapon");
    const pairs = weapons.map((weapon) => {
      const offhand = weapon.twoHanded ? null : offhands[0] || null;
      const ammo = weapon.ammoType ? ammunition.find((item) => item.ammoType === weapon.ammoType) || null : null;
      return {
        weapon, offhand, ammo,
        score: catalogItemScore(weapon, profile, objective, priorityElements)
          + (offhand ? catalogItemScore(offhand, profile, objective, priorityElements) : 0)
          + (ammo ? catalogItemScore(ammo, profile, objective, priorityElements) : 0)
      };
    }).sort((a, b) => b.score - a.score || a.weapon.name.localeCompare(b.weapon.name));
    const pair = pairs[0] || null;
    const equipped = new Map();
    const known = new Map(entries.map((item) => [normalizeLookup(item.name), item]));
    for (const worn of profile?.equipment || []) {
      const item = known.get(normalizeLookup(worn.name));
      if (item?.slot && !equipped.has(item.slot)) equipped.set(item.slot, item);
    }
    const slots = ["weapon", "shield", "ammo", "helmet", "armor", "legs", "boots", "amulet", "ring"]
      .filter((slot) => slot !== "shield" || (pair && !pair.weapon.twoHanded))
      .filter((slot) => slot !== "ammo" || (pair && pair.weapon.ammoType))
      .map((slot) => {
        const ranked = slot === "weapon" ? pairs.map((candidate) => candidate.weapon)
          : slot === "ammo" ? bySlot(slot).filter((item) => item.ammoType === pair.weapon.ammoType) : bySlot(slot);
        const best = slot === "weapon" ? pair?.weapon || null : slot === "shield" ? pair?.offhand || null
          : slot === "ammo" ? pair?.ammo || null : ranked[0] || null;
        return { slot, best, equipped: equipped.get(slot) || null, alternatives: ranked.filter((item) => item !== best).slice(0, 2) };
      });
    return { slots, eligibleCount: eligible.length, pair };
  }

  function catalogStageFromCells(cells) {
    if (!Array.isArray(cells) || cells.length < 4) return null;
    const values = cells.map(clean);
    if (!/^\d+\+?$/.test(values[0])) return null;
    const title = values[1].replace(/\s*\(dados de catálogo\)\s*$/i, "");
    if (!title) return null;
    return {
      title,
      level: Number(values[0].replace("+", "")),
      monsters: values[2].split(",").map(clean).filter(Boolean),
      drops: values[3].split(",").map(clean).filter(Boolean)
    };
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

  function buildBalanceAdvice(stage, characters) {
    if (!stage) return { speed: [], survival: [] };
    const members = Array.isArray(characters) ? characters.filter(Boolean) : [];
    const focus = stage.focus || "";
    const protectionText = focus.split(/\b(?:dano|damage|ataque|attack)\b/i)[0];
    const damageMatch = focus.match(/\b(?:dano|damage|ataque|attack)\b([\s\S]*)/i);
    const requiredProtection = elementMentions(protectionText);
    const suggestedDamage = elementMentions(damageMatch ? damageMatch[1] : "");
    const labels = { physical: "Físico", earth: "Terra", death: "Morte", fire: "Fogo", ice: "Gelo", energy: "Energia", holy: "Sagrado" };
    const risk = normalizeLookup(stage.risk || "");
    const speed = [];
    const survival = [];

    if (/resistencia fisic/.test(risk)) speed.push("A fase possui resistência física; o Knight perde ritmo se depender apenas do dano físico.");
    if (suggestedDamage.length) speed.push(`Priorize dano ${suggestedDamage.map((item) => labels[item]).join(" ou ")}, indicado para esta fase.`);

    for (const member of members) {
      const totalSkill = Number.isFinite(member.skillLevel) ? member.skillLevel + (Number(member.skillBonus) || 0) : null;
      const bonuses = Array.isArray(member.bonusEntries) ? member.bonusEntries : [];
      const bonus = (name) => bonuses.find((item) => normalizeLookup(item.label) === name)?.value || null;
      const offenseParts = [];
      if (totalSkill != null) offenseParts.push(`${member.skillType || "Skill"} ${totalSkill} total`);
      if (bonus("chance de critico")) offenseParts.push(`crítico ${bonus("chance de critico")}`);
      if (bonus("velocidade de ataque")) offenseParts.push(`velocidade ${bonus("velocidade de ataque")}`);
      if (offenseParts.length) speed.push(`${member.name}: ${offenseParts.join(" · ")}.`);

      const protections = member.protections || {};
      const candidates = (requiredProtection.length ? requiredProtection : Object.keys(protections)).map((element) => ({
        element,
        value: Number.isFinite(protections[element]) ? protections[element] : null
      })).sort((a, b) => (a.value == null ? -Infinity : a.value) - (b.value == null ? -Infinity : b.value));
      const weakest = candidates[0];
      if (weakest) {
        const current = weakest.value == null ? "sem bônus detectado" : `${weakest.value}%`;
        survival.push(`${member.name}: menor proteção necessária é ${labels[weakest.element] || weakest.element} (${current}); priorize esse elemento para reduzir o risco.`);
      }
    }

    if (!speed.length) speed.push("Aumente a skill principal, crítico e velocidade de ataque dos causadores de dano.");
    if (!survival.length) survival.push("Não há dados suficientes de proteção; atualize a leitura dos equipamentos antes de comparar a sobrevivência.");
    return { speed: speed.slice(0, 5), survival: survival.slice(0, 4), requiredProtection, suggestedDamage };
  }

  function findPartyKnight(snapshot, profiles) {
    const characters = snapshot && Array.isArray(snapshot.characters) ? snapshot.characters : [];
    const candidates = characters
      .filter((character) => normalizeLookup(character.vocation) === "knight")
      .sort((a, b) => Number(b.role === "TANK") - Number(a.role === "TANK"));
    const character = candidates[0];
    if (!character) return null;
    const saved = profiles && Object.values(profiles)
      .find((profile) => normalizeLookup(profile.name) === normalizeLookup(character.name));
    const merged = { ...(saved || {}) };
    for (const [key, value] of Object.entries(character)) {
      if (value != null) merged[key] = value;
    }
    return merged;
  }

  function automationDecision(snapshot, options) {
    if (!snapshot || !snapshot.stamina) return null;
    const config = {
      enabled: true,
      huntName: "Cobras",
      trainingMode: "online",
      floorPercent: 16,
      trainingDurationMinutes: 120,
      vipActive: true,
      ...options
    };
    if (!config.enabled) return null;
    const plan = staminaPlan(snapshot, config);
    if (!plan) return null;
    const location = normalizeLookup(snapshot.location || "");
    const trainingTarget = config.trainingMode === "house" ? "Casa" : "Treino online";
    const isTraining = location.includes("treino online") || location === "casa" || /treinando/i.test(snapshot.activity || "");
    const huntKey = normalizeLookup(config.huntName);
    const isTargetHunt = Boolean(huntKey) && (location.includes(huntKey) || huntKey.includes(location));

    if (plan.currentMinutes <= plan.huntFloor && !isTraining) {
      return { type: "train", target: trainingTarget, reason: `Stamina chegou a ${formatMinutes(plan.huntFloor)} (${plan.floorPercent}%).` };
    }
    if (plan.currentMinutes >= plan.huntCeiling && !isTargetHunt) {
      return { type: "hunt", target: config.huntName, reason: `Stamina chegou a ${formatMinutes(plan.huntCeiling)} (${plan.targetPercent}%).` };
    }
    return null;
  }

  function bossRunDecision(cards, attempted, chargesLeft) {
    if (!Number.isFinite(chargesLeft)) return { type: "stop", reason: "charges-unknown" };
    if (chargesLeft <= 0) return { type: "stop", reason: "no-charges" };
    const favorites = Array.isArray(cards) ? cards.filter((card) => card.favorite) : [];
    if (!favorites.length) return { type: "stop", reason: "no-favorites" };
    const visited = new Set((attempted || []).map(normalizeLookup));
    const ready = favorites.filter((card) => card.ready && !visited.has(normalizeLookup(card.name)));
    if (!ready.length) return { type: "stop", reason: "none-ready" };
    const chosen = ready[0];
    const name = normalizeLookup(chosen.name);
    if (!name || favorites.filter((card) => normalizeLookup(card.name) === name).length !== 1) {
      return { type: "stop", reason: "ambiguous-boss" };
    }
    return { type: "fight", name: chosen.name };
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

  function codexCompletion(quantities, counts, done = false) {
    const remaining = quantities.map((quantity, index) => done ? 0 : Math.max(0, quantity - Math.max(0, Number(counts[index]) || 0)));
    const total = quantities.reduce((sum, quantity) => sum + quantity, 0);
    const missing = remaining.reduce((sum, quantity) => sum + quantity, 0);
    return {
      percent: done || (total > 0 && missing === 0) ? 100 : total > 0 ? Math.floor((total - missing) / total * 100) : 0,
      remaining,
      ready: total > 0 && missing === 0
    };
  }

  return {
    buildRecommendations,
    bossModeDetected,
    bossRunDecision,
    addDailyHuntRun,
    archiveHuntRuns,
    brazilDayKey,
    catalogStageFromCells,
    clean,
    compactHistory,
    codexCompletion,
    durationToMinutes,
    dailyHuntXp,
    elapsedToSeconds,
    elementMentions,
    canEquipCatalogItem,
    catalogItemScore,
    equipmentRecommendations,
    formatMinutes,
    huntRunTransition,
    mountStaminaBonusMinutes,
    numberFromPtBr,
    percentFromPtBr,
    relativeDifference,
    parseVitalBar,
    parseSnapshot,
    activePartyCharacters,
    compareVersions,
    compareKnightToStage,
    buildBalanceAdvice,
    findPartyKnight,
    automationDecision,
    normalizeLookup,
    skillMemberName,
    staminaPlan,
    summarizeHuntRuns,
    projectLevelFromWaves,
    usage
  };
});
