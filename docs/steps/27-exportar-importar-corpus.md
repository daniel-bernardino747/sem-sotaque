# 27: Exportar e importar o Corpus

## Objetivo

A pessoa baixa o próprio Corpus num arquivo e o importa em outra instância: do hospedado para o self-host, de volta, ou numa conta nova. Quem quer mostrar o Corpus a alguém (por exemplo, para uma análise fora do app) exporta e manda o arquivo: não existe outro caminho para o Corpus sair, e o painel não ganha botão de exportar.

## Ler antes

- `docs/decisoes.md`, "Exportar e importar o Corpus" (C1–C9)
- `CONTEXT.md`: Corpus, Affiliation, Accomplishment, Metric, Linha Original, Cobertura, Fila aberta
- `src/db/schema.ts`: `affiliations`, `accomplishments`, `metrics`, `linhas_originais`, `importacoes` (e o enum `formato_importacao`), `cabecalhos`, `sessoes.estado`
- `src/db/index.ts`: `gravarImportacao` (a transação do import do PDF e a passagem para `importou`)
- `src/import/index.ts` e `src/app/casa/_telas/importar.tsx`: a porta de entrada de hoje
- `src/assinatura/acesso.ts` (`temAcesso`), `src/app/casa/_telas/assinar.tsx`, `sem-acesso.tsx` e `apagar-dados.tsx`
- `src/conteudo/privacidade.md`, "Os seus direitos"

## Decisões (grilling de 2026-11-08)

1. **A pessoa leva o próprio Corpus** (C1). Passar o Corpus a outra pessoa é ela exportar e mandar o arquivo. Nada no `/admin`.
2. **O que vai no arquivo** (C2): as Affiliations (a formação inclusa, pelo `tipo`), os Accomplishments, as Metrics (com a `origem` e a `ancora`), as Linhas Originais, o cabeçalho e o estado de cada registro (`forca`, `pulado`, `adiado`, `adiado_voltou`, `periodo_confirmado`). **Não vão:** as Anotações (o `plano`), a transcrição (`mensagens`), o texto extraído do import, as Vagas, as gerações e os PDFs. Os ids do banco não saem: cada registro tem uma `ref` do arquivo e ganha um id novo ao entrar.
3. **Só em Corpus vazio** (C3): importar é uma terceira porta na tela de importar, ao lado do PDF e do texto. Quem já tem Corpus não vê a opção. Sem substituir nem mesclar.
4. **O formato** (C4): um `.json` só, com o envelope `formato: "sem-sotaque/corpus"`, `versao: 1` e `exportadoEm`. Os campos têm os nomes do `CONTEXT.md` (o arquivo também é lido direto, fora do app). Um schema zod repete as regras do banco: `estimado` tem `ancora`, `confidencial` tem `descricao_publica`, as datas são `YYYY-MM`, toda `ref` aponta para algo no arquivo. Arquivo inválido é recusado inteiro, com a razão, numa transação só. Versão desconhecida é recusada; uma mais antiga, quando existir a v2, é migrada no código.
5. **O arquivo é aceito como está, com a procedência** (C5): a importação grava uma linha em `importacoes` com o `formato` novo `corpus` e o arquivo inteiro em `texto_extraido`. Sem assinatura do arquivo e sem reconfirmar as Metrics.
6. **Exportar não depende da Assinatura** (C6): "Baixar meu Corpus" fica na casa e na tela de quem não tem acesso, e "Apagar meus dados" oferece baixar antes de apagar. **Importar fica atrás do `temAcesso`**, como o PDF (no `MODO=local`, sempre).
7. **Depois de importar** (C7): o consentimento continua obrigatório antes (é desta instância, não viaja no arquivo). A Sessão vai para `importou`, como no PDF; a Cobertura sai da `forca` e das Metrics que vieram, e "Continuar a conversa" retoma a Fila aberta. O cabeçalho do arquivo só é gravado se a Sessão não tiver um.
8. **O nome real das confidenciais vai no arquivo** (C8), e a tela de exportar avisa, só quando houver alguma: "O arquivo traz o nome das empresas marcadas como confidenciais. Só mande para quem pode saber." Sem a opção de omitir.

## Fazer

1. **O formato** (`src/corpus-arquivo/` ou outro nome, a escolher): o tipo, o schema zod, `exportarCorpus(sessaoId)` → o objeto, e `lerArquivoDeCorpus(texto)` → o objeto validado ou o erro com a razão em português. Teste primeiro (`tdd`), com uma pessoa inventada: ida e volta (exportar, importar numa Sessão nova, exportar de novo dá o mesmo arquivo, a menos de `exportadoEm`), e cada regra do schema recusando o seu caso.
2. **A migração:** `ALTER TYPE formato_importacao ADD VALUE 'corpus'` (`npm run db:generate`, revise o SQL).
3. **A gravação:** `importarCorpusDeArquivo(sessaoId, arquivo)` em `src/db/`, numa transação: recusa se a Sessão já tem Affiliation ou Accomplishment, ou se não consentiu; grava os registros com ids novos, ligando as refs; grava o cabeçalho se não houver; grava a linha em `importacoes`; põe a Sessão em `importou`.
4. **As telas:** a porta "Tenho um arquivo do sem-sotaque" na tela de importar; "Baixar meu Corpus" na casa e na tela sem acesso (uma rota que devolve o `.json` com `Content-Disposition: attachment`, só para a Conta dona, nome do arquivo sem o nome da pessoa, por exemplo `corpus-sem-sotaque-2026-11-08.json`); a oferta em "Apagar meus dados"; o aviso das confidenciais. Siga o `DESIGN.md`. Ao ler o `modo()` numa página nova, confira se ela é dinâmica (nota do passo 23).
5. **O `CONTEXT.md`:** no Corpus, "só o interrogatório escreve nele" passa a "só o interrogatório e o import (do currículo ou de um arquivo) escrevem nele"; e um termo novo, **Arquivo do Corpus**.
6. **A privacidade:** em "Os seus direitos", a cópia deixa de ser pedido por e-mail e vira o botão. **O texto novo espera o sim do Daniel** (como no passo 26): escreva a proposta nas notas e não suba sem ele. Se a mudança pedir uma versão nova da política ou do consentimento, pergunte antes.

## Fora do escopo

Substituir ou mesclar um Corpus existente. Exportar Vagas, Anotações ou a transcrição. Exportar pelo `/admin`. Separar no painel as Sessões que entraram por arquivo (a procedência fica gravada; a contagem é outro passo). Editar o Corpus à mão dentro do app (em aberto).

## Pronto quando

- [x] Ida e volta com uma pessoa inventada: o Corpus exportado, importado numa Sessão nova e exportado de novo é o mesmo (teste do banco).
- [x] Depois de importar, a Cobertura e a Fila aberta são as mesmas da Sessão de origem (teste).
- [x] Um arquivo com uma Metric `estimado` sem `ancora`, uma confidencial sem descrição, uma data fora de `YYYY-MM`, uma ref solta ou uma `versao` desconhecida é recusado, e nada é gravado (teste).
- [x] Importar numa Sessão que já tem Corpus, ou que não consentiu, é recusado (teste).
- [x] Uma Conta sem Assinatura baixa o Corpus; uma Conta não baixa o de outra (teste).
- [x] No `MODO=local`, o arquivo baixado do hospedado entra pela tela de importar e a conversa continua de onde parou. (Verificado com o arquivo inventado, no formato que a rota entrega; com um baixado do hospedado de verdade, depois do deploy.)
- [x] O texto da privacidade tem o sim do Daniel.
- [x] `npm run typecheck` e `npm test` passam.

## Notas de implementação

**Status:** feito. O texto da privacidade (item 6) foi aprovado pelo Daniel em 2026-11-09, sem versão nova da política nem do consentimento e sem a faixa: só a "Última atualização" mudou. Fica para depois do deploy baixar um Corpus do hospedado e importar no self-host.

**Onde está:**
- `src/arquivo-do-corpus/index.ts`: o tipo, o schema zod (v1) e `lerArquivoDeCorpus(texto)` → `{ ok, arquivo }` ou `{ ok: false, razao }`, com a razão em português (as mensagens do próprio zod saem pelo `z.locales.pt()`, só nesta leitura). `limites.ts` tem o `LIMITE_ARQUIVO` (5 MB), separado para o formulário do navegador não levar o zod e o schema do banco. `exportar.ts` tem `exportarCorpus(sessaoId, agora?)`, separado do formato porque lê o banco.
- `importarCorpusDeArquivo(sessaoId, texto)` em `src/db/index.ts`, ao lado do `gravarImportacao`. Recebe o **texto** do arquivo, não o objeto: lê ele mesmo, então "nada é gravado" se confere numa porta só, e a procedência em `importacoes.texto_extraido` é o arquivo exatamente como veio. Erros: `ErroArquivoDoCorpus` (a mensagem é a razão), `ErroEstadoSessao` (fora do `consentiu`) e `ErroCorpusNaoVazio` (no `consentiu` com algum registro).
- Migração `0019_formato_corpus.sql`: só o `ALTER TYPE ... ADD VALUE 'corpus'`.
- Telas: a porta "Tenho um arquivo do sem-sotaque" (`_telas/envio-arquivo-do-corpus.tsx`, ação `enviarArquivoDoCorpus`) abaixo do PDF e do texto, só no `consentiu`. A página `/casa/exportar` (o que vai e o que não vai, e o aviso das confidenciais só quando há alguma) e a rota `/casa/exportar/arquivo` (`attachment; filename="corpus-sem-sotaque-AAAA-MM-DD.json"`, `private, no-store`). As duas leem a Conta pelo login (`entradaAtual`/`sessaoAtual`), sem `temAcesso` e sem o portão do consentimento, e saem dinâmicas no build (`ƒ`). "Baixar meu Corpus" aparece na Casa (seção "Seu Corpus", depois de importar), na tela sem acesso (assinar e pagamento pendente, se houver Corpus) e na confirmação de "Apagar meus dados" (link direto para o arquivo, se houver Corpus).

**Decisões e desvios:**
- **Os nomes dos campos:** o envelope como o passo escreveu (`formato`, `versao`, `exportadoEm`), e os registros com os nomes das colunas do banco (`descricao_publica`, `periodo_confirmado`, `adiado_voltou`), que são os que o `CONTEXT.md` usa. As refs são `affiliation_ref`/`accomplishment_ref`, como na extração do import. As Metrics vão dentro do Accomplishment, com o `confirmado_em` (C5: sem reconfirmar). Cada Linha Original vai como está no banco, uma por registro.
- **O mesmo arquivo na volta:** as refs são `af1…`/`ac1…` na ordem do `corpusDaSessao`. As Linhas Originais de um import saem do banco em ordem de id (aleatória, ver Achados), então o export as ordena pelo registro. Na importação, as Metrics ganham `created_at` com 1 ms de diferença, para manter a ordem do arquivo.
- **O avaliador mantém a `forca` que veio (C2):** o `iniciarPlano` julgava de novo todo registro não pulado. Agora julga só os sem `forca`; com nada a julgar, não chama o Jev e calcula a Cobertura na hora. Para o import do PDF não muda nada (ali nenhum tem `forca`).
- **A Casa antes do primeiro checkpoint** mostra `cobertura(corpus)` quando ainda não há plano (antes, 0%). Depois de um PDF dá 0 do mesmo jeito; depois de um arquivo dá a Cobertura dele (C7).
- **O nome da pessoa para o Jev:** a pseudonimização tirava o nome da primeira linha do texto importado. Com o arquivo, essa linha é `{`. Agora, quando o texto não dá um nome, ela usa o nome do cabeçalho.
- **Depois de importar o arquivo,** a tela do resultado diz "Seu Corpus chegou" e o botão é "Continuar a conversa" (a mesma ação do "Começar as perguntas"). Um arquivo recusado vai para `erros` só pela classe (`onde: import`), como o PDF ilegível. O evento `importou` leva `formato: 'corpus'`, então a contagem no painel (fora do escopo) já tem o dado.

**Verificado no `MODO=local`** (banco `sem_sotaque_verif` à parte, `LLM_BACKEND=assinatura`, porta 3100): o arquivo da pessoa inventada (`src/arquivo-do-corpus/inventado.ts`) entrou pela tela de importar. A Casa mostrou 43% e "2 coisas em aberto", e "Continuar a conversa" abriu na biblioteca de CPF, o rascunho que restava. Baixado de volta, o arquivo é o mesmo, menos o `exportadoEm` e a `forca` que o avaliador acabou de dar à biblioteca. O download a partir do hospedado de verdade fica para depois do deploy: lá ainda não existe o passo 27. O arquivo usado tem o mesmo formato que a rota entrega.

**Comandos:** `npx vitest run src/arquivo-do-corpus` (o formato, a ida e volta pelo banco e a rota).

**O texto da privacidade (item 6), aprovado pelo Daniel em 2026-11-09** e aplicado em `src/conteudo/privacidade.md`:

1. Em "Os seus direitos", trocar o parágrafo por:
   > Pela LGPD (art. 18), você pode confirmar se eu tenho dados seus, ver quais são, corrigir, levar uma cópia, apagar, saber com quem eles passam e retirar um consentimento. Dois são botões na sua página: "Baixar meu Corpus" entrega num arquivo o que você me contou da sua carreira, que entra de novo aqui ou numa instância sua do sem-sotaque, e "Apagar meus dados" apaga tudo. O resto, inclusive uma cópia do que não vai no arquivo (a conversa, as vagas e os currículos), peça por e-mail em hello@teamdbsolutions.com, e eu respondo em até 15 dias. Você também pode reclamar na ANPD, a Autoridade Nacional de Proteção de Dados.
2. Em "O que eu guardo", no item do currículo, acrescentar: "Se você trouxer o arquivo do seu Corpus, eu guardo o arquivo como veio, para saber de onde o Corpus veio."
3. Trocar a "Última atualização".

Sem versão nova do consentimento e sem a faixa do passo 26: não há dado novo, só uma cópia do Corpus que já é guardado, e um direito que vira botão.

## Achados

- `linhasDaSessao` (e o painel, que lê as linhas por ela) ordena por `created_at, id`. As linhas de um mesmo import têm o mesmo `created_at`, então saem em ordem aleatória. O export contorna ordenando pelo registro; o "antes" de outras telas pode embaralhar.
- Quando o `iniciarPlano` não tem nada a julgar (um arquivo com todas as `forca`), a decisão do painel fica com `backend: 'reserva'` e o motivo "0 accomplishments na ordem do currículo". Não está errado, mas pode confundir a leitura do painel.
- `src/conta/rotas.test.ts` estourou os 5 s uma vez na rodada cheia (importação a frio, 7,5 s) e passou sozinho e na rodada seguinte.
