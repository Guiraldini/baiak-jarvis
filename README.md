# Baiak Jarvis AUTO

Extensão local para acompanhar a party do Baiak Idle, analisar a hunt selecionada e controlar o ciclo configurado de stamina.

## Versão 0.4.1

- troca para **Treino online** ao chegar em `6:43` de stamina, aproximadamente 16%;
- troca para **Cobras** ao chegar em `22:43`, aproximadamente 54%;
- recarrega a aba quando uma desconexão permanece por 30 segundos;
- recarrega o jogo quando a página para de responder por mais de três minutos;
- impede novas recargas durante cinco minutos para evitar ciclos;
- exibe HP, mana, skill, ataque, defesa e bônus elementais da party;
- consulta o Guia Baiak Idle para apresentar monstros, XP, HP, dano e armadura da hunt.

As automações podem ser desligadas separadamente no popup da extensão.

## Chrome

1. Baixe e extraia `baiak-jarvis-chrome-v0.4.1.zip` na página de Releases.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Escolha a pasta extraída que contém `manifest.json`.
6. Recarregue `https://baiakidle.com/jogar/`.

O código instalável diretamente também está na pasta [`chrome`](./chrome).

## Firefox

1. Baixe e extraia `baiak-jarvis-firefox-v0.4.1.zip` na página de Releases.
2. Abra `about:debugging#/runtime/this-firefox`.
3. Clique em **Carregar extensão temporária**.
4. Selecione o `manifest.json` da pasta extraída.
5. Recarregue `https://baiakidle.com/jogar/`.

O código instalável diretamente também está na pasta [`firefox`](./firefox). Extensões temporárias são removidas quando o Firefox é encerrado.

## Privacidade

Os dados da sessão ficam no armazenamento local da extensão. A consulta externa é limitada às páginas públicas de fases em `guiabaiakidle.com`.

## Desenvolvimento

O núcleo não depende de bibliotecas externas. Para executar os testes:

```powershell
node .\tests\core.test.js
```

O rodapé do painel deve mostrar `Jarvis 0.4.1 AUTO · execução local`.
