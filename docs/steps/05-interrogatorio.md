# 05: Interrogatório

## Objetivo

O coração do produto. Um chat em português que interroga o Corpus rascunho **uma pergunta por vez**, até cada Accomplishment ter uma Metric (afirmada, estimada por âncora ou qualitativa) ou ser pulado, e cada Affiliation ter período em mês/ano e uma descrição que um recrutador estrangeiro entenda. **Nunca inventa** um número.

## Ler antes

- **`../career/.claude/skills/interrogate/SKILL.md`**: o revisor que nunca está satisfeito ("óbvio pra quem?", "só fez um crudzinho?", "20% de quê?"). É a fonte principal do prompt
- `../career/.claude/skills/capture/SKILL.md`: o que um registro completo precisa ter (situação, mecanismo, quem fez o quê, como se sabe o resultado)
- `../career/generated/interrogations/`: logs reais de interrogatório do Daniel. Use como exemplos do tom e da profundidade, e **não** copie o conteúdo para o repo
- `docs/regras-de-redacao.md`: o que o interrogatório precisa colher para a geração cumprir as regras (mês do período, peso do cliente, nome próprio explicado, confidencial)
- `CONTEXT.md` (Metric, Origem, Âncora)
- Skill **`claude-api`** (tool use, streaming, prompt caching)

## Fazer

1. **O prompt** em `src/interrogatorio/prompt.md`, adaptado do `interrogate` para alguém que **não é o Daniel**:
   - Tom: firme, curioso, sem ser grosso. A pessoa é um dev que nunca foi interrogado assim e pode desistir. Hostil com a resposta vaga, gentil com a pessoa.
   - Uma pergunta por mensagem, curta, pensada para celular.
   - Ordem: Affiliations primeiro (o que a empresa é para um estrangeiro, o peso de mercado do cliente, se pode ser nomeada, mês de início e fim) e depois os Accomplishments, do mais forte para o mais fraco.
   - Por Accomplishment: o que era o problema, o que a pessoa fez de particular (não "fiz o front e o back"), quem mais estava envolvido, o resultado e **como ela sabe** o resultado.
   - **"Não sei" → âncoras**, uma por vez, antes de desistir: quantos usuários ou clientes usavam; com que frequência; quanto tempo levava antes e depois; quantas pessoas no time; o que acontecia quando quebrava e quanto custava; quanto dinheiro passava por ali. Se a pessoa chegar a um número, o modelo **repete o número e pergunta se ela confirma** antes de gravar como `estimado`.
   - Esgotadas as âncoras: procura um resultado qualitativo concreto ("o suporte parou de abrir chamado sobre X") e grava como `qualitativo`.
   - Também pergunta o que importa mais para a pessoa (`importancia_para_pessoa`) e procura coisas que o currículo não tinha ("teve algo que você fez lá que não está aqui?").
   - Nunca sugere um número. Nunca completa a frase da pessoa com um resultado.
2. **Tools** que o modelo chama (validadas em zod, gravadas no banco na hora): `atualizar_affiliation`, `criar_accomplishment`, `atualizar_enunciado` (o cenário completo, longo, em PT, com o que a pessoa disse), `registrar_metric` (texto, valores, origem, âncora), `marcar_pulado`, `ligar_linha_original`, `encerrar_interrogatorio`.
   - `registrar_metric` com origem `afirmado` ou `estimado` exige que o número apareça numa mensagem da **pessoa** na sessão. Verifique no servidor e recuse a tool call se não aparecer.
3. **Contexto por turno:** o Corpus atual da sessão (estado do banco) + as últimas N mensagens + um resumo do que já foi coberto, com prompt caching no prompt fixo. O histórico inteiro não vai a cada turno.
4. **Chat UI:** streaming, mobile-first, com um indicador "3 de 9 coisas fechadas" e os botões "pular esta" (marca pulado e segue) e "terminei". "Terminei" com registros abertos avisa quantos ficaram e deixa terminar mesmo assim.
5. **Log:** cada mensagem com `latencia_ms` e `marcadores` (`nao_sei` detectado pelo modelo via tool `marcar_nao_sei`, `estimou`, `confirmou`, `pulou`) e eventos `primeira_resposta`, `nao_sei`, `pulou`, `terminou`.
6. **Retomar:** voltar pelo link continua de onde parou, com a última pergunta repetida.

## Fora do escopo

Gerar o currículo (passo 06). Editar o Corpus em formulário.

## Pronto quando

- [x] Um **script de persona simulada** (`npm run simular -- <persona>`): um segundo modelo faz o papel de três testers inventados (o que sabe os números, o que diz "não sei" para tudo, o que responde com uma palavra) contra o interrogatório real, e salva a transcrição em `storage/simulacoes/` (fora do git). Os três terminam sem número inventado:
  - toda Metric `afirmado`/`estimado` tem o número numa fala da persona;
  - toda `estimado` tem `ancora`.
- [x] A persona "não sei para tudo" recebe âncoras e termina com `qualitativo` ou `pulado`, sem loop infinito: um limite de perguntas por registro, depois segue em frente
- [x] Nenhuma mensagem do assistente tem mais de uma pergunta (checagem no script)
- [x] O Daniel leu as três transcrições simuladas e aprovou o tom. **Peça a ele antes de marcar `feito`**
- [x] Custo médio por sessão simulada anotado nas notas (é o primeiro dado para o preço)

## Notas de implementação

**Estado:** feito. O Daniel aprovou o tom das três transcrições em 2026-10-14 (`storage/simulacoes/*.md`, fora do git).

**Custo e tempo** (rodada final, 2026-10-14, `claude-opus-5-5`, effort `medium`):

| Persona | Turnos | Fim | Fechadas | Custo da sessão (com o import) | Por turno | Tempo por turno (mediana / máx.) |
|---|---|---|---|---|---|---|
| sabe-os-numeros | 23 | o interrogador encerrou | 13 de 13 | US$ 0,88 | US$ 0,036 | 8,2 s / 23,1 s |
| nao-sei | 19 | o interrogador encerrou | 7 de 7 | US$ 0,54 | US$ 0,026 | 8,4 s / 11,3 s |
| uma-palavra | 45 | o interrogador encerrou | 12 de 12 | US$ 1,30 | US$ 0,028 | 7,8 s / 15,0 s |

**Média: US$ 0,91 por sessão**, import incluso (~US$ 0,04). O custo cresce com o número de turnos, não com o de registros: quem responde com uma palavra custa mais. A persona custa à parte (US$ 0,21–0,40) e não entra em `chamadas_llm`. Antes do cache da conversa (abaixo), a persona `sabe-os-numeros` custou US$ 1,56. Numa rodada anterior, a `uma-palavra` apertou "terminei" com 9 de 12 fechadas: o caminho do botão também foi exercitado.

- **O turno (`src/interrogatorio/turno.ts`):** grava a entrada (resposta, "pular esta" ou "continuar"); o modelo recebe o prompt fixo (`prompt.md`) e as tools, depois uma mensagem com o estado da sessão tirado do banco (`descreverCorpus`: affiliations e accomplishments com refs `af1`/`ac3`/`l7`, ABERTO/FECHADO/PULADO, quantas perguntas e "não sei" cada um teve, metrics e linhas originais) e só as últimas 14 mensagens. O "resumo do que já foi coberto" é esse estado: determinístico, sem chamada de modelo. As rodadas de tool de um turno são append-only; entre turnos o histórico é reconstruído do banco como texto, sem blocos de thinking, então não há o que o "preserved thinking" recuse.
- **Cache:** breakpoint no `system` (tools + prompt) e `cache_control` automático no topo do pedido, que cacheia o estado e a conversa do turno para a rodada depois das tools. O mínimo cacheável do Opus 5.5 é 512 tokens (ver Achados).
- **Refs** são dados pelo servidor e resolvidos para os UUIDs da sessão; o modelo nunca vê um id. Affiliations são numeradas por criação, e uma nova vai para o fim (`criarAffiliationNoFim`), para nenhum ref mudar entre turnos.
- **Foco e limite:** a tool `focar` diz sobre qual registro é a próxima pergunta, e a mensagem do assistente grava `accomplishment_id` ou `affiliation_id` (coluna nova). Assim se contam as perguntas por registro (`contagemPorRegistro`). Com 8 (`LIMITE_PERGUNTAS`) o estado manda o modelo fechar; com 10 (`LIMITE_DURO`) o servidor marca o registro como pulado antes do turno, e `focar` recusa voltar a ele. É o que garante que não há loop.
- **Uma pergunta por mensagem (`pergunta.ts`):** além do prompt, o servidor confere a mensagem final com `maisDeUmaPergunta` (dois "?", ou duas palavras interrogativas diferentes no pedido: "o que ela faz, pra quem e de que tamanho?"). Se pede duas coisas, o modelo reescreve uma vez, no mesmo turno, e a tela descarta o que já tinha chegado (evento `reiniciar`). É heurística: "você entrou em março e ainda está lá?" passa. Nas transcrições: 8 de 78 mensagens compostas antes de apertar o prompt, 1 de 93 depois e 0 de 87 com a reescrita. O script usa a mesma função.
- **Tools além das do passo:** `focar`, `criar_affiliation` (um lugar que a pessoa citou e que não estava no currículo) e `registrar_importancia` (`importancia_para_pessoa`). `encerrar_interrogatorio` pede `motivo`: `tudo_fechado` é recusado se houver registro aberto (na primeira rodada o modelo encerrou com o curso aberto); `pessoa_pediu` passa.
- **O que o servidor confere (`ferramentas.ts`):**
  - `registrar_metric` `afirmado`/`estimado`: cada valor e cada número do texto aparecem numa fala da pessoa (`numeroFoiDito` lê "2,5", "1.200", "5 mil", "10k", "vinte e cinco", "meia hora"). Conta feita pelo modelo é recusada ("de 10 para 1" não vira 90%).
  - `estimado`: exige `ancora`, que a última pergunta tenha repetido o número e que a mensagem atual seja a resposta da pessoa e não comece com "não". Marca `estimou` e `confirmou` na fala.
  - `qualitativo`: sem valores.
  - período: o ano e o mês estão nas falas ou no `periodo_original`. Início mais fim (ou "atual") marca `periodo_confirmado`.
  - enunciado e descrição: nenhum dígito que a pessoa ou o currículo não disse.
  - `confidencial` exige `descricao_publica`.

  Uma recusa volta como `tool_result` com `is_error` e o motivo em português; nada é gravado.
- **Migração `0004_interrogatorio`:** `affiliations.periodo_confirmado` (resolve o "null é atual ou não disse" do passo 04), `affiliations.pulado` e `mensagens.affiliation_id`.
- **"Fechada":** accomplishment com metric ou pulado; affiliation pulada, ou com período confirmado e `descricao_publica`. O "N de M coisas fechadas" conta os dois (`progresso`).
- **Fim:** "terminei" (action `terminar`, depois do aviso de quantas ficaram abertas) ou o modelo (`encerrar_interrogatorio`) levam `interrogando` → `gerando`, gravam `terminou_interrogatorio_em` e o evento `terminou` com `{ abertos, total, por }`. O passo 06 começa em `gerando` (a tela ainda é o placeholder de `resultado`).
- **Log:** `latencia_ms` na fala da pessoa, desde a última pergunta. Marcadores `nao_sei` (tool `marcar_nao_sei`), `estimou`/`confirmou` e `pulou` (na fala, ou numa mensagem `sistema` quando foi o botão ou o limite). Eventos `primeira_resposta` (uma vez), `nao_sei` e `pulou` (a cada vez; `pulou` com `{ por }`) e `terminou`. Mensagens `sistema` vão ao modelo como "[sistema] ..." e não aparecem na tela.
- **Streaming:** rota `POST /s/[token]/chat` (dentro de `/s/*`, então fora do log do `next dev` e com os headers do passo 03) que devolve NDJSON: `{t:'texto'}`, `{t:'reiniciar'}`, `{t:'fim', progresso, encerrado}`, `{t:'erro'}`. Se o modelo falha, a fala da pessoa já está gravada, e "Tentar de novo" manda `continuar`. Um 409 recarrega a página, para a tela mostrar só o que foi gravado.
- **Uma coisa por vez por sessão (`trava.ts`):** turno e "terminei" passam por `emSerie`, então o "terminei" espera o turno em andamento e nada grava no Corpus depois do fim. Um segundo turno simultâneo leva 409. A trava é em memória: basta para uma instância só no Railway; com mais de uma, trocar por advisory lock do Postgres.
- **"Pular esta"** pula o registro da última pergunta só se ele ainda está aberto. Se não está (a pergunta de importância depois de uma metric, por exemplo), grava só "a pessoa quer seguir" para o modelo. **"Continuar"** com a última pergunta já feita não chama o modelo.
- **Retomar:** a página carrega a conversa do banco. Se não há mensagem ou a última é da pessoa (o turno caiu), o chat pede a pergunta sozinho. Se a última pergunta tem mais de 5 min, ela aparece de novo depois de "Continuando de onde paramos", sem chamar o modelo.
- **Conferido no app** (`next build && next start`, Chrome headless pelo playwright-core fora do repo, 375 px, toque): primeira pergunta em streaming, resposta, "pular esta", aviso do "terminei" com 2 abertas, recarregar mantém a conversa, sem rolagem horizontal, log do servidor sem token.
- **Simulação:** `npm run simular -- <sabe-os-numeros|nao-sei|uma-palavra> [--turnos N]` (lê o `.env`; usa o banco de dev). Faz o import real do fixture e roda os turnos reais contra uma persona em Opus 5.5 effort `low` (`scripts/personas.ts`, gente e números inventados), que aperta os botões respondendo `[PULAR]` ou `[TERMINEI]`. No fim, as checagens do "Pronto quando" e mais uma ("nenhum enunciado com número inventado"); exit 1 se alguma falhar. As sessões ficam no banco de dev, com dados inventados.
- **Testes:** `numeros.test.ts` (sem banco) e `turno.test.ts` (banco e SDK falso com respostas roteirizadas): número recusado e aceito, estimativa só depois de repetida, mês não dito recusado, pular, limite duro, "não sei", latência, primeira resposta e encerrar.

## Achados

- **As notas do passo 04 erram o mínimo do cache:** no `claude-opus-5-5` é 512 tokens (skill `claude-api`, tabela de prompt caching), não 4096. O prompt de import (~1k tokens) poderia usar cache.
- **A persona simulada às vezes sai do papel:** fica cautelosa demais ("teria que confirmar") ou vaza lixo numa fala. Não afeta as checagens, mas alonga o interrogatório mais do que gente de verdade alongaria.
- **"um", "uma" e "meia" não são lidos como número** (`numeros.ts`): como artigo, estão em toda frase, e liberariam 1 e 30. Quem disser "uma vez por dia" por extenso não terá o 1 aceito; o modelo pergunta de novo.
- **A revisão do código (2026-10-14)** apontou e este passo corrigiu: "pular esta" ignorado sem foco ou aplicado a registro já fechado, `continuar` gerando pergunta que não era devida, "terminei" correndo junto com um turno, a resposta presa na tela num 409 e "não" aceito como confirmação de estimativa.
- **O que fica para o Daniel julgar no tom:** o modelo às vezes valida ("Isso é um resultado de verdade", "Simples não é defeito"). O prompt proíbe elogio vazio, mas permite ser gentil com a pessoa; a linha entre os dois é o que a leitura das transcrições decide.
- **Retomar repete a última pergunta só depois de 5 min fora** (`AUSENCIA_MS` em `conversa.tsx`). Repetir em todo recarregamento põe a mesma pergunta duas vezes seguidas na tela.
- **Para o passo 08:** `custoDaSessao` (`src/db/interrogatorio.ts`) já soma o custo por etapa, e cada pergunta tem `accomplishment_id`/`affiliation_id` para "as perguntas depois das quais a pessoa mais abandonou".
- **Para o passo 06:** o accomplishment `education` do próprio curso termina pulado (o prompt manda); o curso entra pela affiliation. Metrics guardam os números como a pessoa disse ("4" e "25" de "4h → 25min"); a unidade está no `texto`.
