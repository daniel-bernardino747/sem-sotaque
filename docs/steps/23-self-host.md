# 23: Self-host (`MODO=local`)

## Objetivo

Um dev clona o repo, põe a própria assinatura do Claude ou a própria chave da API no `.env`, dá `docker compose up` e usa o produto inteiro, sozinho, na própria máquina.

## Ler antes

- `docs/decisoes.md`, "Parte 3" (Q1, Q6, Q8, Q21)
- As notas dos passos 12 (assinatura), 20 e 21
- `src/llm/cliente.ts` (`sdkDoAmbiente`, o guarda), `src/llm/assinatura.ts`, `src/avaliador/jev.ts`, o `Dockerfile` e o `docker-compose.yml`
- A documentação atual do Claude Code sobre `claude setup-token` e `CLAUDE_CODE_OAUTH_TOKEN`, e a política de uso da assinatura da Anthropic

## Decisões (grilling de 2026-10-28)

1. **`MODO=local|hospedado`** (Q6), `hospedado` por padrão. No `local`: um usuário, sem login, sem paywall, sem consentimento, sem landing, sem `/admin`, sem limite de vagas.
2. **O guarda da assinatura** passa a olhar o `MODO`: `LLM_BACKEND=assinatura` só vale no `local`, e o `hospedado` recusa sempre (Q8).
3. **Docker é o caminho oficial; nativo, para contribuidor** (Q8).
4. **O Jev é opcional** (Q21): sem `TYPESAFE_API_KEY`, as regras fixas.

## Fazer

1. **Verificar primeiro** se rodar `claude -p` com o `CLAUDE_CODE_OAUTH_TOKEN` da própria assinatura, dentro de um container na própria máquina, é uso permitido pela política atual da Anthropic. Cite a fonte nas notas. **Se não for claro, o README oferece só a `ANTHROPIC_API_KEY`** e o caminho da assinatura fica fora do Docker (nativo, com o `claude` logado no host), e o Daniel decide.
2. **O `MODO`:** uma função só (`modo()`), lida no servidor. O passo 20 e o 21 passam por ela: no `local`, `contaAtual()` devolve a conta única (criada no primeiro acesso) e `temAcesso()` é sempre verdadeiro.
3. **A imagem:** o `claude` CLI numa versão fixada (como o Tectonic), o `docker-compose.yml` com um perfil ou um arquivo `docker-compose.local.yml` que liga `MODO=local` e roda as migrações na subida.
4. **Medir o Jev:** `npm run simular -- nao-sei` com e sem `TYPESAFE_API_KEY`, pela assinatura. Compare turnos e cobertura e anote. Se a diferença for grande, registre em Achados (o Claude no lugar do Jev é decisão do Daniel).
5. **O `README.md`:** o que é, o "pague ou rode local", os dois caminhos de instalação, as variáveis, o que muda sem o Jev, e que o modelo nunca escreve LaTeX. Em português (o público), com um resumo em inglês no topo.

## Fora do escopo

O repo público, a licença e o CLA (passo 24). Multiusuário no `local`.

## Pronto quando

- [ ] Numa pasta limpa, `cp .env.example .env`, preencher uma chave e `docker compose -f docker-compose.local.yml up` leva até a casa sem login, e o interrogatório responde.
- [ ] O `hospedado` recusa `LLM_BACKEND=assinatura` mesmo com `NODE_ENV=development`; o `local` aceita com `NODE_ENV=production` (teste).
- [ ] Sem `TYPESAFE_API_KEY`, uma sessão local vai até o PDF.
- [ ] A política da assinatura está verificada, com a fonte, e o README segue o resultado.
- [ ] `npm run typecheck` e `npm test` passam.

## Notas de implementação

**Feito, com duas pendências que dependem de chave** (no fim). O item 2 entrou depois do merge do passo 20 (#10), com rebase no `main`.

**Item 2, o `local` depois das contas:**

- `contaLocal()` (`src/db/contas.ts`): a conta única, `provedor = 'local'` e `id_no_provedor = 'local'`, criada no primeiro acesso por um upsert que trava a linha (dois primeiros acessos ao mesmo tempo criam um Tester só). **Migração `0014_conta-local.sql`:** `ALTER TYPE provedor ADD VALUE 'local'`. O `PROVEDORES` (a lista do OAuth) continua só com GitHub e Google; o enum do banco soma o `local`.
- A sessão nasce depois do consentimento: `estado = 'consentiu'`, `texto_consentimento_versao = 'local'` (nenhuma tela foi mostrada: quem preencheu o `.env` escolheu por onde o dado passa), `vagas_consentiu_em` preenchido e `limite_vagas = SEM_LIMITE_DE_VAGAS` (o maior inteiro da coluna). "Apagar meus dados" apaga a conta junto (passo 20), e o próximo acesso cria outra.
- `contaAtual()` (`src/conta/servidor.ts`): no `local`, sempre a `contaLocal()`; o cookie de login é ignorado. Todo o resto (`sessaoAtual`, `sessaoDaRota`, as ações, o chat) passa por ela.
- **Sem login, landing nem painel:** `/` (com `await connection()`, ver abaixo), `/entrar`, `/s/<token>`, `/api/auth/<provedor>`, o callback e `/s/<token>/entrar/<provedor>` vão para `/casa`; `exigirAdmin()` e a ação do token do painel dão 404. A moldura da casa não mostra "Sair", e "Achei uma vaga" não conta as vagas que restam quando não há limite.
- **Depois da revisão:** o `contaAtual()` e o `exigirAdmin()` chamam `await connection()` no ramo `local` (sem a leitura do cookie, nada mais marcava `/casa` como por requisição, e um build com `MODO=local` a pré-renderizaria). O `contaLocal()` lê primeiro e só escreve no primeiro acesso. A rota do PDF do painel (`/admin/sessoes/<id>/pdf`, que não passa pelo `exigirAdmin`) também dá 404.
- **Armadilha do `/`:** a landing era estática (○ no `next build`), então o `modo()` seria lido no build, com o `MODO` do build, e a mesma imagem roda os dois modos. `await connection()` (de `next/server`, conferido no 16.1.6) a torna por requisição (ƒ). Qualquer página nova que leia o `modo()` precisa ser dinâmica; no build, confira a tabela de rotas.
- **`temAcesso()` não existe ainda:** é do passo 21. Lá, no `local`, ele devolve sempre verdadeiro por `modo()`, como diz o item 2.
- Testes: `src/db/conta-local.test.ts` e `src/conta/modo-local.test.ts` (com `next/headers` e `connection` falsos; o 401 do painel no hospedado precisa de `__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS`, que o `next.config.ts` liga em runtime).


**Item 1, a política da assinatura: não é clara** (lida em 2026-11-03):

- [legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance): "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication [...] Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users." E, na mesma página: "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". Diz também que a OAuth é "designed to support ordinary use of Claude Code and other native Anthropic applications".
- [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview): "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products". O [headless](https://code.claude.com/docs/en/headless) chama o `claude -p` de "Agent SDK via the CLI".
- [authentication](https://code.claude.com/docs/en/authentication): o `CLAUDE_CODE_OAUTH_TOKEN` do `claude setup-token` é "for CI pipelines and scripts". O `--bare` não o lê, e o headless diz que o `--bare` vai virar o padrão do `-p` (o adaptador usa `--safe-mode`, passo 12; ficar de olho).
- Nenhuma fonte trata de um app aberto, local, de um usuário só, cujo autor nunca vê o token. Um README que diz "ponha o seu token no `.env`" pode ser lido como "oferecer os limites da assinatura no produto".

**Então, como o passo manda:** o Docker é só pela `ANTHROPIC_API_KEY`. A imagem **não** tem o `claude` CLI, e o `docker-compose.local.yml` fixa `LLM_BACKEND=""`. A assinatura fica no caminho nativo (o `claude` logado no host), com o README explicando a ambiguidade. **O Daniel decide** se a assinatura entra no Docker. Se entrar: `npm install -g @anthropic-ai/claude-code@<versão>` no estágio `runtime` (o host tem a 2.1.317), o `CLAUDE_CODE_OAUTH_TOKEN` no `.env` e tirar o `LLM_BACKEND: ""` do compose local.

**Como ficou:**

- `src/modo.ts`: `modo(env = process.env)` devolve `'local' | 'hospedado'`; vazio é `hospedado`, e um valor desconhecido lança erro (um `MODO=lcoal` não cai calado no hospedado).
- `sdkDoAmbiente()` (`src/llm/cliente.ts`): `LLM_BACKEND=assinatura` só com `modo() === 'local'`, com qualquer `NODE_ENV`. **A checagem do `RAILWAY_*` saiu:** o hospedado recusa sempre, e a produção está no Coolify. Comando de dev agora: `MODO=local LLM_BACKEND=assinatura npm run dev` (também no `simular` e no `gerar`).
- `usaJev()` (`src/interrogatorio/turno.ts`): o Jev só roda com a `TYPESAFE_API_KEY`. Antes, sem a chave, cada checkpoint falhava a chamada (uma linha de erro no painel) e só então caía na reserva. No hospedado, também precisa do consentimento v2; no `local`, a chave basta (não há tela de consentimento).
- `npm run simular -- <persona> --sem-jev`: ignora a chave do `.env`, para medir o `local` sem o Jev.
- `docker-compose.local.yml`: projeto `sem-sotaque-local`, a mesma imagem, `MODO=local`, `npm run db:migrate && exec next start` na subida, o Postgres com healthcheck e sem porta exposta (não briga com o `db` de dev na 5432), o volume `db-local`. O `.env` é obrigatório.
- `README.md` em português, com o resumo em inglês no topo. `.env.example` e `CLAUDE.md` atualizados.

**Rodadas (2026-11-03):**

- `npm test`: 415 passaram, 4 pularam. `npm run typecheck` limpo. O Postgres da 5432 era o do worktree do passo 20: para não cruzar migrações, usei um Postgres próprio na 5433 (`TEST_DATABASE_URL`, `DATABASE_URL`).
- **Item 4, sem o Jev** (`MODO=local LLM_BACKEND=assinatura ANTHROPIC_API_KEY= npm run simular -- nao-sei --sem-jev`): 16 turnos, 9 de 9 registros fechados, cobertura 100%, 8 de 8 checagens OK, 3,9 min. `storage/simulacoes/nao-sei-2026-11-03T12-18-07-053Z.md`.
- **Item 4, com o Jev: não medido.** A `TYPESAFE_API_KEY` do `.env` dá **401** ("Cannot authenticate"): a rodada "com o Jev" (8 turnos, 7 de 7, 8 de 8 OK) caiu na reserva em todo checkpoint e não vale como comparação. Falta uma chave válida e uma nova rodada com `npm run simular -- nao-sei` (o mesmo comando, sem `--sem-jev`).
- **Sem o Jev até o PDF** (`npm run gerar -- nao-sei`, pela assinatura, sem a chave): PDF gerado, "revisar" depois de 4 tentativas (uma empresa com 2 bullets, preenchimento 48%), em 126 s. O mesmo padrão do passo 12 nessa persona. `storage/geracoes/nao-sei-2026-11-03T12-18-23-245Z.*`.
- **Pasta limpa** (clone da branch, `cp .env.example .env`, só a `ANTHROPIC_API_KEY`, `docker compose -f docker-compose.local.yml up -d`): migrações na subida, `MODO=local` com `NODE_ENV=production`, `/health` 200, `token:new` dentro do container, e o link abre na tela de consentimento (o item 2 ainda não tirou). **O interrogatório não foi testado no Docker:** a `ANTHROPIC_API_KEY` do `.env` também dá 401 (em `/v1/models`, que não cobra).

**Rodadas depois do item 2 (2026-11-03):**

- `npm test`: 454 passaram, 4 pularam. `npm run typecheck` e `npm run build` passam.
- **Pasta limpa, Docker:** clone da branch, `cp .env.example .env`, só a `ANTHROPIC_API_KEY`, `docker compose -f docker-compose.local.yml up -d --build`. `/`, `/entrar`, `/s/qualquer` e `/api/auth/github` dão 307 para `/casa`; `/admin` dá 404; `/casa` dá 200 na casa ("Sua carreira, em inglês"), sem "Sair" e sem consentimento.
- **O interrogatório responde no `local`, sem login** (nativo, pela assinatura, porque a chave da API está inválida): `next start` com `MODO=local LLM_BACKEND=assinatura`, o import do fixture inventado `pleno.txt` na sessão local por script, e `POST /casa/chat` sem cookie. A primeira pergunta veio ("Vamos começar pela conciliação de boletos na Maracatu..."), e uma resposta trouxe a pergunta seguinte. A extensão do Chrome não estava conectada.

**Pronto quando:**

- [ ] **Parcial.** Casa sem login pelo Docker numa pasta limpa: OK. O interrogatório responde no `local` sem login, mas **pelo caminho nativo**: no Docker ele depende de uma `ANTHROPIC_API_KEY` válida (pendência 1).
- [x] O `hospedado` recusa a assinatura com `NODE_ENV=development`; o `local` aceita com `NODE_ENV=production` (`src/llm/assinatura.test.ts`).
- [x] Sem `TYPESAFE_API_KEY`, uma sessão local vai até o PDF.
- [x] A política está verificada, com as fontes, e o README segue o resultado.
- [x] `npm run typecheck` e `npm test` passam.

**Pendências (dependem do Daniel):** (1) uma `ANTHROPIC_API_KEY` válida, para ver o interrogatório responder dentro do Docker; (2) uma `TYPESAFE_API_KEY` válida, para a rodada com o Jev do item 4 (`MODO=local LLM_BACKEND=assinatura ANTHROPIC_API_KEY= npm run simular -- nao-sei`) e a comparação com a sem o Jev acima; (3) a decisão sobre a assinatura no Docker.

## Achados

- **As duas chaves do `.env` de dev estão inválidas** (401): a `ANTHROPIC_API_KEY` e a `TYPESAFE_API_KEY`. O passo 17 já tinha esbarrado na chave da API. Sem a da TypeSafe, o Jev de dev cai na reserva em todo checkpoint, e o painel enche de linhas de erro de `avaliador`.
- **Textos da casa que falam de entrar:** "se fechar, é só entrar de novo" e "e a sua conta sai junto" (passo 20) aparecem também no `local`, onde ninguém entra. Não estão errados a ponto de confundir; uma variante por `modo()` fica para quando alguém reclamar.
- **`/apagado` diz "A sua conta saiu junto."** também no `local`, e não oferece volta para a casa (abrir `/` cria uma conta nova). Mesma família do achado acima.
- **`Provedor` (o tipo) não inclui `local`, mas `Conta['provedor']` inclui.** Código novo que indexe algo do OAuth por `conta.provedor` (como `NOMES` em `src/conta/oauth.ts`) recebe `undefined` sem erro de tipo no `local`.
- **No `local`, o teto por sessão (`TETO_SESSAO_USD`, US$ 3 + US$ 2 por vaga) continua valendo** pela API: protege a chave de quem roda, mas uma sessão longa pode esbarrar nele. O README diz como subir.
- O `npm run db:migrate` imprime ".env not found. Continuing without it." na subida do container. É inofensivo (o compose passa as variáveis), mas assusta quem lê o log.
