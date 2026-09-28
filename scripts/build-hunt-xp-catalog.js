"use strict";

// Extrai somente os dados das fases e criaturas do bundle público do jogo.
// Uso: node scripts/build-hunt-xp-catalog.js caminho/para/index-*.js
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourceFile = process.argv[2];
if (!sourceFile) throw new Error("Informe o arquivo JS do jogo.");
const source = fs.readFileSync(sourceFile, "utf8");

function literal(key, opener, closer) {
  const marker = source.indexOf(key);
  if (marker < 0) throw new Error(`Bloco ${key} não encontrado.`);
  const start = marker + key.length;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === opener) depth += 1;
    else if (char === closer && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Bloco ${key} incompleto.`);
}

function readLiteral(key, opener, closer) {
  return vm.runInNewContext(`(${literal(key, opener, closer)})`, Object.create(null), { timeout: 2000 });
}

function dataBlock(expression, opener, closer) {
  const match = source.match(expression);
  if (!match) throw new Error(`Dados não encontrados: ${expression}`);
  return readLiteral(`${match[1]}=`, opener, closer);
}

const monsters = dataBlock(/([\w$]+)=\{troll:\{name:"Troll"/, "{", "}");
const stages = dataBlock(/([\w$]+)=\[\{id:"troll-cave"/, "[", "]");
const highLevelGroups = dataBlock(/([\w$]+)=\{mycobiontic_beetle:"bloatedmanmaggot"/, "{", "}");
const highLevelFactors = dataBlock(/([\w$]+)=\{bloatedmanmaggot:3,maggot:3\.2/, "{", "}");
const radiantFactors = dataBlock(/([\w$]+)=\{skyhold:3\.92,ascendancy:3\.35/, "{", "}");

function xpFactor(key) {
  if (highLevelGroups[key]) return highLevelFactors[highLevelGroups[key]] || 1;
  if (key.startsWith("radiant_") || key.startsWith("devoted_radiant_")) {
    return radiantFactors[/acolyte|paragon|warden/.test(key) ? "skyhold" : "ascendancy"] || 1;
  }
  return 1;
}

const available = stages.filter((stage) => stage.avail === "on").map((stage) => ({
  id: stage.id,
  name: stage.name,
  level: stage.minLevel,
  monsters: stage.monsters.map((key) => {
    const monster = monsters[key];
    if (!monster || !Number.isFinite(monster.exp) || !Number.isFinite(monster.hp)) {
      throw new Error(`${stage.name}: dados ausentes de ${key}`);
    }
    return { name: monster.name, xp: Math.round(monster.exp * xpFactor(key)), hp: monster.hp };
  })
}));
const destination = path.join(__dirname, "../chrome/src/hunt-xp-catalog.js");
fs.writeFileSync(destination, `globalThis.BaiakJarvisHuntXpCatalog = ${JSON.stringify({
  source: "Catálogo público do jogo",
  capturedAt: new Date().toISOString().slice(0, 10),
  stages: available
})};\n`, "utf8");
console.log(`${available.length} hunts disponíveis escritas em ${destination}`);
