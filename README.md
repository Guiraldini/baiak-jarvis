# Baiak Jarvis AUTO

Extensão local para acompanhar a party do Baiak Idle, analisar a hunt selecionada e controlar o ciclo configurado de stamina.

## Versão 0.8.11

- adiciona a aba **Sets**, com recomendações por personagem a partir de nível, vocação e prioridade escolhida;
- compara os candidatos com os itens que o Jarvis consegue ler no painel Skills e mostra alternativas por slot;
- considera armas de uma ou duas mãos: Druid nível 230 pode combinar Deepling Fork e Lion Spellbook;
- usa um catálogo local extraído dos itens públicos do cliente do jogo, com 1.694 peças equipáveis e munições;
- remove a legenda “stamina · party · builds” do cabeçalho.

As recomendações usam atributos base; disponibilidade, imbuements e DPS real devem ser conferidos no jogo. O catálogo pode ser atualizado com `python scripts/build_equipment_catalog.py`.

## Versão 0.8.10

- evita classificar uma hunt ativa como modo Chefes por causa de textos genéricos da interface;
- continua registrando XP, tempo, loot e lucro das waves em todas as hunts detectadas;
- guarda os totais das waves antigas por hunt, preservando o comparativo depois que a lista das 200 waves recentes gira.

## Versão 0.8.9

- reconhece fases presentes apenas na tabela do catálogo, como Livraria EARTH, ENERGY e FIRE;
- mostra nível mínimo, monstros e drops dessas fases sem inventar HP, XP, dano ou afinidades elementais;
- renova automaticamente o índice antigo salvo ao instalar a atualização e ao usar “Atualizar agora”.

## Versão 0.8.8

- troca o card “XP registrado” por “XP de hoje”, com zeramento à meia-noite no horário de Brasília;
- guarda o total diário separadamente do histórico limitado às 200 waves mais recentes;
- mantém histórico, médias e comparações entre hunts após a virada do dia;
- migra os registros disponíveis do dia ao atualizar e sinaliza quando o primeiro total pode estar parcial.

- associa os equipamentos e bônus lidos no painel Skills ao nome real do personagem, que o jogo guarda no título do botão;
- usa o nome correspondente da Party como alternativa quando o título não estiver disponível;
- corrige instalações novas em que o card da Party mostrava os personagens sem os equipamentos detectados.

- adiciona um botão Ligar/Desligar diretamente ao card de automação no jogo;
- o botão pausa ou retoma as trocas automáticas entre Treino online e a hunt escolhida;
- sincroniza a escolha com o popup e mantém o estado salvo entre sessões.

- lê automaticamente o bônus de stamina máxima das montarias no painel Skills;
- usa o teto real de stamina no contador, nas marcas da barra e na troca automática entre caça e treino;
- com +15min de montaria, ajusta os pontos de 6h43/22h43 para 6h46/22h46, mantendo 2h de treino VIP e 16h de caça.

- corrige o registro de Cobras e outras hunts quando o loop volta da última wave para a primeira sem zerar o cronômetro imediatamente;
- preserva a XP inicial da nova volta quando o cronômetro zera alguns segundos depois;
- volta a registrar tempo, XP, loot e lucro das waves seguintes sem exigir reiniciar a hunt.

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
- detecta o modo **Chefes** mesmo quando o jogo mantém o nome da hunt anterior;
- ignora completamente tempo, XP e loot ganhos em salas de boss;
- permite excluir individualmente uma medição incorreta no histórico de waves.
- consolida execuções repetidas da mesma hunt em um único comparativo;
- recalcula automaticamente a média de XP/h a cada nova wave concluída;
- compara a média de cada hunt com as outras e mostra a vantagem ou desvantagem percentual de XP/h;
- registra loot bruto e lucro líquido de cada wave, além das médias por hunt;
- mostra a diferença absoluta de XP/h e de gold por wave entre as hunts;
- compara cada hunt com todas as outras hunts registradas, sem limitar a duas opções.
- deixa os cards de hunt compactos e selecionáveis;
- expande apenas o card clicado para mostrar comparações, loot e lucro;
- permite fechar o card com um segundo clique e usar Enter ou Espaço pelo teclado.

As automações podem ser desligadas separadamente no popup da extensão.

## Chrome

1. Baixe e extraia `baiak-jarvis-chrome-v0.8.11.zip` na página de Releases.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Escolha a pasta extraída que contém `manifest.json`.
6. Recarregue `https://baiakidle.com/jogar/`.

O código instalável diretamente também está na pasta [`chrome`](./chrome).

## Firefox

1. Baixe e extraia `baiak-jarvis-firefox-v0.8.11.zip` na página de Releases.
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

O rodapé do painel deve mostrar `Jarvis 0.8.11 AUTO · execução local`.
