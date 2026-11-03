# 22: Privacidade, termos e o fim para quem paga

## Objetivo

Com cliente pagante, o Daniel deixa de ler tudo: o painel mostra métricas e a transcrição só abre com opt-in. O app ganha termos de uso e política de privacidade que descrevem o que ele faz de verdade. A tela de fim perde o que era do teste grátis.

## Ler antes

- `docs/decisoes.md`, "Parte 3" (Q19, Q20, Q24, Q25), e "LGPD" no v0
- As notas dos passos 20 e 21
- O consentimento atual (`src/app/s/[token]/_telas/`), o painel (`src/app/admin/`, `src/db/painel.ts`) e a tela de fim (`fim.tsx`, `fim-da-sessao.tsx`, `src/sessao/fechamento.ts`)
- `docs/regras-de-redacao.md`

## Decisões (grilling de 2026-10-28)

1. **O painel mostra só métricas** por padrão: funil, custo, turnos, "não sei", tempo (Q19). Transcrição, Corpus, PDFs e textos de vaga só aparecem para quem marcou **"pode ler para melhorar o produto"**, um opt-in separado, que a pessoa pode desligar na casa.
2. **A tela de fim** (Q24): saem a pré-venda de fundador e o "pagaria?"; ficam a indicação, sem recompensa, e o depoimento, com o consentimento separado. As colunas ficam no banco, sem tela.
3. **Termos e política** (Q25) redigidos a partir do app real: o controlador (o CNPJ do Daniel) e o canal do titular; o que é guardado (o schema); Anthropic e TypeSafe como operadores; Stripe; GitHub e Google; o apagar; os 7 dias do CDC; o opt-in de leitura; o cancelamento. Com a ressalva de que não passaram por advogado.

## Fazer

1. **Migração:** `podeLer` (data do aceite, nulável) na conta ou na Sessão.
2. **O painel:** cada leitura de conteúdo confere o opt-in; sem ele, a página da sessão mostra só as métricas e "a pessoa não liberou a leitura". Os testers do v0 que aceitaram o texto antigo ficam como estão (o texto deles dizia que o Daniel lê); registre a regra nas notas.
3. **O consentimento** de entrada vira o texto novo, com o opt-in de leitura à parte e desmarcado.
4. **A tela de fim** sem a pré-venda e o "pagaria?".
5. **`/termos` e `/privacidade`**, públicas, linkadas no rodapé, na tela de assinar e no consentimento. O texto vai para o Daniel antes de aplicar.

## Fora do escopo

Revisão por advogado. Exportação dos dados (portabilidade): anote em Achados se a política precisar prometer.

## Pronto quando

- [x] O painel de uma sessão sem opt-in não mostra transcrição, Corpus, PDF nem vaga, nem pela rota do PDF (teste).
- [x] Ligar o opt-in na casa libera; desligar fecha de novo (teste).
- [x] A tela de fim não tem a pré-venda nem o "pagaria?".
- [x] `/termos` e `/privacidade` aprovadas pelo Daniel e no ar em dev.
- [x] `npm run typecheck` e `npm test` passam.

## Notas de implementação

- **Branch e PR:** `daniel-bernardino747/issue-12-passo-22-privacidade-termos-e-o-fim-para`, em commits teste → código, com PR para a `main`.
- **Migração `0016_pode-ler.sql`:** `sessoes.pode_ler_em` (nulável) na **Sessão**, onde já mora o consentimento. Ela faz o backfill `pode_ler_em = consentiu_em` das sessões com consentimento `v1` ou `v2`. **A regra dos testers do v0:** o texto que eles aceitaram dizia "o Daniel lê tudo", então o aceite deles conta como o opt-in, e eles podem desligar na casa como qualquer pessoa. `registrarConsentimento(id, versao, podeLer)` segue a mesma regra por padrão (`textoIncluiLeitura`: v1 e v2). Rodei no banco de dev.
- **O painel** passa por `src/admin/sessao.ts`:
  - `sessaoParaPainel(id)` devolve `{ sessao, metricas, conteudo }`, com `conteudo` null sem o opt-in;
  - `pdfParaPainel` devolve `'fechado'` antes de ler os bytes, e a rota do PDF responde **403** ("a pessoa não liberou a leitura").
  - **Sem o opt-in, a página da sessão mostra:** o apelido (o nome da conta), o estado, o custo, os eventos, as contagens do avaliador, "Números" (perguntas, respostas, "não sei", tempo, tentativas), as notas do Daniel e o Fechamento.
  - **E esconde:** transcrição, Corpus, tentativas, PDF e antes × depois.
  - O **Fechamento** (depoimento, "algo deu errado", indicações) continua visível: a pessoa escreveu para o Daniel. Os textos dizem isso.
  - Na lista, as **âncoras** só contam sessões com o opt-in, e "Onde abandonaram" mostra a sessão sem a pergunta.
  - O painel não tem seção de vagas ainda (passo 19). Quando tiver, ela entra pelo `conteudo`.
- **Consentimento v3** (`consentimento-v3.md`, `CONSENTIMENTO_VERSAO = 'v3'`):
  - "Pode ler para melhorar o produto" é uma caixa à parte, desmarcada e não obrigatória (`pode_ler`), com links para `/termos` e `/privacidade`.
  - O reaceite de uma sessão v1 continua mostrando e gravando o **v2** (`REACEITE_VERSAO`), porque o que ele pergunta é a TypeSafe.
  - As vagas ganharam `consentimento-vagas-v2.md` ("Quem lê": só com "Pode ler").
  - A versão das vagas não é gravada por sessão, só a data do aceite.
- **A casa** tem a seção "Para melhorar o produto", com "Pode ler" / "Não quero mais" (`mudarLeitura`).
  - A ação só exige login, não a assinatura: quem deixou de pagar ainda decide quem lê.
  - Mas a tela de assinar não mostra o botão (ver Achados).
  - No `MODO=local` a seção não aparece.
- **A tela de fim:**
  - saíram o bloco do fundador, `FormularioFundador`, `enviarFundador`, `lerFundador`, `garantirFundador` e as perguntas "pagaria?" e "quanto?";
  - `Opiniao` ficou com depoimento, a caixa dele e o comentário;
  - as colunas (`fundador`, `email`, `whatsapp`, `pagaria`, `pagaria_quanto`) continuam no banco, e o painel ainda as mostra para as linhas do v0.
- **`/termos` e `/privacidade`:**
  - O texto está em `src/conteudo/termos.md` e `privacidade.md`, desenhados por `src/app/_documento.tsx`. É um Markdown mínimo: `#`, `##`, `- `, `**`.
  - As páginas são públicas e estáticas.
  - Os links estão no rodapé da casa (fora do `local`), da landing e do `/entrar`, na tela de assinar e no consentimento.
  - O canal do titular é `hello@teamdbsolutions.com`, escolhido pelo Daniel.
  - **O controlador** é a DB Software Solutions LTDA, CNPJ 63.169.584/0001-43, tirado do cartão CNPJ do Daniel. O endereço da sede está nos dois textos, como pede o Decreto 7.962/2013 para venda online.
  - **O servidor** é uma VPS da Hostinger no Brasil, com backup semanal automático (sem o diário), guardado no Brasil, fora do servidor. A Hostinger mantém dois semanais, então a política diz "até 14 dias". Nenhum marcador sobrou.
- **Testes:**
  - `src/admin/sessao.test.ts`: painel fechado e PDF 403, ligar e desligar, v1/v2 abrem;
  - `src/conta/leitura.test.ts`: a caixa à parte no consentimento, e a casa liga e desliga;
  - `src/db/painel.test.ts`: âncoras e paradas;
  - `src/db/fechamento.test.ts` e `src/sessao/fechamento.test.ts`: o fim sem fundador nem "pagaria";
  - `src/conteudo/documento.test.ts`: o leitor e o que cada texto precisa dizer.
- **Textos aprovados pelo Daniel em 2026-11-03,** todos como propostos: os termos, a política, o consentimento v3 com a caixa "Pode ler", o das vagas v2, a seção "Para melhorar o produto" da casa e a indicação do fim. Ele também confirmou a nota fiscal à mão, a frase sobre a Anthropic não treinar com a API e a promessa da cópia em 15 dias (sem exportação: ver Achados).
- **Verificação:** com o `next start` na 3005, `/termos` e `/privacidade` respondem 200 com os títulos, e o `/entrar` traz os links. A extensão do Chrome não respondeu, então **não houve conferência visual.**

## Achados

- **Portabilidade:** a política promete "pedir uma cópia" pela LGPD (art. 18), respondida em até 15 dias, mas não há exportação. Hoje o Daniel teria que montar a cópia à mão do banco. Uma exportação (JSON do Corpus + os PDFs) fecharia isso.
- **"Não quero mais" sem assinatura:** a ação aceita quem não paga, mas a casa sem acesso só mostra a tela de assinar, sem o botão. Quem deixou de pagar e quer fechar a leitura precisa pedir por e-mail (ou apagar).
- **O painel ainda mostra "Fundador" e "Pagaria"** no Fechamento e o sinal na lista, para as linhas do v0. Some quando o critério de validação sair do painel.
- **As versões do consentimento são strings soltas** (`'v1'` em `aceitouAvaliador`, `'v1' | 'v2'` em `textoIncluiLeitura` e na migração, `REACEITE_VERSAO`). Uma tabela de versões com as propriedades de cada uma juntaria isso.
- **Backup restaurado traz de volta quem apagou.** A política promete apagar de novo o que já tinha sido apagado se uma cópia da Hostinger for restaurada. Não há rotina para isso: depois de um restore, compare as sessões com `apagada_em` antes e depois, ou guarde a lista dos apagamentos fora do banco.
- **Backups do Coolify:** não conferi se o Postgres tem um agendamento de backup no Coolify (aba Backups do banco). Se tiver, a retenção dele entra no "até 14 dias" da política, e um S3 entraria na lista de operadores.
- **Os textos legais não passaram por advogado** (Q25). A Anthropic "não treina com dados da API" está escrito a partir dos termos comerciais dela: confira antes de publicar.
