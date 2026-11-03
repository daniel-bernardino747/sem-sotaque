# 10: Avaliador e assunto por vez

## Objetivo

O interrogatório deixa de gastar perguntas no que não entra no currículo. Num caso real, uma pessoa com experiência muito boa e formação genérica ouviu "e o seu ensino médio?" antes de chegar às experiências. A causa estava nas regras, e o modelo só as cumpriu: toda formação vira Affiliation (`src/import/extracao.ts:68`), uma Affiliation só fecha com mês/ano e descrição para estrangeiro (`src/interrogatorio/estado.ts:158`) e o prompt manda passar por todas as affiliations antes do primeiro accomplishment (`prompt.md:50`).

O interrogatório se divide em dois papéis:

- **o questionador**, o modelo que conversa. Ele vê **só o assunto atual** e não sabe o que vem depois;
- **o avaliador**, um classificador (o **Jev**, da TypeSafe) que roda em checkpoints. Ele decide se o assunto já rendeu o suficiente, qual vem a seguir com qual objetivo e quanto do currículo já está coberto.

Regras fixas no código definem o mínimo e o teto de cada registro. O avaliador decide a ordem e o "já tá bom" dentro desses limites.

## Ler antes

- `src/interrogatorio/` inteiro, principalmente `turno.ts`, `estado.ts`, `prompt.md` e o `ContextoFerramentas` de `ferramentas.ts`
- Notas do passo 05 (o turno, o cache, os limites de 8 e 10 perguntas, o que o servidor confere)
- `src/geracao/rascunho.ts` (`periodoDaAffiliation`) e `src/geracao/corpus.ts` (o que a geração faz com período e descrição que faltam)
- `../zap-bench/src/brains/jev.ts` e `../zap-bench/docs/adr/0002-quatro-cerebros-e-uma-camada-comum.md`: como chamar o Jev (`@typesafe-ai/sdk`, `client.systemOne({ state, questions })`, perguntas e critérios em inglês, preço por token). Copie o padrão; não importe de lá
- `../zap-bench/docs/produto/seguranca-e-lgpd.md` (a TypeSafe não tem política de retenção pública nem DPA)
- `src/conteudo/consentimento.ts` e `consentimento-v1.md` (versões imutáveis)
- `scripts/personas.ts` e o script `simular`
- Documentação atual do Jev em `docs.typesafe.ai`: modelo, preço e limites. Nunca de memória

## Decisões (grilling de 2026-10-20)

1. **Regras fixas mais avaliador.** As regras resolvem a formação sem gasto novo. O avaliador decide o que regra não julga.
2. **Accomplishments primeiro, do mais forte para o mais fraco.** As perguntas de uma affiliation (mês/ano, o que a empresa é, se o nome pode aparecer) vêm **ao terminar os accomplishments dela**, num bloco curto ("Antes de sair da Empresa Y: ...").
3. **Rede de segurança:** affiliation com período não confirmado usa no currículo o ano que veio do import (`periodo_original`) em vez de sair sem data.
4. **Formação:**
   - **ensino médio** nasce `pulado` se houver graduação, técnico ou qualquer experiência profissional. Técnico de TI (ETEC, IF) conta como formação;
   - **graduação e técnico** fecham com instituição, curso e **ano** de conclusão (ou "cursando" com a previsão). Sem mês e sem descrição para estrangeiro;
   - **"algo notável?"** (TCC, prêmio, monitoria) é perguntado uma vez, e só se a experiência profissional somar menos de 2 anos;
   - **bootcamp e curso livre** nascem `pulado`.
5. **O questionador vê só o assunto atual:** o accomplishment (enunciado, metrics, linha original), nome, cargo e stack da affiliation dele, o objetivo dado pelo avaliador e as mensagens desde que o assunto abriu. Não vê os outros registros, nem os títulos deles, nem o progresso. Para o que a pessoa disser e pertencer a outro assunto, ele tem a ferramenta `anotar_para_depois(texto)`.
6. **Quando o avaliador roda:** ao fim do turno, se houve um destes gatilhos:
   - uma metric gravada;
   - `concluir_assunto` (ferramenta nova: o questionador sugere, nunca decide);
   - a pessoa pulou;
   - o segundo "não sei" seguido;
   - **2 perguntas** no assunto sem nenhum dos gatilhos acima, de forma recorrente.

   `anotar_para_depois` não dispara checkpoint: a anotação espera o próximo. A decisão é **continuar** (com um objetivo novo), **trocar** ou **adiar**. O limite duro de 10 perguntas continua no servidor. O limite brando de 8 deixa de existir.
7. **Cobertura global:** o avaliador classifica a força de cada accomplishment (forte, médio ou fraco), e o código calcula uma cobertura de 0 a 100% que substitui o "3 de 9 coisas fechadas" na tela. Quando a cobertura passa do limiar, o questionador **oferece** o fim ("Já tenho o suficiente para um currículo forte. Quer parar aqui ou tem mais alguma coisa que você quer que entre?"). Se a pessoa seguir, os restantes vêm em ordem de força.
8. **Adiado:** um estado novo para o accomplishment que o avaliador trocou sem metric. Ele volta para a fila com prioridade baixa e **volta uma vez só**, sempre com o objetivo "um resultado qualitativo concreto ou pulado". Se a cobertura fechar antes, ele acaba pulado.
9. **O estado fica no banco:** uma tabela `plano` (uma linha por sessão, sobrescrita a cada checkpoint), com assunto atual, objetivo, fila, adiados, anotações e cobertura, mais **um evento por decisão** com o motivo em uma frase. A pessoa vê só a cobertura e a meia frase de transição.
10. **Backend: o Jev em todo lugar** (simulação, dev e produção), com uma interface de classificador: perguntas com nome → opções. O objetivo do questionador sai de um template montado com o que deu "não" ("falta: resultado; falta: como sabe"). Ninguém escreve texto livre.
11. **Privacidade:** o payload do Jev vai **pseudonimizado** (sem o nome e o contato da pessoa; empresas e clientes trocados por "Empresa A/B"). O servidor confere antes de enviar e **recusa a chamada** se encontrar o nome da pessoa ou o de qualquer organização do Corpus. O DPA não trava o deploy: o Daniel pede à TypeSafe quando isto virar produto.
12. **Consentimento v2:** sessões novas veem o v2, que cita a TypeSafe, diz o que vai para lá ("trechos das suas respostas, sem o seu nome nem o nome das empresas") e diz que o fornecedor não publica política de retenção. Sessões em `interrogando` com o v1 recebem o v2 na volta, com uma frase sobre o que mudou. Quem não aceitar segue no interrogatório sem avaliador. Sessões encerradas não mudam.
13. **Jev fora do ar** (erro, timeout, resposta inválida): uma tentativa rápida e, depois, regras de reserva só naquele checkpoint. Metric gravada → trocar; dois "não sei" → adiar; pulou → trocar; senão, continuar. A fila segue a ordem de força já conhecida e a cobertura não é recalculada. Cada falha vira evento.

## Fazer

1. **Regras fixas de formação** no import ou logo depois dele (decisão 4) e o novo critério de "fechada" para formação em `estado.ts`.
2. **Rede de segurança** em `src/geracao/rascunho.ts` (decisão 3).
3. **Migração:** tabela `plano`, o estado `adiado` (e se já voltou) no accomplishment, a versão do consentimento aceita por sessão, se ainda não houver.
4. **Cliente do Jev** em `src/llm/` (ou `src/avaliador/`), com o custo gravado em `chamadas_llm` como as outras etapas (`etapa: 'avaliador'`) e respeitando o teto por sessão. Variável `TYPESAFE_API_KEY`, também no `.railway/railway.ts` como `preserve()`.
5. **Pseudonimização e a checagem que recusa o payload** (decisão 11).
6. **O avaliador** em `src/avaliador/`, com as perguntas fechadas por assunto (o problema está claro? a contribuição pessoal está clara? há resultado? ela disse como sabe?), a decisão continuar/trocar/adiar, a força de cada accomplishment, a escolha do próximo assunto, o tratamento das anotações e as regras de reserva.
7. **O turno com assunto por vez:** `turno.ts` monta o contexto só do assunto atual (decisão 5), dispara o checkpoint pelos gatilhos (decisão 6), e as ferramentas novas `concluir_assunto` e `anotar_para_depois` entram. `focar` sai ou passa a só aceitar o assunto atual. O `prompt.md` é reescrito para esse recorte: sai "a ordem" e sai "o estado da sessão"; entra o objetivo e o bloco de affiliation no fim da empresa.
8. **A oferta de fim** quando a cobertura passa do limiar, e a tela com a cobertura em %.
9. **Consentimento v2** e o re-aceite das sessões v1 em andamento (decisão 12).
10. **Painel:** a linha do tempo das decisões do avaliador (checkpoint, decisão, motivo, cobertura, falhas do Jev) ao lado da transcrição da sessão.
11. **Persona `cv-forte`** em `scripts/personas.ts`: 3 empresas boas, ~10 accomplishments, graduação genérica e ensino médio no CV. Ela sabe os números das coisas fortes e não sabe os das fracas. As checagens dela entram no script `simular`.
12. A chave da TypeSafe: peça ao Daniel quando precisar dela (ele tem). O pedido de DPA e de política de retenção fica para quando o sem-sotaque virar produto; no v0 é teste da engine.

## Fora do escopo

Um segundo backend para o avaliador (decisão 10). Mudar a geração além da rede de segurança. Reescrever o import além das regras de formação.

## Pronto quando

- [x] A persona `cv-forte` termina com, checado pelo script:
  - zero perguntas sobre ensino médio e no máximo uma sobre formação;
  - a primeira pergunta sobre um accomplishment;
  - toda empresa que vai para o currículo com o mês confirmado ou com o ano do import;
  - o fim oferecido antes de esgotar os registros;
  - nenhum assunto com mais de 10 perguntas;
  - nenhum número inventado (as checagens do passo 05).
- [x] As 3 personas do passo 05 rodam de novo e são comparadas com as de 14/10 em turnos, custo e cobertura. `nao-sei` e `uma-palavra` não pioram. **Peça o sim do Daniel, com o custo estimado (~US$ 4 nas quatro), antes de rodar**
- [x] Testes sem modelo: o ensino médio nasce pulado; a formação fecha com o ano; cada gatilho dispara o checkpoint; o adiado volta uma vez só; a rede de segurança no rascunho; o payload com nome de pessoa ou de organização é recusado; o Jev fora do ar cai nas regras de reserva; o questionador não recebe nada de fora do assunto atual
- [x] Consentimento v2 publicado e o re-aceite de uma sessão v1 em andamento testado
- [x] O painel mostra a linha do tempo do avaliador de uma sessão simulada
- [x] O Daniel leu a transcrição da `cv-forte` e aprovou. **Peça a ele antes de marcar `feito`**
- [x] Custo por sessão (questionador mais Jev) e quantas vezes o Jev caiu anotados nas notas

## Notas de implementação

**Estado:** feito em 2026-10-21. PR #1. O Daniel leu a transcrição da `cv-forte` e aprovou. O painel mostrou a linha do tempo da sessão simulada (servidor local, token de teste).

**Rodadas pagas de 2026-10-21** (custo do produto, sem a persona; comparadas com 14/10):

| persona | 14/10 | passo 10 | Jev |
|---|---|---|---|
| `cv-forte` | — | 19 turnos, US$ 0,43 (Jev US$ 0,0008), cobertura 70%, ofereceu o fim | 15 checkpoints, 0 falhas |
| `sabe-os-numeros` | 23 turnos, US$ 0,88 | 29 turnos, US$ 0,65 | 28 checkpoints, 0 falhas |
| `nao-sei` | 19 turnos, US$ 0,54 | 14 turnos, US$ 0,26 | 13 checkpoints, 0 falhas |
| `uma-palavra` | 45 turnos, US$ 1,30 | 53 turnos, US$ 0,78 | 32 checkpoints, 0 falhas |

O questionador é ~85–90% do custo; o Jev, ~US$ 0,001 por sessão. As rodadas acharam três bugs, corrigidos com teste: o `.int()` do zod 4 emite `minimum`/`maximum`, que o modo strict recusa; a anotação que virou registro não ficava ligada a ele, e a mesma fala virou três registros (o Pix na `sabe-os-numeros`); um resultado dito e não gravado deixava o objetivo pedindo "como sabe" em vez de gravar (a `uma-palavra` piorou em turnos por isso). O passo 11 tira chamadas e corrige o que ainda apareceu.

- **Migração `0007_avaliador`:**
  - Tabela `plano`, uma linha por sessão: assunto atual (com objetivo e `desde`), fila, anotações, visitados, cobertura, `oferta_feita` e `ultimo_checkpoint`.
  - Tabela `decisoes_avaliador`: gatilho, assunto, decisão, motivo, cobertura, próximo, backend (`jev` ou `reserva`) e erro.
  - Colunas novas: `affiliations.tipo` (`emprego`, `graduacao`, `tecnico`, `ensino_medio`, `curso_livre`), `ano_conclusao` e `cursando`; `accomplishments.forca`, `adiado` e `adiado_voltou`; `sessoes.recusou_avaliador_em`. O enum `etapa_llm` ganhou `avaliador`.
  - As duas tabelas novas entram no `apagarSessao`. A versão do consentimento por sessão já existia (`texto_consentimento_versao`).
- **Formação (`src/import/formacao.ts`):** o import diz o `tipo` de cada affiliation, e `aplicarRegrasDeFormacao` roda antes de gravar.
  - Ensino médio nasce pulado se houver graduação, técnico ou emprego.
  - Curso livre nasce pulado.
  - O registro do próprio curso (`education` sob a formação) nasce pulado.
  - O que foi feito na formação nasce pulado quando o emprego soma 2 anos ou mais (`mesesDeExperiencia`, sem contar sobreposição).
  - Graduação e técnico fecham com o ano (`ano_conclusao`, lido do `periodo_original`). "Atual" ou "previsão" vira `cursando`.
  - **Desvio:** a decisão 4 não manda pular o que foi feito na formação de quem tem 2 anos ou mais. Pular é o que faz o "algo notável" existir só abaixo de 2 anos.
  - Sessões em andamento antes da migração ficam com tudo `emprego`.
- **Rede de segurança (`periodoDaAffiliation`):** com mês confirmado, como antes. Sem ele, saem os anos do `periodo_original` ("2019 - 2021", "2022 - Present", "2023"). A formação sai pelo ano ("2018", "Expected 2027"). A checagem de período em `checagens.ts` passou a aceitar essas formas; sem isso, a geração reescreveria em loop. `regras-de-redacao.md` foi atualizado.
- **O Jev (`src/avaliador/jev.ts`):**
  - `@typesafe-ai/sdk` 0.6.0, modelo `jev-1.13.0`: o `jev-latest` de 2026-10-20 (o 1.14 era o `jev-preview`).
  - Preço: US$ 0,042 por milhão de tokens de entrada; a saída não é cobrada (docs.typesafe.ai/models).
  - Timeout de 8 s e uma nova tentativa. Cada tentativa vira uma linha em `chamadas_llm` (`etapa: avaliador`), e o teto da sessão vale.
  - Uma resposta que não cabe nas perguntas (nome faltando, rótulo que não foi oferecido) conta como falha.
  - Sem `TYPESAFE_API_KEY`, toda chamada falha e cai na reserva. O `simular` recusa rodar sem a chave.
  - A variável está no `.env.example` e como `preserve()` no `.railway/railway.ts`. **Antes do deploy, criar a variável no Railway e rodar `railway config plan`/`apply`.**
- **Pseudonimização (`src/avaliador/pseudonimo.ts`):**
  - As organizações do Corpus viram "Empresa A/B…": o nome inteiro e cada palavra própria dele, sem diferenciar maiúsculas nem acentos. Palavras genéricas ("Pagamentos", "Universidade") ficam.
  - O nome da pessoa vira `[pessoa]`; ele sai da primeira linha do currículo, quando ela parece um nome.
  - E-mail, telefone e link são trocados.
  - `classificarProtegido` confere o payload final e recusa a chamada (`ErroClassificador('payload')`) se sobrar nome, e-mail, telefone ou link.
- **O plano (`src/avaliador/plano.ts`, funções puras):**
  - Ordem: anotação nova; o bloco da empresa logo depois do último accomplishment dela; accomplishments por força (forte, médio, fraco; sem força conta como médio) e na ordem do currículo; os blocos que faltam; a formação; os adiados, uma vez cada.
  - Cobertura = peso (3/2/1) dos que têm metric ÷ peso dos não pulados. O limiar é 70% (`LIMIAR_COBERTURA`).
  - Os objetivos saem de templates ("falta: resultado").
- **O checkpoint (`src/avaliador/index.ts`):**
  - `iniciarPlano` roda no primeiro turno e pede a força de todos numa chamada só.
  - `checkpoint(gatilho)` pergunta ao Jev: problema, contribuição, resultado e como sabe (noul); a decisão (choice continue/move_on/postpone); a força (score); e o destino de cada anotação pendente.
  - Regras do código sobre a resposta:
    - pulou e criou forçam trocar;
    - registro com metric que troca fecha;
    - sem metric, vira adiado, e o adiado que já voltou vira pulado;
    - anotação sobre nada vira `descartada`;
    - formação fechada sai depois de uma pergunta.
  - Reserva, quando o Jev falha: a tabela da decisão 13, sem recalcular a cobertura. Na resposta à oferta, um "pode parar" ou "chega" encerra.
  - Sessão sem o v2 usa sempre a reserva, sem erro, e recalcula a cobertura (não houve falha). A oferta de fim só acontece com o Jev.
  - `pularAdiados` roda no `encerrarInterrogatorio`.
- **O turno (`src/interrogatorio/turno.ts`):**
  - O questionador recebe `<assunto>` (de `descreverAssunto`), `<objetivo>` e as mensagens desde que o assunto abriu.
  - As ferramentas não têm mais refs: todas agem sobre o assunto atual. Saíram `focar`, `ligar_linha_original` e o motivo `tudo_fechado`. Entraram `concluir_assunto` e `anotar_para_depois`. `criar_affiliation` e `criar_accomplishment` só valem num assunto de anotação.
  - Checkpoints antes do modelo: pulou, limite de 10 perguntas (vale para qualquer assunto), resposta à oferta, 2 perguntas desde o último checkpoint.
  - Checkpoints depois de cada rodada de ferramentas: metric, pulou, criou, segundo "não sei", concluir. No máximo 3 por turno.
  - **Desvio da decisão 6 ("ao fim do turno"):** o checkpoint roda depois das ferramentas e antes de a pergunta ser gravada. Se ele troca o assunto, o texto já transmitido é descartado (`reiniciar`) e o modelo reabre no assunto novo. Rodar depois da pergunta faria a pessoa responder sobre um assunto já encerrado.
  - A oferta de fim e as despedidas são textos fixos (`OFERTA_DE_FIM`, `DESPEDIDA_DO_FIM`), sem modelo. O evento `terminou` ganhou `por: 'avaliador'`.
  - A importância deixou de ser pergunta obrigatória: entra no objetivo como "se sobrar".
- **Anotação:**
  - **Desvio da decisão 5:** num assunto de anotação, o questionador vê os nomes das empresas da pessoa (`<empresas_da_pessoa>`), para ligar o registro novo a uma delas.
  - Criar um registro abre esse registro como o próximo assunto, pelo gatilho `criou`, que não está na decisão 6.
- **Consentimento v2:**
  - `consentimento-v2.md` diz que vai para a TypeSafe e o que vai (sem nome nem empresas), que ela diz não treinar com o que recebe, que não publica por quanto tempo guarda e que apagar aqui não apaga o que já foi para lá.
  - Sessões em `interrogando` com o v1 veem a tela `reconsentimento` (`MUDOU_NO_V2` e o texto).
  - "Sim" grava o v2 e um `consentiu` com `reaceite: true`. "Não" grava `recusou_avaliador_em`, e o chat segue sem o Jev.
  - A rota do chat devolve 409 enquanto a resposta falta.
- **Tela e painel:**
  - O chat mostra "Currículo X% coberto". O aviso do "terminei" segue contando o que está aberto.
  - Na página da sessão no painel, as decisões do avaliador aparecem entre as mensagens: gatilho, decisão, motivo, cobertura, backend e erro do Jev. Há um resumo de checkpoints e falhas, e o Corpus mostra força, adiado e tipo.
- **Simulação:**
  - Persona `cv-forte` (`src/llm/__fixtures__/forte.txt`, gente inventada): 3 empresas, 10 accomplishments, graduação genérica e ensino médio.
  - O `simular` checa, em todas as personas, que a primeira pergunta é sobre um accomplishment.
  - Na `cv-forte`, checa também: zero perguntas sobre ensino médio; no máximo uma sobre formação; toda empresa com resultado tem o mês confirmado ou o ano do import; a oferta de fim foi registrada.
  - A transcrição traz as decisões do avaliador entre as mensagens.

## Achados

- **A premissa da decisão 11 mudou:**
  - A TypeSafe publica um DPA (`typesafe.ai/legal/data-processing`, atualizado em 2026-04-24), incorporado ao contrato que se aceita ao criar a conta (MCA 4.4), com as SCCs da UE.
  - O período de retenção continua sem publicação ("as long as necessary").
  - Não treina com os dados do cliente sem consentimento. Hospedagem nos EUA.
  - O `consentimento-v2.md` diz só o que continua verdade. Vale atualizar `../zap-bench/docs/produto/seguranca-e-lgpd.md`.
- **Trava por sessão:** turno e "terminei" passam por `emSerie`, então `iniciarPlano` e `checkpoint` não correm em paralelo numa instância só. Com mais de uma instância, o plano precisa do mesmo advisory lock que o passo 05 já previu.
- **Nome da pessoa fora da primeira linha do currículo:** a pseudonimização não o protege. O nome digitado no cabeçalho só existe depois do interrogatório.
- **`emprego` como valor de `tipo_affiliation`:** o `CONTEXT.md` lista "emprego" entre os termos a evitar para Affiliation. Aqui o termo nomeia um tipo de Affiliation, não a Affiliation; renomear custa uma migração.
