# 09: Deploy e ensaio geral

## Objetivo

O v0 no ar, testado de ponta a ponta por gente de verdade antes do primeiro link ir para um grupo.

## Ler antes

- `Dockerfile` e notas do passo 01 (cache do Tectonic)
- `docs/deploy.md`: a produção roda numa VPS com Coolify, que faz o deploy a cada push na `main`. O Railway foi o primeiro deploy deste passo e saiu (notas abaixo)

## Fazer

1. O app (Dockerfile) e um Postgres em produção: hoje no Coolify (`docs/deploy.md`), antes no Railway. Variáveis: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ADMIN_TOKEN` (forte, gerado agora), `APP_URL`. As migrações rodam no deploy.
2. **Limite de gasto** na conta da Anthropic, ou um teto por sessão no `src/llm/cliente.ts` que pare de chamar e avise, para um tester que deixa a aba em loop não virar conta alta. Anote o valor escolhido.
3. Backup do Postgres ligado.
4. **Ensaio geral, nesta ordem:**
   1. O Daniel faz uma sessão inteira com um **currículo antigo dele** (de antes do `career`), pelo celular. Compare com o que o `career` gera: é a régua de qualidade.
   2. Uma pessoa próxima faz uma sessão inteira, sem ajuda.
   3. Apague as duas sessões pelo botão e confira no painel.
5. Corrigir o que o ensaio achar. Bug de fluxo é correção; ideia de feature vai para "Achados".
6. Anotar a URL real e o tempo mediano medido no ensaio, nas notas deste passo.

## Fora do escopo

Domínio próprio, CDN, monitoramento além do log do container e do painel.

## Pronto quando

- [ ] As duas sessões do ensaio chegaram ao PDF sem intervenção
- [ ] Apagar pelo botão funcionou em produção
- [ ] Render em produção abaixo de ~10 s com o cache aquecido (anote o tempo real; com o passo 26, a mediana aparece no painel)
- [ ] O limite de gasto está ativo
- [ ] O Daniel decidiu que dá para mandar o primeiro link. **Pergunte a ele.** Anote a data nas notas deste passo

## Notas de implementação

- **Railway** (substituído pela VPS com Coolify, `docs/deploy.md`): um projeto com o serviço `app` (Dockerfile) e um `Postgres` (volume), no ambiente `production`. Deploy por `railway up --service app --ci`; nada ia pelo GitHub.
- **`railway.json` virou `.railway/railway.ts`** (o Config as Code do Railway está deprecado e para em 2026-12-01; no `railway up` o `preDeploy` e o healthcheck do `railway.json` simplesmente não foram aplicados). O `.railway/railway.ts` declara o `preDeploy: npm run db:migrate`, o healthcheck `/health` e as variáveis; `DATABASE_URL` (`${{Postgres.DATABASE_URL}}`), `ANTHROPIC_API_KEY` e `ADMIN_TOKEN` ficam como `preserve()`, com o valor só no Railway. Mudou a config: `railway config plan` e, se o plano não apagar nada, `railway config apply --yes`. Dependência nova: `railway@3.16.0` (dev), o SDK que o `config plan` precisa.
- **`PORT=3000` é obrigatório:** o domínio aponta para 3000 e o Railway injeta outro `PORT` se não houver um, o que dá 502.
- **`/health`** faz `select 1` no banco. Um token desconhecido em produção dá 404, o que prova que as migrações rodaram.
- **Teto de gasto:** US$ 3 por sessão (`TETO_SESSAO_USD`, padrão em `src/llm/cliente.ts`). Antes de cada chamada com sessão, `gastoDaSessao` soma `chamadas_llm.custo_usd`; no teto, o cliente não chama, loga `spending cap reached for session <id>` e lança `ErroLlm('teto')`, Valor escolhido a partir das 15 sessões simuladas: mediana US$ 0,98, máximo US$ 1,56. **Mudou depois do primeiro tester real** (sessão `e6617726`, que bateu US$ 3,02 e ficou presa no "Tentar de novo"): no interrogatório, o teto encerra a conversa com a mensagem fixa `DESPEDIDA_DO_TETO` (`src/interrogatorio/turno.ts`) e o evento `terminou` com `por: 'teto'`; a geração (`selecao`, `critico`, `reescrita`) tem `MARGEM_GERACAO_USD` = US$ 1 acima do teto, para o currículo sair sempre.
- **Pessoa que sai no meio do turno:** a rota do chat para de escrever no stream quando ele é cancelado, e o turno termina e grava a pergunta. Antes, o `enqueue` num stream fechado lançava dentro da chamada ao modelo e o turno morria (log `Controller is already closed`).
- **`ADMIN_TOKEN` de produção** é outro, gerado no deploy (43 caracteres); guardado só no ambiente de produção.

## Achados

- **Volta durante um turno ainda rodando:** o `continuar` ao abrir recebe 409 (`ocupada`) e a tela faz `location.reload()`, em loop por alguns segundos até o turno terminar. Funciona, mas pisca; melhor esperar e tentar de novo, ou mostrar "escrevendo…".

- **`railway ssh` não conecta daqui** ("no_ssh_key", embora a chave esteja registrada): o tempo de render em produção não deu para medir com o fixture. A tabela `renders` não guarda duração; medir no ensaio (log do Railway) ou gravar `duracao_ms` em `renders`.
- **Backup automático do Postgres exige workspace Pro** no Railway ("Manual backups and backup schedules are only available for Pro workspaces").
- **Backup e "apagar meus dados":** quando houver backup, o apagar tira a pessoa do banco vivo, mas ela segue nos backups até eles expirarem. Dizer isso no consentimento ou manter a retenção curta.
- **Backend LLM pela assinatura do Claude, só no uso local do Daniel.** Ideia: `LLM_BACKEND=assinatura` em `src/llm/cliente.ts` troca o SDK por `claude -p` (Claude Code em modo não interativo), para `simular`, `gerar` e `npm run dev` não gastarem API. Nunca para testers: usar a assinatura como backend de um app para terceiros fere os termos da Anthropic, e o limite de uso é o pessoal. Precisa de uma trava que recuse em produção. Antes de implementar, conferir na documentação atual do Claude Code: saída estruturada (`--output-format json` contra os schemas zod), a falta de `cache_control` (`src/interrogatorio/turno.ts:261`, `src/geracao/pipeline.ts:176`) e o fato de que tokens e custo deixam de ser medidos. Sessões feitas assim marcadas como "custo não medido", fora da medida de custo (decisão 8).
