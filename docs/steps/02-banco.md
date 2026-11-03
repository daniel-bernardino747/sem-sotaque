# 02: Banco (schema do Corpus e do log)

## Objetivo

Postgres com o schema do v0 inteiro, migrações e uma camada de acesso tipada. É o contrato que os passos 03–08 usam.

## Ler antes

- `CONTEXT.md` (os termos viram nomes de tabela e coluna)
- `../career/src/corpus/schema.ts`: o Corpus do Daniel em zod. Use como base de Affiliation e Accomplishment, tirando o que é dele (`featured`, `image`, `title` de projeto do site, `weight` como julgamento do Daniel)
- `docs/regras-de-redacao.md`, a seção "Específicas de uma pessoa" (confidencial)

## Fazer

ORM: **Drizzle** (migrações em SQL versionadas no repo). Se preferir outro, anote o motivo nas notas.

Tabelas, com `created_at` em todas:

- **`testers`**: `id`, `token` (aleatório, único, ≥ 128 bits, url-safe), `apelido`, `origem` (grupo de WhatsApp, LinkedIn, indicação de quem), `indicado_por` (nullable, fk `testers`).
- **`sessoes`**: `id`, `tester_id` (1:1 no v0), `estado` (`novo` → `consentiu` → `importou` → `interrogando` → `gerando` → `pronto` → `encerrado`), `consentiu_em`, `texto_consentimento_versao`, `terminou_interrogatorio_em`, `apagada_em`.
- **`affiliations`**: `id`, `sessao_id`, `organizacao`, `cargo`, `periodo_inicio` (`YYYY-MM`, nullable), `periodo_fim` (`YYYY-MM`, nullable = atual), `stack` (text[]), `confidencial` (bool), `descricao_publica` (o que o currículo usa quando é confidencial; também o "o que é essa empresa" para um recrutador estrangeiro), `ordem`.
- **`accomplishments`**: `id`, `sessao_id`, `affiliation_id` (nullable), `tipo` (`engineering` | `project` | `education` | `talk` | `open-source` | `writing`, como `KINDS`), `enunciado` (o cenário completo, longo, em PT), `importancia_para_pessoa` (nullable: `alta` | `normal` | `baixa`, perguntado e nunca inferido), `data` (`YYYY-MM`, nullable), `pulado` (bool: a pessoa pulou o interrogatório desse registro).
- **`metrics`**: `id`, `accomplishment_id`, `texto` (ex.: "~2 min → 20 s por ficha"), `valores` (numeric[] com os números que aparecem no texto, para a checagem "número do bullet ⊂ números da fonte"), `origem` (`afirmado` | `estimado` | `qualitativo`), `ancora` (nullable: a pergunta-âncora que levou à estimativa), `confirmado_em`.
- **`linhas_originais`**: `id`, `sessao_id`, `texto` (como veio no currículo importado), `affiliation_id` (nullable), `accomplishment_id` (nullable, ligado durante o import ou o interrogatório). É o "antes".
- **`importacoes`**: `id`, `sessao_id`, `formato` (`pdf` | `texto` | `linkedin`), `texto_extraido`. O arquivo original é descartado depois da extração.
- **`mensagens`**: `id`, `sessao_id`, `papel` (`assistente` | `pessoa` | `sistema`), `conteudo`, `accomplishment_id` (nullable: sobre qual registro era a pergunta), `latencia_ms` (para a pessoa: tempo desde a última pergunta), `marcadores` (text[]: `nao_sei`, `pulou`, `estimou`, `confirmou`).
- **`chamadas_llm`**: `id`, `sessao_id` (nullable), `etapa` (`import` | `interrogatorio` | `selecao` | `critico` | `reescrita`), `modelo`, `tokens_entrada`, `tokens_saida`, `tokens_cache_leitura`, `tokens_cache_escrita`, `custo_usd` (numeric, calculado na hora), `duracao_ms`, `erro` (nullable).
- **`selections`**: `id`, `sessao_id`, `json` (jsonb, validado pelo schema do render), `tentativa`, `violacoes` (jsonb: o que as checagens e o crítico acharam), `aprovada` (bool).
- **`renders`**: `id`, `selection_id`, `pdf` (bytea; nada de disco nem bucket no v0), `medida` (jsonb do `measure-resume`), `baixado_em` (nullable).
- **`fechamento`**: `sessao_id` (pk), `fundador` (bool), `email`, `whatsapp`, `pagaria` (`sim` | `nao` | `talvez`), `pagaria_quanto` (text), `depoimento` (text, nullable), `depoimento_pode_usar` (bool, consentimento separado), `comentario` (text).
- **`indicacoes`**: `id`, `sessao_id`, `nome`, `contato`, `virou_tester_id` (nullable).
- **`eventos`**: `id`, `sessao_id`, `tipo` (`link_aberto`, `consentiu`, `importou`, `primeira_resposta`, `nao_sei`, `pulou`, `terminou`, `pdf_gerado`, `pdf_baixado`, `fundador`, `indicou`, `apagou`), `dados` (jsonb). É o funil.

**Apagar:** `apagarSessao(sessaoId)` remove **todos** os dados da pessoa (cascade a partir de `sessoes`) e mantém só uma linha mínima, sem conteúdo, para o funil não mentir: um evento `apagou` com a data e o estado em que ela estava. Teste isso.

Camada `src/db/`: funções por caso de uso (ex.: `criarTester`, `sessaoPorToken`, `registrarMensagem`, `corpusDaSessao`), sem SQL espalhado pelas rotas.

## Fora do escopo

Rotas, telas, LLM.

## Pronto quando

- [x] `npm run db:migrate` cria tudo num Postgres vazio (docker-compose)
- [x] Testes de integração contra um Postgres real cobrem `criarTester` → `sessaoPorToken`, `corpusDaSessao` montando affiliations + accomplishments + metrics, e `apagarSessao` deixando zero linhas de conteúdo
- [x] `metrics.origem = 'estimado'` sem `ancora` é rejeitado (constraint ou validação)
- [x] Comandos novos anotados no `CLAUDE.md`

## Notas de implementação

- **Drizzle 0.45 + postgres.js**, drizzle-kit 0.31. Schema em `src/db/schema.ts` (nomes de coluna em português, propriedades em camelCase: `sessao_id` → `sessaoId`). Migrações em `drizzle/`; a primeira é `0000_inicial.sql`. Coluna nova: edite o schema, rode `npm run db:generate -- --name <o-que-mudou>`, revise o SQL e commite.
- **`db:migrate` usa o migrator do `drizzle-orm`** (`scripts/db-migrate.ts` → `src/db/migrate.ts`), não o `drizzle-kit migrate`: roda na imagem sem depender da CLI. Testado num banco vazio do compose (14 tabelas). Não foi testado dentro da imagem Docker; o passo 09 decide se o container migra no boot.
- **Conexão:** `db()` em `src/db/client.ts`, lazy, a partir de `DATABASE_URL`. `fecharDb()` para scripts e testes.
- **Camada:** `src/db/index.ts`. Hoje tem `criarTester` (cria Tester + Sessão `novo` numa transação; token de 192 bits base64url), `sessaoPorToken` (null se desconhecido ou apagado), `criarAffiliation`, `criarAccomplishment`, `registrarMetric`, `corpusDaSessao`, `registrarMensagem`, `registrarEvento`, `registrarChamadaLlm`, `apagarSessao`. Os próximos passos acrescentam as suas aqui.
- **`corpusDaSessao`** devolve `{ affiliations, accomplishments }`: affiliations por `ordem`; cada accomplishment com `affiliation` resolvida (ou null), `metrics` e `rascunho` (= sem Metric, como o `isDraft` do `career`).
- **Constraints no banco** (não só validação): `metrics_estimado_tem_ancora`, `affiliations_confidencial_tem_descricao` (confidencial exige `descricao_publica` não vazia), `sessoes_tester_ate_apagar` (`tester_id` só fica nulo depois de apagada, o que mantém o 1:1) e `YYYY-MM` em `periodo_inicio`, `periodo_fim` e `accomplishments.data`. O erro do Drizzle traz o nome em `err.cause.constraint_name`, útil para traduzir em mensagem para a pessoa.
- **`apagarSessao`**, numa transação e idempotente: apaga o conteúdo de todas as tabelas com `sessao_id` (metrics e renders vão por cascade), apaga a linha de `testers` (some o token, `sessaoPorToken` passa a dar null), mantém a linha de `sessoes` sem `tester_id` e com `apagada_em`, e grava um evento `apagou` com `{ estado }`. Desvio do texto do passo: **`chamadas_llm` não é apagada**, fica com `sessao_id = null` e `erro = null`, para o custo do v0 não sumir do painel. Para isso `sessoes.tester_id` é nullable (`on delete set null`).
- **Tabela nova com `sessao_id`** precisa entrar na lista do `apagarSessao`. O teste varre o `information_schema` atrás de toda coluna `sessao_id` e falha se sobrar linha.
- **Testes:** `src/db/index.test.ts`, contra o banco `sem_sotaque_test` (o `globalSetup` em `src/db/test-setup.ts` cria e migra; `vitest.config.ts` aponta `DATABASE_URL` para ele). Os testes não limpam o banco: cada um cria o seu Tester e só olha para os próprios dados (o banco de teste cresce; `drop database sem_sotaque_test` zera). Os testes só pulam se nada responder na porta (`ECONNREFUSED`); senha ou banco errado quebra a suíte.
- `marcadores` é `text[]` tipado no TS (`Marcador[]`), sem enum no banco; os outros enums do passo são `pgEnum`.

## Achados

- O `npm run db:migrate` imprime ".env not found. Continuing without it." quando não há `.env` (é o `--env-file-if-exists` do Node). Inofensivo.
- Não existe `.env.example`. O passo 03 ou o 09 pode criar um com `DATABASE_URL` e `APP_URL`.
- **Para o passo 08 (painel):** `apagarSessao` apaga também os eventos anteriores ao `apagou`. O funil por etapa precisa somar quem apagou a partir de `sessoes.estado` e do `dados.estado` do evento `apagou`; senão quem apagou some das etapas que já tinha passado.
- **Para o passo 06:** `selections.json` deve ser validado pelo schema do render na função que grava a Selection; o banco não valida.
