# 12: Backend LLM pela assinatura do Claude (só local)

## Objetivo

No uso local do Daniel, o app, o `simular` e o `gerar` chamam o modelo pela assinatura do Claude dele (`claude -p`, o Claude Code em modo não interativo), sem `ANTHROPIC_API_KEY` e sem gastar API. Produção e testers continuam no SDK, sem exceção. Origem: o achado do passo 09 (`09-deploy.md`, "Backend LLM pela assinatura do Claude").

## Ler antes

- `src/llm/cliente.ts` inteiro, em especial `SdkMinimo` e `llm()`, e `src/llm/cliente.test.ts` (o fake do SDK)
- Os quatro chamadores e o que cada um pede: `src/import/extracao.ts` (PDF como bloco `document`, uma tool), `src/interrogatorio/turno.ts` (tools do questionador, streaming do texto, `cache_control` na linha ~433), `src/geracao/pipeline.ts` (uma tool `strict` por etapa, ~166), `scripts/simular.ts` (a persona, texto puro, com o próprio cliente)
- `src/avaliador/jev.ts`: o Jev usa o TypeSafe (`TYPESAFE_API_KEY`), não a Anthropic, e fica fora deste passo
- `docs/decisoes.md`, decisão 8 (o custo medido)
- A documentação **atual** do Claude Code sobre `claude -p`: `--output-format json`, `--json-schema`, `--system-prompt`, `--tools ""`, `--model`, `--no-session-persistence`, `--setting-sources`, `--bare`. A CLI instalada é a 2.1.308 (`claude --help`). Não confie no que o treino sabe

## Decisões (2026-10-22, com o Daniel)

1. **A troca é na costura `SdkMinimo`.** Um adaptador implementa `beta.messages.stream(params)` chamando `claude -p` e devolve uma `BetaMessage` sintética. Os chamadores não mudam: continuam lendo `content`, `tool_use` e `stop_reason`. O teto, o retry e o registro em `chamadas_llm` seguem no cliente.
2. **Ligado por `LLM_BACKEND=assinatura`.** Sem a variável, ou com qualquer outro valor, é o SDK de hoje.
3. **Trava de produção.** Com `LLM_BACKEND=assinatura`, `llm()` lança erro se `NODE_ENV === 'production'` ou se houver `RAILWAY_ENVIRONMENT` (ou outra variável que o Railway sempre define, confira). Usar a assinatura como backend de um app para terceiros fere os termos da Anthropic, e o limite de uso é o pessoal do Daniel. O erro diz isso em uma linha.
4. **Roda no host, não no container.** O `claude` e o login dele estão no Windows. O fluxo local fica: Postgres no Docker (`docker compose up -d db`), app com `npm run dev` no host.
5. **Custo não medido.** Cada chamada grava uma linha em `chamadas_llm` com tokens e custo zerados e o modelo prefixado (`assinatura:claude-opus-5-5`), ou o que a saída JSON do `claude -p` der de uso. Sem migração, se der. O painel e qualquer conta de custo por sessão deixam essas linhas de fora da calibração (decisão 8), e o painel mostra "custo não medido" nessas sessões.
6. **Sem cache e sem streaming de verdade.** `cache_control`, `output_config.effort`, `betas` e `fallbacks` são ignorados pelo adaptador. O texto chega de uma vez: o adaptador emite um único `text` com a resposta inteira, e a tela do chat aparece sem o efeito de digitação. Aceito para uso local.

## Fazer

1. Conferir na documentação e na CLI, antes de escrever código: como passar o system prompt, desligar as tools do Claude Code e o contexto do projeto (CLAUDE.md, hooks, skills, MCP), forçar a saída num JSON Schema, escolher o modelo, e o formato da saída de `--output-format json` (onde fica o resultado estruturado, o uso, o erro). Confirmar se `--bare` aceita o login da assinatura ou exige chave de API. Escrever o que achou nas notas.
2. `src/llm/assinatura.ts`: o adaptador `SdkMinimo`.
   - **Mensagens:** serializa `system` e `messages` (texto, `tool_use`, `tool_result`) num prompt que preserve os papéis. O PDF do import (bloco `document` base64) vai para um arquivo temporário que o `claude -p` lê; apague depois.
   - **Tools:** o pedido traz as tools do app (`FERRAMENTAS` do questionador, a tool do import, a de cada etapa da geração). O adaptador monta um JSON Schema de resposta `{ texto, chamadas: [{ name, input }] }` em que `input` é validado contra o `input_schema` de cada tool, e converte o resultado em blocos `text` e `tool_use` (ids gerados), com `stop_reason` `tool_use` ou `end_turn`. Respeite o `tool_choice` quando o pedido forçar uma tool.
   - **Erros:** saída que não parseia ou não bate com o schema vira erro do adaptador, que o cliente registra como hoje. Processo que morre ou limite da assinatura também.
3. `llm()` escolhe o backend por `LLM_BACKEND`, com a trava da decisão 3. O `scripts/simular.ts` cria o próprio cliente: ele também passa a respeitar a variável (persona e produto pela assinatura).
4. O registro de custo da decisão 5, e o painel mostrando "custo não medido".
5. `.env.example` e o `CLAUDE.md` (seção Comandos): `LLM_BACKEND`, e o comando local `docker compose up -d db` + `LLM_BACKEND=assinatura npm run dev`.
6. Rodar de ponta a ponta pela assinatura: um token novo, o import de um PDF de fixture inventado, um interrogatório curto no navegador, a geração. Depois `npm run simular -- nao-sei --turnos 6` e `npm run gerar -- nao-sei` com `LLM_BACKEND=assinatura`.

## Fora deste passo

- Qualquer uso da assinatura em produção, no Railway ou por tester.
- O Jev (TypeSafe).
- Streaming de verdade pelo `--output-format stream-json`. Se o item 1 mostrar que é simples, anote nos achados.
- Comparar qualidade entre a assinatura e a API.

## Pronto quando

- [x] Com `LLM_BACKEND=assinatura` e sem `ANTHROPIC_API_KEY`, `npm run dev` faz o import, o interrogatório e a geração de uma sessão inventada até o PDF.
- [x] `npm run simular` e `npm run gerar` rodam pela assinatura, e a transcrição das checagens sai como hoje.
- [x] Com `NODE_ENV=production` (ou a variável do Railway) e `LLM_BACKEND=assinatura`, `llm()` recusa, testado.
- [x] O adaptador tem teste sem o `claude` de verdade (o processo injetado): mensagens com `tool_use`/`tool_result` viram prompt, a saída JSON vira `text` + `tool_use`, saída inválida vira erro.
- [x] As chamadas pela assinatura ficam em `chamadas_llm` com custo zero e o modelo marcado, e o painel mostra a sessão como "custo não medido".
- [x] Sem a variável, nada muda: `npm test` e `npm run typecheck` passam, e o deploy segue no SDK.

## Notas de implementação

**O que a CLI faz (item 1, conferido em 2026-10-22 na CLI 2.1.308, no `claude --help` e em code.claude.com/docs: headless, cli-reference, authentication, agent-sdk/structured-outputs):**

- `--bare` **não serve**: em bare, a autenticação é só `ANTHROPIC_API_KEY` ou `apiKeyHelper`; OAuth, keychain e `CLAUDE_CODE_OAUTH_TOKEN` nunca são lidos. Para manter o contexto fora com a assinatura, o adaptador usa `--safe-mode`, que desliga CLAUDE.md, skills, plugins, hooks e MCP e mantém a autenticação, junto com `--strict-mcp-config`, `--disable-slash-commands` e `--no-session-persistence`. O processo também roda numa pasta temporária vazia.
- `--tools ""` desliga as tools nativas. `--system-prompt-file` **substitui** o prompt do Claude Code (o `--append-*` somaria a ele).
- `--json-schema` só aceita o JSON inline, não um caminho de arquivo (testado: `not valid JSON`). Os schemas do app têm até ~4 mil caracteres (as `FERRAMENTAS` juntas), sem `$ref`, então cabem na linha de comando do Windows (~32 mil).
- A saída de `--output-format json` traz `structured_output` (o objeto validado), `result` (o mesmo como texto, ou a mensagem de erro), `is_error`, `api_error_status`, `subtype`, `stop_reason`, `usage` (no formato da API, com `iterations`), `modelUsage` e `total_cost_usd`. Esse custo é o preço de lista, não o que se paga na assinatura. Em erro, o código de saída é 1, com `is_error: true` e a mensagem em `result`: modelo inexistente dá `api_error_status: 404`.
- O prompt vai pelo stdin, com teto de 10 MB.
- **`ANTHROPIC_API_KEY` presente faz o `-p` cobrar a API**, mesmo logado. O `.env` tem a chave, e o Next e o `tsx --env-file` a carregam, então o adaptador a tira (e também a `ANTHROPIC_AUTH_TOKEN`) do ambiente do processo filho. `claude auth status` mostra `authMethod: "claude.ai"`, `subscriptionType: "max"`.
- `--effort` existe. O adaptador passa o `output_config.effort` do pedido por ele (desvio da decisão 6, que o ignorava), para o comportamento ficar perto do de produção.
- O binário é `claude.exe`, chamado sem shell. `CLAUDE_BIN` troca o caminho se precisar.

**Como ficou:**

- `src/llm/assinatura.ts`: `criarSdkAssinatura(executar?)` é um `SdkMinimo`. Serializa `messages` em `<turn role=...>`, com `<tool_call id name>` e `<tool_result for error>`, e põe as tools (nome, descrição, input schema) e o formato da resposta no fim do system prompt. O schema da resposta é `{ texto, chamadas: [anyOf por tool { name: const, input: input_schema }] }`, com `minItems: 1` quando o `tool_choice` é `tool` ou `any`; sem tools, só `{ texto }` (a persona). A resposta vira `text` + `tool_use` (ids `toolu_assinatura_*`), com `stop_reason` `tool_use` ou `end_turn` e o modelo `assinatura:<modelo>`. O texto sai num único evento `text` depois da chamada. Blocos `image`/`document` lançam erro.
- **Desvio: não há PDF para arquivo temporário.** Nenhum chamador manda bloco `document`: o import extrai o texto do PDF antes (`src/import/texto.ts`) e manda texto. O adaptador recusa o bloco com erro claro, se um dia aparecer.
- `PREFIXO_ASSINATURA` fica em `src/llm/precos.ts`, para o `src/db` não importar o adaptador (que importa `child_process`). `contabilizar` grava custo 0, sem o aviso de modelo sem preço, e os tokens que o `usage` da CLI informa. **Sem migração.**
- `sdkDoAmbiente()` em `cliente.ts`: `LLM_BACKEND=assinatura` usa o adaptador; qualquer outro valor usa o SDK. Recusa com `NODE_ENV=production` ou com **qualquer variável `RAILWAY_*`** (o Railway define várias, como `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_PROJECT_ID` e a antiga `RAILWAY_ENVIRONMENT`; o prefixo cobre todas). O `simular` usa o mesmo `sdkDoAmbiente()` para a persona.
- Painel: `sessoesDoPainel` traz `custoNaoMedido` (alguma linha com o prefixo), `custoDaSessao` traz `naoMedidas` por etapa. A lista e a página da sessão mostram "custo não medido", e `custoPorEtapa` ("Para o preço") deixa essas sessões de fora. O `simular` e o `gerar` escrevem "não medido" no relatório.
- O teto por sessão continua valendo, mas com custo 0 nunca dispara pela assinatura.

**Rodadas (2026-10-22, pela assinatura, `ANTHROPIC_API_KEY=` vazia):**

- `npm test`: 325 passaram, 4 pularam. `npm run typecheck` limpo.
- `ANTHROPIC_API_KEY= LLM_BACKEND=assinatura npm run simular -- nao-sei --turnos 6`: 2 min, 12 s por turno em média (um turno chegou a 19 s), 1,5 chamada ao questionador por turno. 7 de 8 checagens OK. A que falhou ("termina com tudo qualitativo ou pulado": "Participei das reuniões diárias...") é do corte em 6 turnos, com o registro ainda aberto, e não do backend. Transcrição em `storage/simulacoes/nao-sei-2026-10-22T19-04-21-378Z.md`. O Jev (TypeSafe) foi chamado de verdade, 5 vezes.
- `ANTHROPIC_API_KEY= LLM_BACKEND=assinatura npm run gerar -- nao-sei`: aprovada na 3ª tentativa, em 197 s (seleção 28 s, crítico 63 s em 3 chamadas, reescrita 43 s em 2), 0 checagens determinísticas no entregue, preenchimento insuficiente (48%, de uma sessão de 6 turnos). Relatório e PDF em `storage/geracoes/nao-sei-2026-10-22T19-12-25-452Z.*`. O console ainda imprime "US$ 0.0000"; o relatório diz "não medido".
- Navegador (Chrome), `ANTHROPIC_API_KEY= LLM_BACKEND=assinatura npm run dev` em **localhost:3001**: token novo ("Fulana Inventada (passo 12)"), consentimento, import do `src/llm/__fixtures__/pleno.pdf` por upload, 3 respostas no chat, "Terminei", cabeçalho com os dados inventados do fixture, geração até o PDF na tela. Em `chamadas_llm`: import 1, interrogatório 6, seleção 1, crítico 4, reescrita 3, todas `assinatura:claude-opus-5-5`, com custo 0 e sem erro. A geração ficou com `revisar` (não aprovada nas tentativas), o que é do pipeline numa sessão de 3 respostas. O painel mostra "custo não medido" na lista e na página da sessão, conferido por curl com o cookie gerado por `valorDoCookie()`. O texto da pergunta aparece de uma vez, sem efeito de digitação, como previsto.

## Achados

- **O container `app` do `docker compose up` ocupa a porta 3000 e usa a API.** O `npm run dev` no host cai para a 3001, e o link do `token:new` (`APP_URL`) aponta para a 3000: quem abrir o link como ele vem cai no container e gasta API. Antes do fluxo local pela assinatura: `docker compose stop app`. Ficou escrito no CLAUDE.md.
- **Streaming pelo `stream-json`:** `--include-partial-messages` existe, mas o texto vem dentro do JSON estruturado (`texto`), que só fecha no fim. Streaming de verdade exigiria tirar o texto do schema (texto livre + chamadas num formato próprio). Não é simples.
- O `usage` da CLI conta o que o Claude Code manda (o prompt dele com a tool de saída estruturada, o cache dele). Os tokens nas linhas da assinatura não comparam com os do SDK.
- No navegador, o questionador disse "Corrigindo o que eu disse: ainda não guardei o resultado" depois de uma rodada com tool recusada (tentou gravar o número que estava só no currículo). É o comportamento do turno (`descartar` depois de uma recusa), não do adaptador, mas a frase expõe a recusa para a pessoa. Vale olhar no prompt do questionador. **Resolvido depois do passo:** o prompt diz que o número de uma Metric vem só do chat (o currículo não basta), e o servidor avisa o modelo (`[sistema] A mensagem que você escreveu junto não foi mostrada à pessoa...`) quando descarta uma mensagem por recusa. Rodada `simular -- sabe-os-numeros` pela assinatura em 2026-10-22: 6 de 6 checagens OK, nenhuma mensagem corrigindo outra (`storage/simulacoes/sabe-os-numeros-2026-10-22T20-11-22-070Z.md`).
- O console do `gerar` imprime "US$ 0.0000" pela assinatura; só o relatório diz "não medido".
