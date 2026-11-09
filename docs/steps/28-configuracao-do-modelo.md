# 28: A configuração do modelo

## Objetivo

No `MODO=local`, a pessoa escolhe numa tela por onde o app fala com o modelo: a chave da API da Anthropic, a assinatura do Claude (`claude -p`) ou a assinatura do ChatGPT (`codex exec`). A escolha sai da variável `LLM_BACKEND` e vai para o banco, e vale a partir da próxima chamada. O hospedado não muda: lá o caminho é sempre a API da Anthropic.

## Ler antes

- `docs/decisoes.md`, "A configuração do modelo" (M1–M10), e P26, Q8/Q21
- `src/llm/cliente.ts` (`SdkMinimo`, `sdkDoAmbiente`, `llm()`) e `src/llm/assinatura.ts` (o `claude -p` como `SdkMinimo`)
- `src/llm/precos.ts` (`PREFIXO_ASSINATURA`)
- `scripts/simular.ts` e `scripts/gerar.ts` (como reportam o caminho)
- `src/app/casa/_telas/moldura.tsx` (o rodapé) e `src/modo.ts`
- A documentação do Codex: [modo não interativo](https://learn.chatgpt.com/docs/non-interactive-mode), [comandos](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [config](https://learn.chatgpt.com/docs/config-file/config-reference), [sandbox](https://learn.chatgpt.com/docs/sandboxing), [login](https://learn.chatgpt.com/docs/auth)

## Decisões (grilling de 2026-11-09)

1. **A assinatura do GPT é o plano do ChatGPT pelo `codex exec`** (M1), não a API da OpenAI.
2. **O mesmo tratamento do Claude** (M2): só no `MODO=local`, só no caminho nativo (a imagem Docker não traz nem o `claude` nem o `codex`), um parágrafo no README com os termos da OpenAI, custo não medido.
3. **A tela** (M3): `/casa/configuracao`, só no `MODO=local` (no hospedado, 404 e sem link), com o link "Configuração" no rodapé. Três opções gravadas no banco, numa linha única da instância: `api` (a padrão), `assinatura_claude`, `assinatura_chatgpt`. A troca vale da próxima chamada em diante; uma chamada em curso termina pelo caminho em que começou.
4. **O `LLM_BACKEND` sai** (M4): o banco é a única fonte. O `simular` e o `gerar` leem a mesma escolha e dizem no relatório qual caminho usaram.
5. **A chave fica no `.env`** (M5): a tela diz "chave encontrada" ou "não há `ANTHROPIC_API_KEY` no `.env`", e sem ela a opção fica desabilitada.
6. **A disponibilidade é conferida** (M6) ao abrir a tela e ao salvar: `claude auth status` e `codex login status` (não instalado, sem login, logado). O indisponível fica desabilitado com o motivo. Uma chamada por uma assinatura que caiu falha dizendo o caminho, e a tela de erro do `MODO=local` aponta a configuração. **Nunca cai sozinha para a API.**
7. **O modelo do GPT** (M7): o padrão do Codex (sem `-m`), ou o que a pessoa fixar no campo opcional. O `effort` de cada etapa vira o `model_reasoning_effort`. No `chamadas_llm`: `assinatura:codex:<modelo ou padrao>`.
8. **O Codex sem poder agir** (M8): pasta temporária vazia, `--sandbox read-only`, nenhuma aprovação, shell desligado, sem a configuração do usuário (e com ela os MCP), sem `AGENTS.md`, `--ephemeral`, a resposta forçada pelo `--output-schema` no mesmo `{ texto, chamadas }` do Claude, e sem `OPENAI_API_KEY`/`CODEX_API_KEY` no ambiente do processo (com eles, o Codex cobraria a API). Se a versão instalada não deixar desligar algo disso, a opção fica indisponível.
9. **Os prompts não mudam** (M9): a opção sai como "experimental", com a linha "os textos foram afinados para o Claude".
10. **A configuração é da instância** (M10): fora do `apagarSessao`, do Arquivo do Corpus e do painel.

## Fazer

1. **O banco:** a tabela `configuracao` (uma linha só, `caminho_modelo`, `modelo_codex`), a migração, e `configuracaoDaInstancia()` / `gravarConfiguracao()`.
2. **O caminho por chamada:** um `SdkMinimo` que, a cada `stream`, lê a configuração e delega ao SDK do caminho escolhido. Fora do `MODO=local`, sempre a API, sem ler o banco. O `sdkDoAmbiente` e o `LLM_BACKEND` saem. Teste primeiro (`tdd`).
3. **O Codex:** `src/llm/codex.ts`, um `SdkMinimo` que roda `codex exec` com as flags do item 8, reaproveitando do `assinatura.ts` a transcrição, o prompt de sistema e o schema da resposta. Testes com um executor falso, como os do `claude -p`. Confira as flags na documentação e no CLI instalado, e anote a versão no comentário do arquivo.
4. **A disponibilidade:** `statusDosCaminhos()` (a chave no ambiente, `claude auth status`, `codex login status`), com um executor injetável nos testes.
5. **A tela:** `/casa/configuracao` e o link no rodapé, só no `MODO=local`, seguindo o `DESIGN.md`. Ao ler o `modo()` numa página nova, confira se ela é dinâmica (nota do passo 23).
6. **Os documentos:** README (a tela no lugar do `LLM_BACKEND`, o parágrafo dos termos da OpenAI, a tabela de variáveis), `CLAUDE.md`, `docs/deploy.md`, `docker-compose.local.yml`, o relatório do `simular` e do `gerar`.

## Fora do escopo

A API da OpenAI com chave. Prompts próprios para o GPT. Tirar o rótulo "experimental" (outro passo, com os números do item 9). A chave digitada na tela. O Codex dentro da imagem Docker.

## Pronto quando

- [ ] No `MODO=local`, a escolha gravada decide o caminho da próxima chamada, sem reiniciar; no hospedado, o caminho é a API mesmo com o banco dizendo outra coisa (teste).
- [ ] O `codex exec` é chamado com as flags do item 8, sem `OPENAI_API_KEY` nem `CODEX_API_KEY` no ambiente, e a resposta vira `text` e `tool_use` como a do Claude (teste com executor falso).
- [ ] A tela desabilita, com o motivo, a chave ausente e a assinatura não instalada ou sem login, e recusa salvar uma escolha indisponível (teste).
- [ ] Uma assinatura que falha dá erro com o caminho, e nada é chamado pela API (teste).
- [ ] `/casa/configuracao` dá 404 no hospedado.
- [ ] Com o `codex` instalado e logado no host: uma conversa e uma geração pela assinatura do ChatGPT, e as flags conferidas na versão instalada.
- [ ] As três personas do `simular` e o `gerar` pelas duas assinaturas, com as checagens, as reescritas e os "revisar" comparados nas notas.
- [ ] `npm run typecheck`, `npm test` e `npm run build` passam.

## Notas de implementação

**Status:** em andamento. Falta o que precisa do `codex` instalado e logado no host (ver "Pendente"). O resto do "Pronto quando" passou.

**Onde está:**
- `src/llm/caminho.ts`: `sdkPorConfiguracao`, um `SdkMinimo` que, no `MODO=local`, lê a configuração a cada `stream` e delega ao SDK do caminho. O stream que ele devolve é preguiçoso: os ouvintes de `text` esperam o stream de verdade. Fora do `MODO=local`, delega direto à API, sem ler o banco. Uma assinatura que falha vira `ErroDoCaminho` ("pela assinatura do ChatGPT: …"), e `caminhoDoErro` lê o caminho de volta na mensagem que o `ErroLlm` guarda. `NOME_DO_CAMINHO` dá os nomes da tela e dos erros.
- `src/llm/cliente.ts`: o `sdkDoAmbiente` e o `LLM_BACKEND` saíram. O `llm()` usa `sdkDaConfiguracao()`, que é a mesma função que o `simular` usa para a persona. A API é um cliente `Anthropic` só, criado na primeira chamada.
- `src/llm/codex.ts`: o `codex exec` como `SdkMinimo`. Reaproveita do `assinatura.ts` a transcrição, o prompt de sistema e o schema da resposta. A parte que transforma a resposta estruturada em mensagem saiu para `mensagemEstruturada`, que os dois caminhos usam. O prompt de sistema vai por `-c model_instructions_file=<arquivo>`, o schema por `--output-schema`, a resposta por `--output-last-message`, a conversa pelo stdin (`-`) e o uso de tokens vem do `turn.completed` do `--json`.
- `src/llm/disponibilidade.ts`: `statusDosCaminhos` e `escolhaPermitida`. Cada CLI é conferido **com o mesmo ambiente da chamada**, sem a chave da API (`ambienteDoClaude`, `ambienteDoCodex`). Na conferência real, o `next dev` lê o `.env`, e o `claude auth status` com a `ANTHROPIC_API_KEY` no ambiente respondia "logado por chave de API".
- `CODEX_CONFERIDO` (`null`): enquanto as flags não forem conferidas com um CLI instalado, a opção do ChatGPT fica desligada com esse motivo. Depois, ela exige uma versão igual ou mais nova que a conferida.
- O banco: a tabela `configuracao`, com uma linha (`id` sempre `true`), o enum `caminho_modelo` e o `modelo_codex` (migração 0020). `configuracaoDaInstancia()` devolve a API quando não há nada gravado.
- A tela: `/casa/configuracao` (`_telas/form-configuracao.tsx`, ação `salvarConfiguracao`), com o link "Configuração" no rodapé só no `MODO=local` (`a.discreto`, novo no CSS). A página chama o `connection()` **antes** de ler o modo: a mesma imagem serve o hospedado e o self-host, e o build roda sem `MODO`. Uma checagem no build congelaria um 404 que o self-host também serviria. O `AvisoDoCaminho`, no erro da geração (geral e da Vaga), e uma linha no erro do chat (`local`) apontam a Configuração.
- O `simular` diz no relatório por qual caminho rodou (`NOME_DO_CAMINHO`); o `gerar` diz pelo modelo gravado (`assinatura:codex:` é o ChatGPT).

**Verificado:** num banco à parte, com o `MODO=local` nativo e sem `LLM_BACKEND`:
- a tela mostrou a chave encontrada, a assinatura do Claude logada (plano max) e o Codex "não instalado";
- gravada a assinatura do Claude, uma chamada real pelo `llm()` foi pelo `claude -p` e ficou no `chamadas_llm` como `assinatura:claude-opus-5-5`, com custo zero.

O caminho da API não foi chamado, para não gastar.

**Pendente, com o `codex` instalado e logado no host** (`npm install -g @openai/codex`, `codex login` com a conta do ChatGPT):
1. Conferir as flags na versão instalada. Itens:
   - `--ignore-user-config`, `--ignore-rules`, `--ephemeral`;
   - se o `-c approval_policy="never"`, o `features.shell_tool=false`, o `web_search="disabled"` e o `project_doc_max_bytes=0` são aceitos e fazem o que dizem;
   - se o `AGENTS.md` global (`~/.codex/AGENTS.md`) fica de fora: a documentação não diz;
   - que subconjunto de JSON Schema o `--output-schema` aceita: o nosso tem `anyOf`, `const` e `minItems`;
   - a saída do `codex login status` (ChatGPT, chave de API, sem login).

   Conferido, preencha `CODEX_CONFERIDO` com a versão e anote aqui.
2. **No Windows:** o `codex` do npm é um `codex.cmd`, e o `spawn` sem shell não acha um `.cmd`: a tela diria "não instalado" e a chamada não sairia. Resolver na conferência, com `CODEX_BIN` apontando para o binário, ou chamando o `node` com o script do pacote. Não usar `shell: true`: os argumentos têm aspas e JSON.
3. Uma conversa e uma geração pela assinatura do ChatGPT.
4. As três personas do `simular` e o `gerar`, pelas duas assinaturas, comparados aqui. Isso gasta o limite dos dois planos, não dinheiro.

## Achados

- O CLI do Claude, logado na assinatura, passa a responder `authMethod: "api_key"` quando a `ANTHROPIC_API_KEY` está no ambiente. Por isso a conferência da tela roda sem a chave, como a chamada.
