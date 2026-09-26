// Uso: node scripts/build_codex_catalog.js caminho/para/assets/index-*.js
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

if (!process.argv[2]) throw new Error("Informe o caminho do bundle do cliente do jogo.");
const bundle = fs.readFileSync(process.argv[2], "utf8");
const stagesStart = bundle.indexOf("Ca=[{id:");
const stagesEnd = bundle.indexOf("],Zee=", stagesStart);
const requirementsStart = bundle.indexOf("Wae={", stagesEnd);
const requirementsEnd = bundle.indexOf("},O9e=", requirementsStart);
if ([stagesStart, stagesEnd, requirementsStart, requirementsEnd].some((offset) => offset < 0)) {
  throw new Error("O catálogo do jogo mudou de formato.");
}
const stages = vm.runInNewContext(bundle.slice(stagesStart + 3, stagesEnd + 1));
const requirements = vm.runInNewContext(`(${bundle.slice(requirementsStart + 4, requirementsEnd + 1)})`);
const hunts = stages.filter((stage) => requirements[stage.id]?.length).map((stage) => ({
  id: stage.id,
  name: stage.name,
  req: requirements[stage.id].map(({ item, qty }) => ({ item, qty }))
}));
const output = `// Catálogo de missões Hunt extraído do cliente oficial do jogo em ${new Date().toLocaleDateString("pt-BR")}.\n` +
  `globalThis.BaiakJarvisCodexCatalog = ${JSON.stringify(hunts)};\n`;
for (const browser of ["chrome", "firefox"]) {
  fs.writeFileSync(path.join(__dirname, "..", browser, "src", "codex-catalog.js"), output);
}
console.log(`${hunts.length} hunts com missões Codex`);
