---
name: sem-sotaque
description: A cédula cobalto. Cada feito entra no currículo carimbado, com a origem do número à vista, num papel de dinheiro azul com tinta prata e ornamentos em ocre.
colors:
  cobalto: "#1c3d8f"
  cobalto-fundo: "#15306f"
  prata: "#eef2fa"
  prata-suave: "rgb(238 242 250 / 0.78)"
  fundo: "#1c3d8f"
  folha: "rgb(8 22 66 / 0.32)"
  campo-fundo: "rgb(255 255 255 / 0.06)"
  texto: "#eef2fa"
  suave: "#c4cde3"
  linha: "rgb(238 242 250 / 0.24)"
  linha-forte: "rgb(238 242 250 / 0.55)"
  capa: "#15306f"
  capa-texto: "#eef2fa"
  capa-suave: "#c4cde3"
  ocre: "#d8b24c"
  acento: "#eef2fa"
  acento-texto: "#1c3d8f"
  foco: "#ffd76a"
  afirmado: "#8fe0bf"
  afirmado-fundo: "rgb(143 224 191 / 0.1)"
  estimado: "#cdbcff"
  estimado-fundo: "rgb(205 188 255 / 0.1)"
  perigo: "#ffb4a8"
  perigo-fundo: "rgb(255 180 168 / 0.1)"
typography:
  titulo:
    fontFamily: "Libre Caslon Display, Georgia, 'Times New Roman', serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  secao:
    fontFamily: "Libre Caslon Display, Georgia, 'Times New Roman', serif"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1.2
  marca:
    fontFamily: "Libre Caslon Display, Georgia, 'Times New Roman', serif"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1
  pergunta:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  corpo:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  pequeno:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  rotulo:
    fontFamily: "Azeret Mono, ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.12em"
rounded:
  raio-carimbo: "3px"
  raio: "6px"
spacing:
  e-1: "0.25rem"
  e-2: "0.5rem"
  e-3: "0.75rem"
  e-4: "1rem"
  e-5: "1.5rem"
  e-6: "2rem"
  e-7: "3rem"
components:
  faixa:
    backgroundColor: "{colors.capa}"
    textColor: "{colors.capa-texto}"
    typography: "{typography.marca}"
    height: "3rem"
  placa:
    backgroundColor: "{colors.folha}"
    textColor: "{colors.texto}"
    rounded: "0"
    padding: "2rem 1.5rem"
  botao-primario:
    backgroundColor: "{colors.acento}"
    textColor: "{colors.acento-texto}"
    rounded: "{rounded.raio}"
    padding: "0.75rem 1.5rem"
    height: "48px"
  botao-primario-hover:
    backgroundColor: "#ffffff"
    textColor: "{colors.acento-texto}"
  botao:
    backgroundColor: "transparent"
    textColor: "{colors.texto}"
    rounded: "{rounded.raio}"
    padding: "0.75rem 1.5rem"
    height: "48px"
  botao-perigo:
    backgroundColor: "{colors.perigo}"
    textColor: "{colors.fundo}"
    rounded: "{rounded.raio}"
    padding: "0.75rem 1.5rem"
    height: "48px"
  campo:
    backgroundColor: "{colors.campo-fundo}"
    textColor: "{colors.texto}"
    rounded: "{rounded.raio}"
    padding: "0.75rem"
    height: "48px"
  rotulo:
    textColor: "{colors.suave}"
    typography: "{typography.rotulo}"
  pagina-de-dados:
    backgroundColor: "{colors.folha}"
    textColor: "{colors.texto}"
    rounded: "0"
    padding: "1rem"
  garantia:
    textColor: "{colors.ocre}"
    typography: "{typography.rotulo}"
    rounded: "{rounded.raio-carimbo}"
    padding: "0.25rem 0.5rem"
  progresso:
    backgroundColor: "{colors.cobalto-fundo}"
    textColor: "{colors.suave}"
    padding: "0.75rem 1rem"
  visto-carimbado:
    backgroundColor: "rgb(216 178 76 / 0.12)"
    textColor: "{colors.ocre}"
    rounded: "{rounded.raio-carimbo}"
    height: "1.5rem"
  compositor:
    backgroundColor: "{colors.cobalto}"
    textColor: "{colors.texto}"
    padding: "0.75rem 1rem"
  carimbo-depois:
    textColor: "{colors.afirmado}"
    typography: "{typography.rotulo}"
    rounded: "{rounded.raio-carimbo}"
    padding: "0.1rem 0.5rem"
  selo-botao:
    backgroundColor: "{colors.ocre}"
    textColor: "{colors.cobalto}"
    rounded: "50%"
    width: "min(17rem, 78vw)"
---

# Design System: sem-sotaque

## Overview

**Creative North Star: "A cédula cobalto"**

A tela é uma cédula: papel azul-cobalto com granulado fino, tinta prata, e ornamentos em ocre (cantoneiras, tiras de onda, molduras duplas, carimbos), com os títulos em Libre Caslon Display, como a legenda de uma placa gravada. Os carimbos continuam dizendo de onde veio cada número: verde cheio é afirmado, violeta tracejado com `~` é estimado. Nasceu na home (aprovada em 2026-10-24) e virou o sistema de toda tela no passo 13 (2026-10-26). Recusa o chat de balões de SaaS de IA e o "termos de uso" em texto corrido.

Mobile primeiro, a 360px, para quem abre o link pelo WhatsApp. É o mesmo cobalto nos dois temas: não há tema claro. O ornamento segue o peso da tela. As telas de cerimônia (consentimento, resultado, fim, apagado, 404) levam a placa, a moldura ocre dupla e as cantoneiras. As de trabalho (chat, import, formulário do cabeçalho, espera) levam só o papel, a faixa e os carimbos. Uma decisão por vez: a pergunta atual é dona da dobra, sob a régua ocre, e o que já passou recua para o suave menor. A leitura fica na face do próprio celular, a Caslon só nos títulos e o mono só nos campos.

O PDF é a exceção que confirma o papel: ele é o documento, não a interface, e continua branco, dentro da moldura ocre.

**Key Characteristics:**
- Papel cobalto com granulado em toda tela; o chat no cobalto fundo, só com o granulado.
- Faixa com o wordmark em Caslon sobre a tira de onda ocre, em toda tela do Tester.
- Ornamento por peso da tela: placa e cantoneiras na cerimônia, só papel e carimbos no trabalho.
- A cobertura como fileira de 10 vistos carimbados em ocre; a origem de um número dita pela tinta e pela forma da linha.
- Prata para a ação principal; ocre para o ornamento e a marca de cerimônia; verde e violeta só para a origem de um número.
- Tudo que fica preso na tela é opaco.

## Colors

Uma paleta de cédula: chão cobalto, tinta prata, ornamento ocre e duas tintas de carimbo com significado fixo. Os nomes abaixo são exatamente os de `src/app/globals.css`, todos no `:root`, com `color-scheme: dark` e nenhum bloco `prefers-color-scheme`. O `viewport.themeColor` é um só, o `--cobalto`, em `src/app/layout.tsx`.

### Primary
- **Cobalto** (`--cobalto`, que é o `--fundo`): o chão de toda tela, a tinta dos botões claros (`--acento-texto`) e o fundo das superfícies que sobem no chat (compositor e folha de confirmação).
- **Cobalto fundo** (`--cobalto-fundo`, que é o `--capa`): a faixa, a régua de cobertura, o chão do chat, o `html` (para o overscroll) e o fim do gradiente do papel.
- **Prata** (`--prata`, que é o `--texto`, o `--capa-texto` e o `--acento`): o texto de leitura e a ação principal. O botão primário, os links, o `a.botao`, o caret, a caixa e a opção marcadas, os três pontos do chat e o "Terminei". No hover, o botão primário clareia para branco.

### Secondary
- **Ocre** (`--ocre`): o ornamento e a marca de cerimônia. Cantoneiras, a tira de onda, a moldura dupla (borda de 1px em `--ocre` e `outline` em `rgb(216 178 76 / 0.4)` com offset de 3px), os `dt` da página de dados, os vistos carimbados (fundo ocre a 12%), as `.garantias`, o recibo `.recebido` e o aviso `.mudou` (fundo ocre a 10%), o anel da espera, e a régua de 2px da pergunta atual, do rascunho do import, do título "Antes e depois" e da folha de confirmação. Sobre o campo mede 4.2: ali só texto grande ou ornamento.

### Tertiary
- **Tinta afirmado** (`--afirmado`, fundo `--afirmado-fundo`): número que a pessoa afirmou, e o carimbo "Depois".
- **Tinta estimado** (`--estimado`, fundo `--estimado-fundo`): número estimado, sempre com `~` e sublinhado tracejado.
- **Perigo** (`--perigo`, fundo translúcido `--perigo-fundo`): apagar dados, erros, o carimbo de cancelado. O botão "Sim, apagar tudo" tem cobalto sobre o perigo.

### Neutral
- **Folha** (`--folha`, um azul escuro translúcido): placa, página de dados, rascunho do import, blocos do fim, espera, a linha "antes", o slot do PDF. É translúcida de propósito: o papel aparece por baixo.
- **Campo** (`--campo-fundo`, branco a 6%): interior de inputs, caixas, opções, a linha "depois" e os pendentes da oferta de parar.
- **Tinta suave** (`--suave`, que é o `--capa-suave`): rótulos, perguntas passadas, avisos, placeholder, footer, "por Daniel Bernardino".
- **Prata suave** (`--prata-suave`): só os rótulos laterais e o autor da capa da home.
- **Hairline** (`--linha`, prata a 24%): divisões internas, footer, bordas de folha.
- **Linha forte** (`--linha-forte`, prata a 55%): borda de input e botão, linha da resposta, slots vazios. É o piso de 3:1 da borda de controle sobre o campo; não clarear.
- **Foco** (`--foco`): o anel de foco, amarelo, 3px com offset de 2px (2px sem offset dentro de inputs).

### Contraste medido (2026-10-26)

| Tinta | Cobalto | Cobalto fundo | Campo (`#2a4996`) |
|---|---|---|---|
| Prata (texto) | 8.9 | 11.1 | 7.5 |
| Suave | 6.2 | 7.8 | 5.3 |
| Afirmado | 6.4 | 8.1 | 5.5 |
| Estimado | 5.8 | 7.3 | 4.9 |
| Ocre | 4.9 | 6.2 | **4.2**: só texto grande ou ornamento |
| Foco | 7.2 | 9.0 | 6.1 |
| Perigo | 5.8 | 7.3 | 5.0 |
| Linha forte | 3.8 | 4.8 | 3.3 (borda de campo ≥ 3:1) |

Botões: cobalto sobre ocre 4.9 (o selo e a barra da home), cobalto sobre prata 8.9 (primário), cobalto sobre perigo 5.8 (apagar).

### Named Rules
**The Ink Means Origin Rule.** Verde é afirmado e violeta é estimado, e só isso: a origem de um número e o carimbo "Depois". Nunca decoram, nunca marcam cobertura, recibo ou aviso. A forma carrega o mesmo sinal que a cor: linha cheia = afirmado, linha tracejada com `~` = estimado.

**The Ochre Ornament Rule.** Tudo o que é ornamento ou marca de cerimônia é ocre: cantoneira, onda, moldura, carimbo de cobertura, garantia, recibo, anel da espera, aviso do que mudou, régua de 2px. Se algo precisa de destaque sem ser número, é ocre, não verde nem violeta.

**The One Silver Action Rule.** A ação principal da tela é a única prata cheia. Uma segunda ação nunca é primária: "Não" no reconsentimento é `.secundario` (vazado), "Pular esta" é texto suave, "Continuar respondendo" é vazado.

## Typography

**Display Font:** Libre Caslon Display 400, via `next/font` em `src/app/layout.tsx` como `--serifa`, usada por `--fonte-titulo` (com Georgia de reserva)
**Body Font:** a fonte do sistema (`--fonte`: system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue)
**Label/Mono Font:** Azeret Mono 400/600 via `next/font` como `--mono-carregada`, dentro de `--fonte-mono` com reserva ui-monospace

**Character:** a Caslon é a legenda gravada da cédula, só em títulos; a leitura fica na face do celular; o mono é o tipo de máquina, só em rótulos de campo, números e carimbos.

### Hierarchy
- **Título** (Caslon 400, `--t-titulo` 2rem, 1.15, -0.005em, `text-wrap: balance`): o `h1` de cada tela. Subiu para 2rem porque a Caslon lê pequena.
- **Seção** (Caslon 400, 1.375rem, 1.2): o `h2` do fim e o "Antes e depois" (1.25 de entrelinha). O `h2` de cada empresa no rascunho do import cai para 1.0625rem.
- **Marca** (Caslon 400, 1.375rem, 1): o wordmark da faixa; "por Daniel Bernardino" em mono `--t-rotulo`, 0.02em, `--capa-suave`.
- **Pergunta** (`--t-pergunta`, 500, 1.4, -0.01em): só a pergunta atual do chat.
- **Abertura** (1.1875rem, 1.5): o parágrafo de quem pergunta, na placa do consentimento.
- **Corpo** (`--t-corpo`, 400, 1.55): leitura e respostas. Medida máxima `--medida` (38rem).
- **Pequeno** (`--t-pequeno`): perguntas passadas, a linha "antes", avisos, footer.
- **Subtítulos** (`h3`, fonte do sistema, negrito): 1.125rem no fim, 1rem no par antes × depois.
- **Rótulo** (`--t-rotulo` mono, 400, `--rastreio-rotulo`, caixa-alta, `--suave`): rótulo de campo, divisor "Continuando de onde paramos", o "ou". Números em `<strong>` dentro do rótulo vão a 600 com `tabular-nums`.

### Named Rules
**The Caslon Is The Plate Rule.** A Caslon fica nos títulos (`h1`, `h2`) e no wordmark, e na home também nos numerais romanos, no miolo do selo e na legenda da capa. Nunca em parágrafo, rótulo, botão, nem no painel admin, que volta os títulos para a fonte do sistema em 700.

**The Mono Is A Field Rule.** Azeret Mono só onde uma cédula ou um passaporte usaria tipo de máquina: rótulo de campo, número, carimbo, o autor da faixa. Nunca em parágrafo ou título.

## Layout

Coluna única de `--medida` (38rem) centralizada, padding `--e-5` `--e-4`. Espaço em passos de 4px (`--e-1` a `--e-7`): `--e-4` é o ritmo entre blocos, `--e-5` entre grupos, `--e-7` antes de uma seção nova. Alvos de toque em `--alvo` (48px); ações de texto em 44px. As molduras duplas têm 4px de margem lateral, para o `outline` caber na coluna.

O papel: o `body` leva o cobalto com o granulado (`feTurbulence` em SVG) e um gradiente que afunda para o `--cobalto-fundo` a partir de 40% da altura, com `min-height: 100vh`. A página do chat (`body:has(.chat)`) é o `--cobalto-fundo` só com o granulado, sem o gradiente: é uma leitura de 20 a 40 minutos, com a prata a 11:1.

Respostas a largura:
- **40rem:** a página de dados vira formulário: coluna de rótulo de 10rem e coluna de valor. Abaixo disso, o apagado e o 404 ganham `--e-4` de margem lateral.
- **48rem:** o par antes × depois fica lado a lado, com a divisória tracejada vertical.
- **`pointer: coarse`:** a prévia embutida do PDF some e entra "Abrir o PDF", que usa o visualizador do celular.

Celular e teclado:
- A faixa é sticky no topo: `--faixa-altura` (3rem) de wordmark, mais a tira de onda de 1rem. A régua de cobertura é sticky em `top: var(--faixa-total)` (a faixa mais a onda); o `scroll-margin-top` do fim usa o mesmo token.
- O compositor é sticky no pé, com `env(safe-area-inset-bottom)`; a folha "Terminei?" sobe por cima dele, também sticky.
- `interactiveWidget: 'resizes-content'`: no Android o layout encolhe com o teclado, e o compositor fica acima dele.
- **`max-height: 520px`** (teclado aberto em celular baixo): a faixa solta (static), a fileira de vistos some, a % fica com padding menor e a régua prende em `top: 0`.
- O `main` do chat não tem padding inferior, e a âncora vazia do fim do chat fica rente ao compositor, para o scroll até o fim pousar nela.

## Elevation & Depth

Plano por padrão. A profundidade vem do tom (cobalto → folha translúcida → campo), das hairlines, das molduras ocre e das réguas. A sombra é azul fundo, nunca preta, e só aparece onde algo está fisicamente acima do papel.

### Shadow Vocabulary
- **Compositor** (`box-shadow: 0 -10px 24px rgb(5 14 44 / 0.35)`): a folha do compositor, levantada sobre o histórico.
- **Folha que sobe** (`box-shadow: 0 -12px 32px rgb(5 14 44 / 0.5)`): a confirmação "Terminei?" sobre o compositor.
- **Papel** (`box-shadow: 0 16px 36px -12px rgb(5 14 44 / 0.6)`): o PDF branco sobre a cédula.
- **Selo** (`box-shadow: 0 0 0 6px rgb(216 178 76 / 0.25), 0 18px 40px rgb(5 14 44 / 0.55)`; no hover `0 0 0 10px rgb(216 178 76 / 0.3), 0 22px 48px rgb(5 14 44 / 0.6)`): o selo de convite da home, um objeto em relevo com o halo ocre.
- **Gravura** (`filter: drop-shadow(0 6px 14px rgb(5 15 45 / 0.45))`): a gravura da capa da home.

### Named Rules
**The Flat Page Rule.** Nenhuma sombra decorativa. Se nada sobe sobre o papel, não há sombra.

**The Opaque Pin Rule.** Nada sticky ou fixo usa o `--folha`, que é translúcido e deixa o histórico aparecer por baixo. A régua de cobertura é `--cobalto-fundo`; o compositor e a folha de confirmação são `--cobalto`; a barra de convite da home é `rgb(10 26 74 / 0.92)`.

## Shapes

Cantos pequenos: `--raio` (6px) para controles, blocos do fim, espera, par antes × depois, erro e aviso; `--raio-carimbo` (3px) para carimbos, slots, garantias e o recibo. **O que tem moldura ocre dupla é reto:** a placa, a página de dados, o PDF e a moldura da home não têm raio, como uma placa gravada. Uma folha que leva régua no topo (o rascunho do import, o painel de apagar) tem o topo reto e só os cantos de baixo arredondados (`0 0 --raio --raio`). Redondos só o selo da home (50%), o botão da barra de convite (pílula) e o anel da espera.

Bordas de 1px; carimbos e réguas em 2px; o topo do painel de apagar em 3px. Tracejado quer dizer "ainda não": slot de visto vazio, slot do rascunho do import, campo do PDF, número estimado, divisória antes/depois, o anel da espera girando e o aviso do que mudou.

## Components

### Faixa (cover band)
Sticky, `--capa`, `z-index: 4`. Dentro, numa linha de `--faixa-altura`: o wordmark "sem-sotaque" em Caslon à esquerda, sem hífen colorido, e "por Daniel Bernardino" em mono à direita. Embaixo, a `Onda` em ocre, de borda a borda, no lugar de uma borda. Não é navegação: nada nela é link. A home não leva a faixa: a capa é a capa.

### Ornamentos (`src/app/ornamentos.tsx`)
Todos SVG, `aria-hidden`.
- **`Guilloche`** (recebe a classe): a roseta de 28 elipses giradas e 6 círculos. Hoje só na capa da home, nunca atrás de texto de leitura.
- **`Cantoneira` / `Cantoneiras`**: o colchete duplo com duas volutas, traço `--ocre` de 2, 3rem, a `--e-3` do canto de qualquer pai posicionado, espelhado por `scale`. Dentro da `.placa` encolhe para 1.75rem, traço de 2.5, a `--e-1` do canto, para não encostar no texto a 360px.
- **`Onda`**: duas senoides defasadas, traço `--ocre` de 0.6 a 70% de opacidade, 1rem de altura. Separa a faixa do papel e as faixas da home.
- **`Balao`**: o balão de fala do convite pelo WhatsApp (não é o logo do app).

### Placa
`.placa`: o painel cerimonial de uma tela. Borda de 1px `--ocre`, `outline` ocre a 40% com offset de 3px, fundo `--folha`, padding `--e-6` `--e-5`, sem raio, com as `Cantoneiras` pequenas. Usada pela abertura do consentimento (`.abertura.placa`), pelo bloco do preço de fundador (`.fim .bloco.placa`, que repõe o padding e a borda porque o `.fim .bloco` é mais específico), pelo apagado (`main.apagado.placa`) e pelo 404 (`main.nao-encontrada.placa`). Uma por tela, no máximo.

### Rótulo de campo
`.rotulo`: mono `--t-rotulo`, caixa-alta, `--rastreio-rotulo`, `--suave`, bloco. Fica acima do valor que nomeia (dt da página de dados, "Antes", "Currículo N% coberto"). Rotula um valor; não é sobretítulo de seção.

### Página de dados
`.pagina-de-dados` (dl): `--folha` na mesma moldura ocre dupla da placa, sem cantoneiras; um campo por linha, separado por hairline, padding `--e-4`; os `dt` em ocre. O valor ganha inicial maiúscula.

### Garantias
`.garantias`: carimbos em linha, mono `--t-rotulo` caixa-alta a 0.06em, borda de 1px `--ocre`, texto `--ocre`, `--raio-carimbo`. Os três termos da abertura do consentimento, e o convite da home.

### Vistos (assinatura)
- **Régua de cobertura** (`.progresso`): sticky sob a faixa, opaca em `--cobalto-fundo`, hairline embaixo, rótulo com a % em mono 600 e, abaixo, 10 slots (`repeat(10, minmax(0, 2.75rem))`, 1.5rem de altura). Um slot por décimo coberto.
- **Slot vazio:** 1px tracejado `--linha-forte`.
- **Visto carimbado:** 2px cheio `--ocre`, fundo ocre a 12%, check em SVG por máscara, girado -3°, 2° ou -1° conforme a posição: nunca reto na página.
- **Carimbo DEPOIS:** o rótulo da linha nova vira carimbo: 2px `--afirmado`, 600, girado -2°.
- **Número com origem:** mono 600 a 0.92em, sublinhado de 2px. Afirmado: verde, linha cheia. Estimado: violeta, linha tracejada, com `~`.
- **Carimbo cancelado:** SVG de 96px em `--perigo`, anel duplo (o de dentro tracejado) cortado por uma barra, girado -8°, no apagado. Desenhado, sem palavras.
- **Recibo** (`.recebido`): o que foi enviado no fim, numa caixa de carimbo 2px `--ocre` com fundo ocre a 10% e texto prata.

### Chat
Tela de trabalho: papel cobalto fundo, faixa, vistos; sem placa nem cantoneira. Sem balões. A pergunta atual: `--t-pergunta`, 500, `--texto`, sob uma régua ocre de 2px. Perguntas passadas: `--t-pequeno`, `--suave`. Resposta: texto `--texto` sobre uma hairline `--linha-forte`, como campo preenchido. Divisor de retomada: rótulo mono entre duas hairlines; a cópia antiga da pergunta repetida some. Antes da primeira palavra: três pontos `--acento` pulsando. Oferta de parar: botão primário e, abaixo, os pendentes como botões de linha inteira em `--campo-fundo`.

### Compositor
Sticky no pé, opaco em `--cobalto`, hairline no topo e a sombra do compositor. Textarea que cresce (`field-sizing: content`, até 40vh), borda `--linha-forte`, caret `--acento`. Enviar: botão quadrado de 48px em prata com a seta em SVG; desabilitado fica vazado em `--suave`. Abaixo: "Pular esta" em texto `--suave` à esquerda, "Terminei" em `--acento` 600 à direita.

### Folha de confirmação
"Terminei?" (`.confirmar-fim`): sobe sobre o compositor, opaca em `--cobalto`, régua de 2px `--ocre` no topo, a sombra de folha que sobe, botões empilhados.

### Botões
- **Forma:** `--raio`, mínimo 48px, padding `--e-3` `--e-5`, transição de cor e borda em 0.15s ease-out.
- **Primário** (submit, `.primario`): `--acento` (prata) com `--acento-texto` (cobalto), 600; `.primario` em largura total. Hover (só `hover: hover`): fundo e borda brancos.
- **Padrão:** vazado, borda `--linha-forte`, texto `--texto`; hover leva a borda a `--texto`.
- **Link-botão** (`a.botao`): vazado com borda e texto `--acento`, 600.
- **Discreto:** sem borda, `--suave`, sublinhado, 44px.
- **Perigo:** `--perigo` com texto `--fundo`.
- **Pendente:** o `BotaoEnviar` desabilita e troca o rótulo; o submit mantém a tinta (opacidade 1, `cursor: progress`) e uma faixa de luz branca a 18% corre por cima. Outros desabilitados vão a 55%.
- **Consentimento não marcado:** "Começar" fica vazado e suave até a caixa ser marcada.
- **Foco:** `--foco` 3px com offset de 2px. Os dois botões ocre da home (o selo e o da barra de convite) levam um anel prata, porque o amarelo derreteria no ocre: offset de 12px no selo, para passar do halo, e de 3px na barra.

### Formulários
Tela de trabalho. Campo (`.campo`): rótulo 600 acima, input de 48px em `--campo-fundo`, borda `--linha-forte`; o foco troca a borda por `--foco` com contorno de 2px sem offset. Erro (`.erro`): borda `--perigo`, fundo `--perigo-fundo`, texto `--texto`. Caixa de seleção (`.caixa`): linha inteira clicável, a borda vira `--acento` quando marcada. Arquivo PDF: slot tracejado em `--folha` com o seletor como botão vazado prata. Separador "ou": rótulo mono entre hairlines. O rascunho do import (`.encontrado`) é uma folha com régua ocre de 2px no topo e um slot de carimbo tracejado vazio ao lado de cada linha.

### Aviso do que mudou
`.mudou`, no reconsentimento: 2px tracejado `--ocre`, fundo ocre a 10%, `--raio`.

### Espera
Tela de trabalho. `.etapa`: folha com hairline e `--raio`, a frase da etapa em 600 e um selo pequeno girando devagar: anel tracejado `--ocre` de 2.25rem com miolo ocre.

### Resultado
Tela de cerimônia. O PDF fica branco (é o documento), na moldura ocre dupla, sem raio, com a sombra de papel. Sem visualizador de PDF, o aviso aparece em `--texto` sobre `--folha`. No celular, o "Abrir o PDF" toma o lugar da prévia.

### Casa
A página que o link abre (passo 14), meio cerimônia, meio trabalho. A abertura é a placa da tela (`.casa-abertura.placa`, com as `Cantoneiras`): o título, uma frase e a Cobertura como rótulo com a % e a fileira de vistos (`Vistos`, o mesmo componente da régua do chat, aqui sem ser sticky). Abaixo, tela de trabalho: as ações (`.casa-acoes`, cada `.acao` com o botão e uma linha `--suave` `--t-pequeno` embaixo: o `.motivo` de "Achei uma vaga" fechada, o `.em-aberto` da conversa), e as seções (`.casa-secao`, hairline no topo, `h2` em Caslon). Uma ação prata por vez: enquanto "Achei uma vaga" está fechada, ela fica vazada (`.vazado`, prata em contorno) e o prata vai para "Começar pela sua carreira" ou "Continuar a conversa". "Contar algo novo" é discreto. "Gerar de novo" é vazado; com o Corpus mudado, vem dentro do aviso `.mudou`. Toda rota sob o token, fora a casa, abre com o link `.voltar` ("Voltar para a minha página").

### Antes × depois
Título "Antes e depois" com régua ocre de 2px no topo. Cada par é uma folha com hairline e `--raio`: "antes" em `--folha`, `--t-pequeno`, `--suave`, com o rótulo Antes; divisória tracejada; "depois" em `--campo-fundo`, `--texto`, com o carimbo DEPOIS e os números na tinta da origem. Linha sem antes leva "Novo" em itálico.

### Fim
`.fim` abre com hairline e `--e-7` acima; cada `.bloco` é uma folha com hairline, `--raio`, padding `--e-5` `--e-4`. O primeiro, o preço de fundador (a única oferta), é a placa da tela, com as cantoneiras. "Pagaria?" em três opções lado a lado, 48px, a marcada com borda e contorno `--acento`. Indicações separadas por hairline tracejada.

### Painel de perigo
`.confirmar-apagar`: borda `--perigo` com topo de 3px, cantos de baixo, fundo `--perigo-fundo`, sobe como a folha de confirmação; botão `.perigo` e o de voltar empilhados.

### Apagado e 404
Uma placa centrada: `max-width` da medida menos `--e-6`, margem `--e-6`, padding `--e-7` `--e-5`, texto centrado, sob a faixa. O apagado leva o carimbo de cancelado acima do título; o 404 leva só o título e uma linha suave.

### Movimento
- **Momento autoral do sistema:** o carimbo pousando (`carimbar`, 0.32s, `cubic-bezier(0.16, 1, 0.3, 1)`, de scale 1.35 e opacidade 0 para 1).
- **Folha subindo** (`subir`, 0.24s, mesma curva, 1.5rem): confirmação de fim e painel de apagar.
- **Pendente** (`trabalhando`, 1.4s linear): faixa de luz no submit.
- **Espera** (`girar`, 6s linear): o selo pequeno.
- **Escrevendo** (`escrevendo`, 1.1s ease-in-out): os três pontos.
- **Home:** `imprimir` (a gravura, 1.6s), `selo-gira` (a legenda do aro, 40s linear), `barra-pulsa` (o botão da barra, 2.4s) e a barra deslizando (240ms).
- `prefers-reduced-motion: reduce` desliga todas as animações acima, a transição da barra e o giro do selo no hover; o estado final aparece direto.

### Painel admin
`src/app/admin/painel.css` herda as cores do `:root` e os controles, sem ornamento: sem faixa, cantoneira, guilloché, onda nem Caslon. `h1` e `h2` voltam para a fonte do sistema, em 700. As tabelas largas rolam dentro da `.tabela`. Não é referência para telas do Tester.

### A home (a cédula inteira)
Aprovada pelo Daniel em 2026-10-24, a partir de uma referência de placa gravada; é de onde o sistema saiu. A página inteira é `src/app/page.tsx`, envolta em `.cedula`, que hoje só guarda o layout da home (o pé centrado); a primeira tela é `src/app/capa.tsx`. Ela fica no mesmo papel do `body` que todo o sistema.

- **Capa:** o papel ganha manchas em `radial-gradient` do próprio azul atrás da placa. Não é gradiente decorativo: é o papel da cédula.
- **Roseta de guilloché:** a `Guilloche`, traço branco a 4,5% de opacidade, maior que a tela, atrás da placa.
- **Moldura:** a cruz de braços em arco e cantos internos em quarto de círculo, traço `rgb(238 242 250 / 0.6)`, numa caixa 300 × 380 (`.capa-placa`, `container-type: inline-size`); todo o resto se posiciona em `cqi` e em porcentagem dela.
- **Gravura:** `public/gravuras/belerofonte.png`, Belerofonte no Pégaso, gravura em madeira de 1878 (A. H. Petiscus, *Der Olymp*), domínio público, do Wikimedia Commons; invertida em prata com alpha (a origem está embutida no PNG). Entra com o único momento animado da capa, `imprimir` (clip-path de cima para baixo), desligado em reduced-motion.
- **Tipo:** wordmark e o pé da legenda em Caslon (`--serifa`, carregada no layout); os dois rótulos laterais em Azeret Mono caixa-alta, em `--prata-suave`; "por Daniel Bernardino" em mono no pé da capa. O `h1` é a frase aprovada inteira, lida por leitor de tela; na tela as palavras dela compõem a legenda da placa. A frase saiu de um spike de texto em três rodadas (branch `spike/home-texto`): o ângulo do recrutador, na versão "você defende cada número".
- **Cantoneiras:** as mesmas `Cantoneiras` do sistema, no tamanho cheio (3rem), nos cantos da capa.
- **Abaixo da capa:** as peças do chat imprimem sobre o papel sem mudança, com os tokens do sistema. A página corre em faixas de borda a borda (`.inicio-faixa`), a da pergunta mais escura (`.escura`, `rgb(8 22 66 / 0.45)`), separadas pela `Onda`. "Como funciona" em três colunas (a partir de 48rem) com numerais romanos em Caslon ocre de 3.5rem; a pergunta inventada à esquerda e a linha que ela vira à direita, numa moldura ocre dupla; os pares do Daniel como Antes → Depois, com a seta ocre que gira 90° no celular. Os `h2` em Caslon de 2rem, alinhados à esquerda; o convite é um carimbo ocre (`.garantias`); o pé é centrado sob a última tira. Escolhida pelo Daniel num spike de sete variantes (branch `spike/home-variantes`).
- **O selo e a barra:** o pé é um selo redondo em ocre, com relevo em gradiente radial e tinta cobalto, que pede o convite no WhatsApp ("Pedir convite", com a legenda girando no aro). Até o selo entrar na tela, o mesmo convite fica numa barra fixa no fundo (`barra-convite.tsx`, um `IntersectionObserver`), quase opaca, com régua ocre de 2px e desfoque de 8px atrás; ela desliza para fora e fica `inert` quando o selo aparece ou já passou. Escolhido num spike de quatro formas (branch `spike/home-cta`).

## Do's and Don'ts

### Do:
- **Do** pôr todo valor sob um `.rotulo` mono, como campo de passaporte.
- **Do** mostrar a origem de todo número pela forma da linha e pela tinta: cheia `--afirmado`, tracejada com `~` `--estimado`.
- **Do** dar ornamento pelo peso da tela: placa, moldura dupla e cantoneiras só na cerimônia (consentimento, resultado, fim, apagado, 404, a abertura da casa); no trabalho (chat, import, cabeçalho, espera, o resto da casa), só o papel, a faixa e os carimbos.
- **Do** usar ocre para todo destaque que não é número: carimbo de cobertura, garantia, recibo, aviso, régua de 2px.
- **Do** girar carimbos poucos graus (-3° a 2°; cancelado -8°); nunca alinhar um carimbo reto.
- **Do** manter prata cheia só na ação principal; segundas ações vazadas ou em texto.
- **Do** fazer opaca (`--cobalto` ou `--cobalto-fundo`) toda superfície sticky ou fixa.
- **Do** desenhar a 360px primeiro, com alvos de 48px, e medir cada par novo de tinta e fundo contra a tabela de contraste (AA no texto, 3:1 na borda de controle).
- **Do** manter faixa e cobertura sticky e soltá-las abaixo de 520px de altura.
- **Do** passar texto novo de interface pelo Daniel antes de entrar, seguindo `docs/regras-de-redacao.md`. Pendentes hoje: o rótulo "Você" nas respostas do chat; uma legenda para as linhas de origem no antes × depois; o texto do 404.

### Don't:
- **Don't** usar balões de chat, avatares ou alinhamento esquerda/direita para falante.
- **Don't** usar verde ou violeta para decorar, marcar cobertura, recibo ou aviso: são a origem de um número.
- **Don't** usar o `--folha` em superfície sticky ou fixa: ele é translúcido e o histórico aparece por baixo.
- **Don't** pôr guilloché atrás de texto de leitura, nem ornamento no painel admin.
- **Don't** pôr ocre como texto pequeno sobre o campo (4.2): ali ele é só texto grande ou ornamento.
- **Don't** pôr a Caslon em parágrafo, rótulo ou botão, nem o Azeret Mono em parágrafo ou título.
- **Don't** usar gradiente fora do papel (o `body`, as manchas da capa), do relevo do selo e da faixa de luz do submit pendente; nem vidro (`backdrop-filter`) fora da barra de convite da home; nem emoji.
- **Don't** usar ícones de glifo ou de fonte; ícones são SVG inline. A seta `→` dos pares da home é um caractere de texto que ficou de antes, não um modelo.
- **Don't** trocar a tinta de um número por estética, nem marcar estimado só pela cor.
- **Don't** tingir o PDF: ele é a folha branca do currículo, dentro da moldura.
- **Don't** pôr sombra em superfície que não sobe sobre o papel.
- **Don't** usar o rótulo mono como sobretítulo acima de um `h1`/`h2`.
