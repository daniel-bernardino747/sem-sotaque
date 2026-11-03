---
version: 1
slug: "src-app-s-token-page-tsx"
primary_target: "src/app/s/[token]/page.tsx"
related_targets: ["src/app/page.tsx","src/app/not-found.tsx"]
---

## Scope

Telas do Tester: `src/app/s/[token]/_telas/*`, `src/app/page.tsx`, `src/app/not-found.tsx`. Modo: Operate. O painel admin só herda as cores, sem ornamento.

## Audience and task

Dev brasileiro pleno/sênior, no celular, vindo de um link do WhatsApp. Tarefa: consentir, enviar o currículo, responder o interrogatório por 20–40 minutos, receber o PDF e o antes × depois. Sem login; pode sair e voltar.

## Constraints

CSS puro com custom properties no `:root`; nenhuma mudança de lógica, ação, rota ou fluxo; texto novo só com aprovação do Daniel; o mesmo cobalto nos dois temas, em AA (tabela de contraste em `DESIGN.md`); 360px primeiro.

## Direction contract

Desde o passo 13 (2026-10-26), este contrato é o da **cédula cobalto** e substitui o da Página de vistos. A Página de vistos fica abaixo, em "Histórico", como história.

THESIS: Cada feito só entra no currículo carimbado, com a origem à vista. A tela é uma cédula: um documento de valor, gravado, que se defende. Recusa o chat de balões de SaaS de IA e o "termos de uso" em texto corrido.

OWN-WORLD: Papel cobalto (#1C3D8F) com granulado fino e um gradiente que afunda para o cobalto fundo (#15306F); tinta prata (#EEF2FA), suave #C4CDE3; ornamentos em ocre (#D8B24C): cantoneiras, a tira de onda, a moldura dupla, os carimbos de cobertura, as garantias, as réguas de 2px. Verde (#8FE0BF, linha cheia) e violeta (#CDBCFF, tracejado com ~) só para a origem de um número. Foco amarelo #FFD76A; perigo #FFB4A8. Libre Caslon Display nos h1, h2 e no wordmark; a fonte do sistema na leitura; Azeret Mono nos rótulos, números e carimbos. Sem tema claro. Ornamento pelo peso da tela: placa, moldura e cantoneiras na cerimônia; só papel, faixa e carimbos no trabalho. Tudo que fica preso na tela é opaco. O PDF fica branco, na moldura ocre.

STORY: A pessoa vê que está num lugar sério, de um autor (o Daniel), que diz o que guarda e onde, numa placa. Responde uma pergunta por vez sem se perder, vê os vistos ocre se encherem e, no fim, vê cada linha antiga virar uma linha nova carimbada com a origem do número.

FIRST VIEWPORT: Chat a 360px, no cobalto fundo só com o granulado: a faixa de 48px com o wordmark em Caslon à esquerda e "por Daniel Bernardino" em mono à direita, sobre a tira de onda ocre; logo abaixo, a régua de vistos opaca (rótulo mono "Currículo N% coberto", 10 slots, carimbado = anel ocre girado com check); a pergunta atual a 21px, peso 500, em prata, sob uma régua ocre de 2px, sem balão, dona da dobra; as trocas antigas recuam (pergunta em suave 15px, a resposta como linha de campo; o rótulo "Você" segue pendente de texto); compositor fixo no pé, opaco no cobalto com sombra para cima, uma linha que cresce, botão enviar quadrado em prata com seta SVG, "Pular esta" em suave e "Terminei" em prata 600.

FORM: Cédula cobalto: a placa gravada da home (aprovada em 2026-10-24, spikes `spike/home-variantes`, `spike/home-texto`, `spike/home-cta`), levada a todo o sistema no passo 13 (2026-10-26). Assinatura: a cobertura desenhada como fileira de vistos carimbados, agora em ocre; o carimbo reaparece no antes × depois (DEPOIS, na tinta da origem) e no apagado (cancelado, em perigo). Superfície cerimonial compartilhada: a `.placa`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Histórico

A primeira direção foi a **Página de vistos** (passaporte brasileiro), candidato 5 de 7 da lista ordenada, seed:53729b20664b6a72: faixa de capa azul-marinho, página verde-papel, tinta quase preta, ocre só no hífen do wordmark, claro e escuro. Valeu de 2026-10-23 até o passo 13, quando a cédula da home virou o sistema. Dela ficaram a fileira de vistos, os rótulos de campo em mono e a origem dita pela forma da linha.

## Raises (from declined challengers)

- Anuário: uma família de texto só; hierarquia por tamanho e espaço.
- Aeroporto: no celular, só a próxima decisão; o resto recua.
- Orientação: a cor da ação principal reservada à ação principal (hoje a prata).
- Feed vertical: a pergunta atual é dona da primeira dobra, com teclado aberto.
- Linhas de emissão: origem dita pela forma da linha do carimbo, não só pela cor.

## Unresolved

Nenhum de direção. Resolvido: a abertura do consentimento (opção A, aprovada pelo Daniel em 2026-10-23), a assinatura "por Daniel Bernardino" na faixa de toda tela, e a cédula como sistema (2026-10-26).

Pendentes de texto (precisam de aprovação antes de entrar): rótulo "Você" nas respostas do chat; uma legenda para as linhas de origem no antes × depois; o texto do 404. A home foi aprovada e feita em 2026-10-24 (porta séria, sem cadastro, contato discreto no pé).
