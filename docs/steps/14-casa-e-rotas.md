# 14: A casa da pessoa e as rotas

## Objetivo

O link `/s/<token>` deixa de ser um fluxo de mão única (consentimento → import → chat → resultado → fim) e passa a abrir a **casa** da pessoa: a página de onde ela retoma a conversa, vê o currículo geral e, a partir do passo 15, cria um currículo por vaga. É a parte 2 do produto, decidida num grilling com o Daniel em 2026-10-26/27 (as decisões estão em `docs/decisoes.md`, "Parte 2").

Este passo entrega a casa **sem vagas**: o botão "Achei uma vaga" aparece, mas ainda não leva a lugar nenhum. O que já vale sozinho é voltar a conversar depois do currículo pronto e gerar o currículo geral de novo quando o Corpus mudou.

## Ler antes

- `docs/decisoes.md`, a seção "Parte 2", e `CONTEXT.md` (Sessão, Casa, Fila aberta)
- `src/app/s/[token]/page.tsx` e as telas em `_telas/`, `src/sessao/tela.ts`, `src/app/s/[token]/acoes.ts`, as rotas `chat/`, `fim/` e `pdf/`
- `src/avaliador/plano.ts` (`ordem`, `proximoAssunto`, os tipos de Assunto) e `src/interrogatorio/turno.ts`
- `src/db/schema.ts` (`sessoes`, `geracoes`, `selections`, `renders`) e `src/db/geracao.ts`
- `src/geracao/pipeline.ts` e `segundo-plano.ts`
- `DESIGN.md` (a cédula cobalto: tela de trabalho × tela de cerimônia)
- A documentação do Next 16.1.6 instalado sobre rotas dinâmicas aninhadas, `params` como Promise e `redirect` em server actions, antes de criar as rotas

## Decisões (grilling de 2026-10-26/27)

1. **O link é a conta.** Sem login. Tudo o que a pessoa tem fica na Sessão dela (P2, P3).
2. **A casa é a primeira tela desde o começo** (P4), depois do consentimento (e do re-aceite, quando houver). Quem ainda não importou vê "Começar pela sua carreira" como ação principal, que leva ao import.
3. **"Achei uma vaga" espera o interrogatório geral** (P5): fica visível, mas desabilitada com uma frase do motivo, até a Cobertura passar de 70% ou existir um currículo geral. Neste passo ela fica desabilitada sempre (as vagas entram no 15), com a mesma frase.
4. **Retomar a conversa** (P6) cobre a **Fila aberta**: rascunhos primeiro, depois pulados e adiados. Mais "Contar algo novo", que abre um Assunto novo na frente da fila (um Accomplishment que ainda não existe).
5. **O currículo geral é uma foto** (P7): "Gerar de novo" sob demanda e o aviso "Seu Corpus mudou" quando há Accomplishment ou Metric mais novo que a última geração. As versões antigas ficam no histórico.
6. **A ordem da casa** (P17):
   1. saudação e Cobertura em %, com os carimbos;
   2. "Achei uma vaga" (principal) e "Continuar a conversa" (com o número em aberto e o link "Contar algo novo");
   3. Candidaturas (vazio até o passo 18);
   4. o currículo geral, com o aviso e "Gerar de novo";
   5. rodapé "Apagar meus dados".

   O fim do v0 (fundador, indicação, opinião) continua na página do currículo geral.
7. **Rotas de verdade** (P23), cada uma decidindo o que mostrar pelo próprio estado:
   - `/s/<token>`: a casa;
   - `/s/<token>/conversa`: o chat geral;
   - `/s/<token>/curriculo`: o currículo geral, o histórico, "Gerar de novo" e o fim do v0;
   - `/s/<token>/pdf?v=<n>`: o PDF de uma versão (sem `v`, a última).

   Toda rota resolve o token primeiro. As rotas de vaga entram no passo 15.

## Fazer

1. **O estado da sessão vira marco do funil, não trava de tela.** `estado` continua registrando até onde a pessoa chegou no v0 (o funil e os critérios do painel leem a ordem dos estados, `src/admin/funil.ts:96`), mas deixa de decidir a tela: `src/sessao/tela.ts` passa a responder "o que falta antes da casa" (consentimento, re-aceite) e o resto se decide por rota. **O `estado` nunca desce**: nada desta parte volta uma sessão de `encerrado` ou `pronto` para um estado anterior. Os testes de `tela.ts` e do funil mudam junto.
2. **A conversa retomada.** Hoje `turno()` e `chat/route.ts` recusam fora de `interrogando` (`turno.ts:234`, `chat/route.ts:34`), e todo fim (a oferta, a despedida, o teto, o avaliador) chama `encerrarInterrogatorio`, que roda `pularAdiados` (`turno.ts:195-199`). Defina o **modo retomada** (sessão depois de `interrogando`):
   - o turno aceita `pronto` e `encerrado`;
   - os caminhos de fim voltam para a casa sem `pularAdiados` e sem `terminarInterrogatorio`, e não mexem no `estado`;
   - a fila de retomada inclui os pulados (hoje `ordem`/`aberto` os deixam de fora, `plano.ts:98-99`). Um pulado reaberto só perde o `pulado` quando a pessoa responde; se ela pular de novo, ele continua pulado;
   - um adiado que já voltou (`adiadoVoltou`) recebe o objetivo normal, não o "só qualitativo" (`plano.ts:156`);
   - ao abrir a retomada, `ofertaFeita` volta a `false` e o `assunto` nulo é recalculado pela fila;
   - a Cobertura é recalculada como hoje e pode cair quando um pulado volta. Por isso o portão de "Achei uma vaga" (decisão 3) **não fecha depois de aberto**: abriu uma vez, fica aberto.

   A lista "quem parou" do painel (`src/db/painel.ts:180`) lê só `interrogando`: conte também as retomadas abandonadas, ou registre nos Achados que elas somem dali.
3. **Geração com histórico.** Hoje `geracoes` tem `sessao_id` como chave: uma por sessão. Ela passa a ter `id` próprio, uma linha por geração, com `sessao_id` e um número de versão, e **`selections` ganha `geracao_id`** (hoje `proximaTentativa` e `tentativasDaSessao` contam todas as selections da sessão juntas). O cabeçalho que a pessoa digitou (nome, e-mail, LinkedIn, GitHub, local) sai para uma tabela `cabecalhos`, uma por sessão, pedida uma vez e editável antes de cada geração.
   - **A migração é escrita à mão**: o diff do drizzle para troca de chave primária numa tabela com linhas não serve. Ela acrescenta `id`, põe `versao = 1` nas linhas que existem, copia o cabeçalho para `cabecalhos` e liga as selections existentes à geração da sessão. Teste a migração num banco com uma sessão em `pronto`.
   - **Os outros leitores de `geracoes`** passam a ler a última geração: `src/db/painel.ts:75` (`revisar`, `erro`), `curriculoEntregue` (`src/db/geracao.ts:116-128`) e `garantirGeracao` (`segundo-plano.ts:24`).
   - `apagarSessao` e o teste que varre `sessao_id` cobrem `cabecalhos`.
4. **A geração deixa de depender do `estado`.** Hoje `gerarCurriculo` (`pipeline.ts:398`), `gravarCabecalho` e `gravarTentativa` (`src/db/geracao.ts:37,75`) exigem `estado = 'gerando'`, e `entregarSelection` move `gerando`→`pronto` (`geracao.ts:98`). Elas passam a receber um `geracao_id` e a conferir a geração (existe, é da sessão, não terminou, sessão não apagada). A entrega grava `terminada_em` na geração e só sobe o `estado` (`gerando`→`pronto`) na primeira; nunca o baixa.
5. **"Gerar de novo"** roda o pipeline numa geração nova, em segundo plano, como hoje. Uma geração em andamento bloqueia outra.
6. **"Seu Corpus mudou".** `accomplishments`, `metrics` e `affiliations` não têm data de mudança (`schema.ts:240,263`). Uma migração acrescenta `atualizado_em` às três, gravado pelas funções do banco que as escrevem (`atualizarAccomplishment` e as de Metric e de stack). O aviso compara o maior `atualizado_em` das três com o `iniciada_em` da última geração.
7. **A Fila aberta e "Contar algo novo"** em `src/avaliador/plano.ts`: a fila de retomada (rascunhos, depois pulados, depois adiados) e um tipo de Assunto novo para "Contar algo novo", que o questionador abre perguntando o que a pessoa quer contar e fecha criando o Accomplishment pelas ferramentas que já existem. Pulados e adiados reabertos voltam com o objetivo de sempre; o limite de 10 perguntas por assunto continua.
8. **As rotas e as telas** (decisão 7). A tela de resultado e o fim do v0 vão para `/curriculo`. `page.tsx` vira a casa. As server actions de hoje continuam, com `redirect` para a rota certa.
9. **O texto novo da casa** (saudação, os rótulos, a frase de "Achei uma vaga" desabilitada, o aviso "Seu Corpus mudou") segue `docs/regras-de-redacao.md` e **vai para o Daniel antes de aplicar**.
10. **A casa na cédula:** é tela de cerimônia na abertura (saudação e Cobertura) e de trabalho no resto. Os componentes e tokens do passo 13; nada de cor fixa.

## Fora do escopo

Vagas, candidaturas e consentimento v3 (passos 15 a 18). Mudar o pipeline de geração além de "várias gerações por sessão". Editar o Corpus fora da conversa.

## Pronto quando

- [x] Um link novo abre o consentimento e, depois dele, a casa com "Começar pela sua carreira".
- [x] Uma sessão em `pronto` ou `encerrado` abre a casa, entra em `/conversa`, responde a um rascunho e a uma "Contar algo novo", e o Accomplishment novo aparece no Corpus.
- [x] Depois disso, `/curriculo` mostra "Seu Corpus mudou"; "Gerar de novo" cria a versão 2, e a versão 1 continua abrindo em `/pdf?v=1`.
- [x] Gerar de novo numa sessão em `encerrado` deixa `estado = encerrado` e o funil do painel igual (teste).
- [x] Na retomada, a oferta de fim e a despedida voltam para a casa e nenhum adiado vira pulado (teste).
- [x] A migração de `geracoes` roda num banco com uma sessão em `pronto`, e o PDF dela continua abrindo como versão 1.
- [x] Uma sessão v1 em `interrogando` ainda passa pelo re-aceite antes da casa.
- [x] "Achei uma vaga" aparece desabilitada, com a frase do motivo.
- [x] Sem scroll lateral a 360px em nenhuma das rotas novas.
- [x] `npm run typecheck` e `npm test` passam; o teste de `apagarSessao` cobre `cabecalhos` e as gerações novas.
- [x] Nenhuma chamada paga: o que precisar do modelo roda com `LLM_BACKEND=assinatura`.

## Notas de implementação

- **Migrações:** `0008_geracoes-com-historico.sql` é escrita à mão (troca a chave de `geracoes`, cria `cabecalhos`, liga `selections.geracao_id`, `atualizado_em` nas três tabelas do Corpus preenchido com o `created_at`, para nenhuma sessão pronta ver o aviso à toa). O snapshot `0008` saiu do drizzle-kit em duas gerações (só adições, depois só remoções, porque o `generate` pede confirmação interativa quando uma tabela ganha e perde colunas na mesma vez) fundidas numa entrada só; `drizzle-kit generate` diz "No schema changes" depois dela. `0009_retomada.sql` (gerada) acrescenta `plano.retomados`. O teste `src/db/migracao.test.ts` cria o banco `<teste>_migracao`, migra até a 0007, grava uma sessão em `pronto` no formato antigo e aplica o resto (`migrar(url, pasta)` ganhou a pasta como parâmetro). Rodei a 0008 no banco de dev: as sessões em `pronto` viraram versão 1 e o PDF abriu em `/pdf?v=1` com o mesmo md5.
- **Geração:** `src/db/geracao.ts` trabalha por `geracao_id`: `criarGeracao` (null sem cabeçalho, sessão apagada ou outra em andamento), `gravarTentativa` e `entregarSelection` conferem a geração, e a entrega só sobe `gerando` → `pronto`. `gerarCurriculo(sessaoId, geracaoId)`. `segundo-plano.ts` ganhou `novaGeracao`. `curriculoEntregue(sessao, versao?)`, `versoesEntregues`, `corpusMudou`. O `pdf_gerado` leva a `versao` nos dados. `npm run gerar -- <persona> --de-novo` agora cria uma versão nova em vez de mexer no estado.
- **`atualizado_em`:** muda em `atualizarAccomplishment` só nos campos de conteúdo (`enunciado`, `importanciaParaPessoa`, `affiliationId`, `data`), nunca em `forca`/`adiado`/`adiadoVoltou`/`pulado` (contabilidade do avaliador); em `atualizarAffiliation` em tudo menos `pulado`; Metric só nasce (default).
- **Retomada:** `emRetomada(estado)` (em `src/avaliador`) é "depois de `interrogando`". O turno aceita `pronto` e `encerrado` (`gerando` continua recusado: o currículo vem antes). `retomar(sessaoId)` (ação "Continuar a conversa") zera `ofertaFeita` e `retomados` e recalcula o assunto se ele não está mais em aberto; `contarAlgoNovo` abre o tipo de Assunto `novo`, que cria registro como a anotação (`criar_accomplishment`/`criar_affiliation`). `retomados` guarda o que a retomada abriu, para um pulado pulado de novo não voltar na mesma retomada; um adiado volta uma vez nela, e um adiado que ela deixou sem resultado volta na próxima. Na retomada o limite de 10 perguntas conta desde que o assunto reabriu. As despedidas da retomada são `DESPEDIDA_DA_RETOMADA` e `DESPEDIDA_DO_TETO_NA_RETOMADA`.
- **Rotas:** `/s/<token>` (consentimento, re-aceite ou a casa), `/conversa` (import, chat, retomada; `gerando` vai para `/curriculo`; retomada sem assunto volta para a casa), `/curriculo`, `/pdf?v=<n>`. `_sessao.ts` resolve o token das sub-rotas; `_telas/moldura.tsx` é a faixa e o "apagar". `PageProps<…>` exige o `.next/types` gerado; mantive o tipo explícito do `params`, como o resto do repositório, para o `typecheck` não depender de um build antes.
- **Textos:** os da casa, do `/curriculo` e da retomada foram aprovados pelo Daniel em 2026-10-27 como estavam. "Achei uma vaga" fica sempre desabilitada (vazada, para o prata ir para a ação que dá para tocar); **o portão que "não fecha depois de aberto" (decisão 3) fica para o passo 15**, quando o botão abre.
- **Verificação:** dev com `LLM_BACKEND=assinatura` e as chaves pagas em branco (o Jev caiu na regra de reserva). Num Chrome headless a 360px: link novo → consentimento → casa com "Começar pela sua carreira"; sessão `pronto` → "Continuar a conversa" → respondeu um rascunho → "Contar algo novo" criou um Accomplishment e o perguntou em seguida → `/curriculo` com o aviso → "Gerar de novo" fez a versão 2, `/pdf?v=1` igual, estado `pronto`, nenhum `terminou` novo. Sem rolagem lateral em nenhuma rota. Nenhuma chamada paga.

## Achados

- **"Quem parou" do painel** (`ultimasPerguntasDasParadas`, `src/db/painel.ts`) lê só `interrogando`: uma retomada abandonada (em `pronto`/`encerrado`) some dali. Contar exigiria distinguir o assunto que sobrou de um "Terminei" do v0, que também deixa `plano.assunto` preenchido.
- **Sessão v1 depois do interrogatório:** o re-aceite só vale em `interrogando`; uma sessão v1 em `pronto` que retoma a conversa segue sem o Jev (regras de reserva). Pedir o re-aceite também na retomada?
- **Teto de gasto na retomada:** uma sessão que gastou o teto no interrogatório ouve `DESPEDIDA_DO_TETO_NA_RETOMADA` a cada turno, e a casa continua oferecendo "Continuar a conversa".
- **"Seu Corpus mudou" não vê remoção** (compara o maior `atualizado_em`), e Metric não tem caminho de update hoje.
- **`selections.geracao_id` é nullable** depois do backfill (os fixtures de teste gravam selection antes de ligar a geração). Dá para pôr `not null` num passo futuro.
- **O painel admin** mostra as tentativas de todas as versões juntas e só a última geração como entregue; não diz de qual versão é cada tentativa.
- **`/favicon.ico` dá 404** em toda página (já antes deste passo).
- **`descreverAssunto`** diz "ele volta uma vez só" para um `adiadoVoltou`, o que na retomada não é bem verdade, e não conta ao questionador que um pulado reaberto foi pulado antes.
- **O `funil.test.ts` não mudou:** o funil já lia a ordem dos estados e nada aqui faz o estado descer; o "funil igual depois de gerar de novo em `encerrado`" está em `src/geracao/pipeline.test.ts`.
