# 13: A cédula cobalto em todo o sistema

## Objetivo

Toda tela que o Tester vê ganha a estética da página inicial, a **cédula cobalto**: papel azul-cobalto com granulado e guilloché, tinta prata, ornamentos em ocre (cantoneiras, tiras de onda, carimbos), títulos em Libre Caslon Display e rótulos em Azeret Mono. Hoje essa estética mora só em `/`, dentro do escopo `.cedula`. As telas do Tester ainda estão na **Página de vistos** (faixa marinho, página verde-papel). Pedido do Daniel em 2026-10-26, depois do merge do PR #4.

O passo é só de apresentação. Lógica, server actions, rotas e o fluxo das telas não mudam. Texto também não muda: se alguma tela pedir texto novo, ele vai antes para o Daniel, seguindo `docs/regras-de-redacao.md`.

## Ler antes

- `DESIGN.md` inteiro, em especial "A capa da home" (o sistema da cédula) e as seções de componentes da Página de vistos que vão ser re-tingidas
- `src/app/globals.css`:
  - `:root` e o bloco escuro (linhas 1–90)
  - o bloco `.cedula` (~1388), que já re-tinge os tokens para o cobalto
  - `.capa-guilloche` e `.capa-cantoneira` (~1836)
- `src/app/capa.tsx` (onde estão `serifa`, `Guilloche` e `Cantoneira`), `src/app/marca.tsx` (a `Faixa`), `src/app/layout.tsx` (fonte mono e `themeColor`), `src/app/s/[token]/page.tsx` (a casca de toda tela do Tester)
- As telas em `src/app/s/[token]/_telas/`, `src/app/not-found.tsx` e `src/app/admin/painel.css`
- A documentação do Next 16.1.6 instalado sobre `next/font` e `viewport`, antes de mexer no layout

## Decisões (2026-10-26, com o Daniel)

1. **Os tokens da cédula sobem para o `:root`.** O sistema já é todo por custom properties. O `.cedula` prova que re-tingir os tokens basta para as peças do chat e do resultado imprimirem no cobalto sem mudar markup. Então os valores do `.cedula` viram os do `:root`. O `.cedula` fica só com o layout da home. Nada de um segundo escopo `.cedula` por tela.
2. **Cobalto nos dois temas.** A cédula é escura por natureza, e a home já é cobalto em claro e em escuro. O bloco `prefers-color-scheme: dark` some, e o `color-scheme` passa a `dark`. O `themeColor` do layout vira um só, `#1c3d8f`. A "cédula prata" para o tema claro (papel prata, tinta cobalto) foi recusada: ela dobra o trabalho de contraste e não existe na home.
3. **Ornamento por peso da tela.** O ornamento fica nas telas de cerimônia, não nas de trabalho:
   - **Telas de cerimônia** (consentimento, resultado, fim, apagado, 404): cantoneiras, título em Caslon e moldura ocre dupla.
   - **Telas de trabalho** (chat, import, envio, espera): só o papel, a faixa e os carimbos.
   - **O chat** é uma leitura de 20 a 40 minutos. A coluna de leitura fica no cobalto mais fundo (`--cobalto-fundo #15306f`, prata a 11:1), sem guilloché atrás do texto.
4. **O PDF continua branco.** O `.pdf` é a folha do currículo, não a interface. Ele fica branco e ganha a moldura ocre dupla da home (`.inicio-resultado`) em volta. O template LaTeX não muda.
5. **Painel admin no cobalto, só com os tokens.** O painel herda as cores da cédula pelo `:root`, sem ornamento: sem cantoneira, sem guilloché, sem Caslon e sem tira de onda. As tabelas continuam densas e legíveis, e o `painel.css` já é todo por tokens (conferido: nenhuma cor fixa). Como a Caslon vale para todo `h1` e `h2` (decisão 6), o `.painel` volta os títulos para a fonte do sistema.
6. **Uma fonte a mais no sistema todo.** A Libre Caslon Display sai de `capa.tsx` para `layout.tsx` (`--serifa`), porque agora todo `h1` e `h2` do Tester usa a Caslon. O texto corrido segue na fonte do sistema, e os rótulos e números na Azeret Mono.
7. **A faixa vira cobalto fundo com a tira de onda.** A `Faixa` continua sticky, com o wordmark em Caslon (como na placa da capa) e "por Daniel Bernardino" em mono. Embaixo dela vai a tira `.onda` em ocre, no lugar da borda preta. `Onda`, `Guilloche`, `Cantoneira` e `Balao` saem de `page.tsx` e `capa.tsx` para um módulo de ornamentos compartilhado (`src/app/ornamentos.tsx`).

## Contraste medido (2026-10-26)

| Tinta | `#1c3d8f` cobalto | `#15306f` cobalto fundo | Campo (`#2a4996`) |
|---|---|---|---|
| Prata `#eef2fa` (texto) | 8.9 | 11.1 | 7.5 |
| Suave `#c4cde3` | 6.2 | 7.8 | 5.3 |
| Afirmado `#8fe0bf` | 6.4 | 8.1 | 5.5 |
| Estimado `#cdbcff` | 5.8 | 7.3 | 4.9 |
| Ocre `#d8b24c` | 4.9 | 6.2 | **4.2**: só texto grande ou ornamento |
| Foco `#ffd76a` | 7.2 | 9.0 | 6.1 |
| Perigo, proposto `#ffb4a8` | 5.8 | 7.3 | 5.0 |
| Linha forte (prata a 55%) | 3.8 | 4.8 | 3.3 (borda de campo ≥ 3:1) |

Cobalto sobre ocre (botão do selo, barra) dá 4.9, e cobalto sobre prata (botão primário) dá 8.9. O `--perigo` e o `--perigo-fundo` ainda não existem no cobalto e entram com o valor acima.

## Fazer

Branch `design/cedula` a partir da `main`, com um commit por etapa. Em cada etapa: captura a 360px e a 1280px de cada tela tocada, sem rolagem lateral, com `prefers-reduced-motion` respeitado. Para chegar às telas use as sessões de simulação do banco de dev, que são pessoas inventadas. Ver "Como chegar em cada tela".

1. **Base.**
   - Tokens da cédula no `:root` (decisão 1), cobalto nos dois temas (decisão 2), o perigo novo, o papel (granulado + gradiente) no `body` e o `themeColor` único.
   - A Caslon no layout (decisão 6) e os ornamentos num módulo só (decisão 7).
   - A `Faixa` nova com a onda.
   - `h1` e `h2` em Caslon.
   - O `.cedula` da home reduzido ao que é só da home, com a home pixel a pixel igual: compare a captura antes e depois.
2. **Chat.**
   - A coluna de leitura no cobalto fundo.
   - A pergunta atual em prata grande, as anteriores em suave, as respostas como linha de campo.
   - Os vistos de cobertura como carimbos ocre/prata.
   - O compositor e a folha de confirmação: o fundo deles vem do `--folha`, e a sombra é re-medida no azul.
   - Com o teclado aberto num celular baixo, os vistos continuam se recolhendo.
3. **Consentimento e re-aceite.** A página de dados vira um painel da cédula: moldura ocre dupla, cantoneiras, título em Caslon, garantias como carimbo ocre (o mesmo das `.garantias` da home).
4. **Import e envio do currículo.** Os campos no `--campo-fundo` com a borda `--linha-forte`, o botão primário em prata com tinta cobalto, e o erro no perigo novo.
5. **Espera, resultado e fim.**
   - A espera ganha o selo girando: o aro de `.selo-aro`, sem texto novo.
   - O resultado põe o PDF branco na moldura ocre dupla, e o antes × depois fica como na home (Antes → Depois, seta ocre, números na tinta da origem).
   - O fim usa as cantoneiras.
6. **Apagar, apagado e 404.** O painel de perigo fica no perigo novo. O carimbo de cancelado passa a ser desenhado em perigo sobre o cobalto. O 404 ganha a placa reduzida, só a moldura e o wordmark, com o texto de hoje.
7. **Painel admin**, conforme a decisão 5: só as cores, sem ornamento. As tabelas de custo, o funil e a transcrição são conferidos em captura.
8. **Polish e documentação.**
   - Uma passada de foco, hover e estados vazios em todas as telas.
   - `DESIGN.md` reescrito: a Página de vistos sai e a cédula vira o sistema, com as seções de componentes re-medidas.
   - `PRODUCT.md`, se citar a estética antiga.

## Como chegar em cada tela

- **Infraestrutura:** `docker compose up -d db`, depois `LLM_BACKEND=assinatura npm run dev`.
- **Consentimento, import, chat:** um token novo com `npm run token:new -- "teste-cedula" --origem dev`. Cada passo do fluxo mostra a tela seguinte.
- **Resultado e fim:** a última sessão de `npm run simular` / `npm run gerar` (persona inventada).
- **Sem gasto:** `simular` e `gerar` vão pela assinatura e não gastam API. Sem a assinatura, eles gastam: pergunte ao Daniel antes, com o custo estimado.
- **Admin:** suba o dev com um `ADMIN_TOKEN` descartável e ponha o cookie no Playwright. Use o HMAC de `src/admin/acesso.ts`, sem digitar token em formulário.

## Fora deste passo

- O template do currículo (LaTeX) e o PDF.
- Qualquer texto novo, inclusive os pendentes ("Você" no chat, a legenda das linhas de origem, o texto do 404): só com o sim do Daniel.
- Animação nova além do aro do selo na espera.
- Uma "cédula prata" para o tema claro (decisão 2), a menos que o Daniel peça.

## Pronto quando

- [x] Nenhuma tela do Tester mostra o verde-papel nem o marinho da Página de vistos, em claro e em escuro.
- [x] A home fica igual à de antes do passo, comparando as capturas.
- [x] Todo par de texto e fundo da tabela de contraste passa AA, medido de novo nos valores finais. Toda borda de campo passa 3:1.
- [x] Toda tela a 360px, sem rolagem lateral: consentimento, re-aceite, import, envio, chat (com e sem teclado), espera, resultado, fim, apagar, apagado e 404.
- [x] O admin está no cobalto, sem ornamento, e as tabelas continuam legíveis (AA nas células e nos cabeçalhos).
- [x] Com `prefers-reduced-motion`, nada gira nem pulsa.
- [x] `git diff main --stat` não mostra arquivo de lógica (`acoes.ts`, `route.ts`, `src/db`, `src/sessao`, etc.), e as mudanças em `.tsx` são só marcação de apresentação.
- [x] `npm run typecheck` e `npm test` passam.
- [x] `DESIGN.md` descreve a cédula como o sistema.

## Notas de implementação

**Etapa 1, base (2026-10-26):**

- **Tokens:** os da cédula estão no `:root`, e o bloco `prefers-color-scheme: dark` saiu. O `color-scheme` e o `viewport.colorScheme` são `dark`, e o `themeColor` é um só, `#1c3d8f` (no layout; o da home saiu).
- **Tokens novos e trocados:**
  - `--cobalto`, `--cobalto-fundo`, `--prata`, `--prata-suave` e `--fonte-titulo` (Caslon, com Georgia de reserva).
  - O perigo agora é `#ffb4a8`, com fundo translúcido.
  - O `--t-titulo` subiu para 2rem, porque a Caslon lê pequena.
- **O papel** (granulado + gradiente) está no `body`, com `min-height: 100vh`. O `html` leva o cobalto fundo, para o overscroll. O bloco de tokens do `.cedula`, o `body:has(.cedula)` e o `.cedula ::selection` saíram: o `.cedula` guarda só o layout da home.
- **A Caslon** carrega no `layout.tsx`. `h1` e `h2` usam `--fonte-titulo` com peso 400. O `.painel` volta `h1` e `h2` para a fonte do sistema, em 700.
- **Ornamentos** em `src/app/ornamentos.tsx`: `Guilloche` (recebe a classe), `Cantoneira` e `Cantoneiras`, `Onda` e `Balao`. A classe `.capa-cantoneira` virou `.cantoneira`, genérica: vale dentro de qualquer pai posicionado. O CSS dos ornamentos está numa seção própria, logo depois da faixa.
- **A faixa:** o wordmark em Caslon, sem o hífen ocre, e a `Onda` embaixo, no lugar da borda preta.
- **A home ficou idêntica** pixel a pixel: PSNR infinito a 360 em claro e escuro e a 1280. Capturas em `scratchpad/antes13` e `depois13`, pelo `scratchpad/telas.cjs`, com uma sessão inventada por estado, tirada do banco de dev.
- **O aviso "este navegador não mostra o PDF"** tinha cor fixa escura sobre um fundo que segue o tema, e já estava ilegível no escuro. Agora usa `--texto` e `--acento`. Só aparece num desktop sem visualizador de PDF.

**Etapa 2, chat (2026-10-26):**

- **Bug da etapa 1, corrigido aqui:** o `--folha` do cobalto é translúcido (`rgb(8 22 66 / 0.32)`), e as superfícies fixas do chat (a `.progresso`, o compositor `.resposta` e a folha `.confirmar-fim`) deixavam o histórico aparecer por baixo. Elas agora são opacas: a `.progresso` no `--cobalto-fundo`, e o compositor e a folha no `--cobalto`, como uma folha levantada, com sombra para cima. **Regra para as próximas etapas:** nada fixo ou sticky usa o `--folha`.
- **O fundo:** a página do chat (`body:has(.chat)`) é o cobalto fundo `#15306f`, só com o granulado, sem o gradiente.
- **A pergunta atual** fica sob uma régua ocre de 2px, e as cores do texto não mudaram.
- **Os vistos carimbados** saíram do verde "afirmado", que é a tinta da origem de uma Metric e não de cobertura, e ficaram em ocre, com fundo ocre a 12%.
- **Capturas** pelo `scratchpad/chat13.cjs` (360, 360×480 com o teclado aberto, 1280, e a folha do "Terminei"). Para ter histórico, a sessão de simulação `acc34999…` (sabe-os-numeros) ficou em `interrogando` com o consentimento `v2` só durante as capturas. Ela voltou para `gerando`/`v1`.

**Etapa 3, consentimento e re-aceite (2026-10-26):**

- **A `.abertura`** virou uma placa com a moldura ocre dupla (borda de 1px + `outline` a 40% com offset de 3px, a mesma da `.inicio-resultado` da home), o fundo `--folha` e as `Cantoneiras`. O `consentimento.tsx` ganhou só o `<Cantoneiras />`. As cantoneiras aqui são menores (1.75rem, a 4px do canto), para não encostarem no texto a 360px.
- **A `.pagina-de-dados`** ganhou a mesma moldura dupla, no lugar da régua prata no topo, e os `dt` em ocre (6:1 sobre o painel).
- **As `.garantias`** são carimbos ocre em todo o sistema, e o `.cedula .garantias li` da home saiu. A `.mudou` trocou o violeta pelo ocre tracejado: o violeta fica só para número estimado.
- **A home não ficou pixel a pixel igual depois da etapa 2,** e foi de propósito. A pergunta inventada da home usa as peças do chat, então a régua da pergunta atual também virou ocre lá (duas linhas de pixel a 360). O resto da home segue idêntico.

**Etapa 4, import e envio (2026-10-26):**

- **Já funcionavam no cobalto** só com os tokens da etapa 1: os campos, o slot tracejado do PDF, o erro no perigo novo e o formulário do cabeçalho. As capturas a 360 e 1280 estão em `scratchpad/envio13.cjs`. O erro foi conferido injetando um `.erro` no DOM, sem enviar nada.
- **Mudou:**
  - O `.encontrado`, o rascunho do import, trocou a régua prata de 3px pela ocre de 2px, a mesma da pergunta atual.
  - O hover do botão primário clareia para branco. Antes ele misturava prata com prata e não mudava nada.
- **O token de teste:** `teste-cedula-envio` (origem `dev`), criado para a tela de upload, com o consentimento aceito no localhost. Está em `scratchpad/tok-envio.txt`.

**Etapa 5, espera, resultado e fim (2026-10-26):**

- **A moldura virou a classe `.placa`:** borda ocre, `outline` ocre a 40% com offset de 3px, o fundo `--folha` e as cantoneiras pequenas. Vale para o painel cerimonial de uma tela. A `.abertura` do consentimento e o bloco do preço de fundador (`fim-da-sessao.tsx`, que ganhou o `<Cantoneiras />`) usam a `.placa`. Atenção: o `.fim .bloco` é mais específico que a `.placa`, por isso o `.fim .bloco.placa` repõe o padding e a borda.
- **O PDF** continua branco, agora na moldura ocre dupla, com a sombra em azul fundo. O Chromium headless não tem visualizador de PDF, então a captura mostra o aviso no lugar da folha.
- **A espera:** o círculo tracejado que gira virou ocre, com um miolo ocre, como um selo pequeno. Ela foi conferida injetando a `.etapa` no DOM.
- **O título do antes × depois** ganhou a régua ocre de 2px. O carimbo "Depois" e os números seguem na tinta da origem (verde afirmado, violeta estimado), como na home.
- **O `.recebido`,** o carimbo do que foi enviado no fim, trocou o verde pelo ocre: o verde fica só para número afirmado.

**Etapa 6, apagar, apagado e 404 (2026-10-26):**

- **O apagado e o 404** são uma `.placa` centrada (`main.apagado.placa`, `main.nao-encontrada.placa`, com `<Cantoneiras />`). Os textos são os de hoje. Desvio do plano: o 404 não ganhou a placa em cruz da capa, só a mesma placa das outras telas de cerimônia. O wordmark já está na faixa logo acima.
- **O carimbo de cancelado e a confirmação de apagar** já estavam no perigo novo (`#ffb4a8`) só com os tokens. O botão "Sim, apagar tudo" tem cobalto sobre o perigo, a 5.8:1.
- **Para chegar ao apagado,** o token de teste `teste-cedula-apagar` (origem `dev`) foi apagado de verdade pelo fluxo da tela, no localhost: `scratchpad/apagar13.cjs`.

**Etapa 7, painel admin (2026-10-26):**

- **As cores já vinham da etapa 1.** O painel herda os tokens, com títulos na fonte do sistema e sem ornamento. As capturas do índice e de uma sessão de simulação, a 360 e 1280, estão em `scratchpad/admin7.cjs`, com um `ADMIN_TOKEN` descartável e o cookie por HMAC.
- **A rolagem lateral a 360** (do achado abaixo) vinha do formulário de novo tester. O `.envio` é um grid, e o `<select>` media pela sua opção mais longa, alargando a coluna para 377px. Corrigido em `painel.css`: `.painel-form` com `grid-template-columns: minmax(0, 1fr)` e o `select` com `width: 100%`. As tabelas largas continuam rolando dentro da `.tabela`, de propósito.

**Etapa 8, polish e documentação (2026-10-26):**

- **Foco:** passada pelo teclado (`scratchpad/foco13.cjs`) na caixa e no "Começar" do consentimento, nas opções e no "Enviar" do fim e no selo da home. O amarelo `--foco` sumia no ocre do selo, então `.selo-botao` e `.barra-convite-botao` levam um anel prata (o do selo a 12px, fora do halo). A barra fica inalcançável pelo Tab, e isso é de propósito: ela vem depois do selo no DOM, e quando o foco chega ao selo ela já está `inert`. O selo dá a mesma ação.
- **A faixa** mede `--faixa-altura` mais a onda de 1rem. O token novo `--faixa-total` é o `top` da `.progresso` e o `scroll-margin-top` do `.fim`. Antes a régua de cobertura entrava 1rem por baixo da faixa e cortava o acento do rótulo.
- **Reduced motion** desliga também o giro e a escala do selo no hover.
- **No painel,** o `.marcador.origem-estimado` usava prata e agora usa o `--estimado`.
- **Documentação:** `DESIGN.md`, `.impeccable/design.json` e `.impeccable/surfaces/src-app-s-token-page-tsx.md` foram reescritos a partir do código pelo agente documentador do Impeccable. A Página de vistos fica só como histórico.
- **Varredura final** (`scratchpad/telas.cjs` → `final13`):
  - Nenhuma tela rola de lado a 360 ou 1280, o admin incluído.
  - Todas as telas do Tester e o 404 saem idênticas em claro e escuro (PSNR infinito).
  - A home só difere de antes do passo pela régua ocre da pergunta inventada.

## Achados

- O índice do painel (`/admin`) já rolava de lado a 360px (393px) antes deste passo. Resolvido na etapa 7.
- **Ficaram de fora, do relatório do documentador:**
  - A seta `→` dos pares da home é glifo de texto, não SVG.
  - O `.cartao`, o `.destaque` e o `select` do painel usam raio de 10px, fora dos tokens.
  - O CSS da home usa `var(--serifa)` direto, sem o fallback do `--fonte-titulo`.
  - O `.encontrado h2` fica em Caslon a 1.0625rem, pequeno para a face.
