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

- [ ] Ida e volta com uma pessoa inventada: o Corpus exportado, importado numa Sessão nova e exportado de novo é o mesmo (teste do banco).
- [ ] Depois de importar, a Cobertura e a Fila aberta são as mesmas da Sessão de origem (teste).
- [ ] Um arquivo com uma Metric `estimado` sem `ancora`, uma confidencial sem descrição, uma data fora de `YYYY-MM`, uma ref solta ou uma `versao` desconhecida é recusado, e nada é gravado (teste).
- [ ] Importar numa Sessão que já tem Corpus, ou que não consentiu, é recusado (teste).
- [ ] Uma Conta sem Assinatura baixa o Corpus; uma Conta não baixa o de outra (teste).
- [ ] No `MODO=local`, o arquivo baixado do hospedado entra pela tela de importar e a conversa continua de onde parou.
- [ ] O texto da privacidade tem o sim do Daniel.
- [ ] `npm run typecheck` e `npm test` passam.

## Notas de implementação

## Achados
