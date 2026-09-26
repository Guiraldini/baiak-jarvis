// Uso: node scripts/build_codex_item_catalog.js caminho/para/assets/index-*.js
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

if (!process.argv[2]) throw new Error("Informe o caminho do bundle do cliente do jogo.");
const bundle = fs.readFileSync(process.argv[2], "utf8");

function literalAfter(marker, open, close) {
  const markerAt = bundle.indexOf(marker);
  if (markerAt < 0) throw new Error(`O catálogo do jogo mudou: ${marker}`);
  const start = markerAt + marker.length - 1;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < bundle.length; index += 1) {
    const char = bundle[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === open) depth += 1;
    else if (char === close && --depth === 0) {
      return vm.runInNewContext(`(${bundle.slice(start, index + 1)})`);
    }
  }
  throw new Error(`Literal incompleto no catálogo do jogo: ${marker}`);
}

const stages = literalAfter("Ca=[", "[", "]");
const huntRequirements = literalAfter("Wae={", "{", "}");
const bosses = literalAfter("Gae=[", "[", "]");
const sets = literalAfter("G9e=[", "[", "]");
const roman = ["I", "II", "III", "IV"];
const rarities = ["Comum", "Incomum", "Raro", "Épico"];
const missions = [];
const items = {};
const keyFor = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function addMission(id, title, requirements) {
  const missionIndex = missions.length;
  missions.push({ id, title });
  requirements.forEach((requirement, requirementIndex) => {
    const names = requirement.anyOf || [requirement.item];
    for (const name of names) {
      const key = keyFor(name);
      if (!key) continue;
      (items[key] ||= []).push([
        missionIndex, requirementIndex, requirement.qty,
        requirement.tier ?? null, requirement.minTier ?? null, Boolean(requirement.anyTier)
      ]);
    }
  });
}

for (const stage of stages) {
  const requirements = huntRequirements[stage.id];
  if (!requirements?.length) continue;
  for (const [tier, multiplier] of [1, 5, 15].entries()) {
    addMission(`hunt-${stage.id}${tier ? `-${tier + 1}` : ""}`,
      `Domínio: ${stage.name} ${roman[tier]}`,
      requirements.map((entry) => ({ ...entry, qty: entry.qty * multiplier })));
  }
}
for (const boss of bosses) {
  addMission(boss.id, `Troféu de ${boss.mname} ${roman[boss.step]}`, boss.req);
}
for (const set of sets) {
  for (let tier = 0; tier < 4; tier += 1) {
    addMission(`set-${set.id}-${tier}`, `Set ${set.name} (${rarities[tier]})`,
      set.pieces.map((item) => ({ item, qty: 1, tier })));
  }
}

if (missions.length < 600 || Object.keys(items).length < 100) {
  throw new Error("O catálogo Codex extraído está incompleto.");
}
const output = `// Requisitos Codex extraídos do cliente oficial do jogo em ${new Date().toLocaleDateString("pt-BR")}.\n` +
  `globalThis.BaiakJarvisCodexItemCatalog = ${JSON.stringify({ missions, items })};\n`;
for (const browser of ["chrome", "firefox"]) {
  fs.writeFileSync(path.join(__dirname, "..", browser, "src", "codex-item-catalog.js"), output);
}
console.log(`${missions.length} missões Codex; ${Object.keys(items).length} nomes de itens.`);
