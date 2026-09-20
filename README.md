# Baiak Jarvis AUTO

Extensão local para acompanhar a party do Baiak Idle, analisar a hunt selecionada e controlar o ciclo configurado de stamina.

## Versão 0.7.1

- troca para **Treino online** ao chegar em `6:43` de stamina, aproximadamente 16%;
- troca para **Cobras** ao chegar em `22:43`, aproximadamente 54%;
- recarrega a aba quando uma desconexão permanece por 30 segundos;
- recarrega o jogo quando a página para de responder por mais de três minutos;
- impede novas recargas durante cinco minutos para evitar ciclos;
- exibe HP, mana, skill, ataque, defesa e bônus elementais da party;
- consulta o Guia Baiak Idle para apresentar monstros, XP, HP, dano e armadura da hunt.
- detecta automaticamente qualquer personagem `Knight` da party, sem depender do nome;
- prioriza o personagem com papel `TANK` quando houver mais de um Knight;
- não inclui nomes, níveis ou atributos fixos de nenhuma conta.
- lê vida, mana e progresso diretamente dos cartões da Party, mesmo fechados;
- percorre automaticamente os personagens do painel Skills;
- mostra skill principal, bônus totais e bônus de cada equipamento por personagem.
- mantém abertas as seções de bônus e equipamentos durante as atualizações;
- interpreta corretamente percentuais elementais com casas decimais.
- lê automaticamente os nomes das hunts disponíveis no próprio jogo;
- permite escolher a hunt de retorno em um campo de seleção no painel e no popup;
- conclui a saída do treino pelo fluxo `Hunts → buscar fase → abrir card → Caçar`;
- transforma **Atualizar agora** em uma atualização completa de Party, Skills, equipamentos, hunts e análise;
- mantém **Análise da Hunt** recolhida inicialmente;
- apresenta recomendações separadas para matar mais rápido e sobreviver.
- reorganiza o painel principal em duas colunas, reduzindo a altura ocupada;
- adiciona navegação por abas entre **Painel** e **Otimizador**;
- incorpora o Baiak Idle Build Optimizer diretamente no Jarvis;
- carrega o otimizador somente quando a aba é aberta e mantém um link para abri-lo separadamente.
- remove o sandbox redundante do iframe para eliminar o aviso de segurança do Chrome.
- adiciona a aba **Hunts** com medição automática da wave 1 até a queda do boss;
- registra tempo, XP, abates, loot, suprimentos e saldo de cada wave completa;
- guarda localmente as 200 waves mais recentes e exibe as últimas 20 no painel;
- compara as hunts pela média de tempo, XP por wave e XP por hora;
- destaca automaticamente a hunt com o melhor rendimento medido.
- encerra silenciosamente o monitor antigo quando a extensão é recarregada, evitando o erro `Extension context invalidated`.

As automações podem ser desligadas separadamente no popup da extensão.

## Chrome

1. Baixe e extraia `baiak-jarvis-chrome-v0.7.1.zip` na página de Releases.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Escolha a pasta extraída que contém `manifest.json`.
6. Recarregue `https://baiakidle.com/jogar/`.

O código instalável diretamente também está na pasta [`chrome`](./chrome).

## Firefox

1. Baixe e extraia `baiak-jarvis-firefox-v0.7.1.zip` na página de Releases.
2. Abra `about:debugging#/runtime/this-firefox`.
3. Clique em **Carregar extensão temporária**.
4. Selecione o `manifest.json` da pasta extraída.
5. Recarregue `https://baiakidle.com/jogar/`.

O código instalável diretamente também está na pasta [`firefox`](./firefox). Extensões temporárias são removidas quando o Firefox é encerrado.

## Privacidade

Os dados da sessão ficam no armazenamento local da extensão. A análise consulta páginas públicas de fases em `guiabaiakidle.com`; a aba Otimizador incorpora `baiakidle-build-optimizer.pages.dev` quando aberta.

## Desenvolvimento

O núcleo não depende de bibliotecas externas. Para executar os testes:

```powershell
node .\tests\core.test.js
```

O rodapé do painel deve mostrar `Jarvis 0.7.1 AUTO · execução local`.
