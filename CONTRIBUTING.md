# Como contribuir

Obrigado por querer ajudar. O sem-sotaque é feito em passos pequenos, um por sessão de trabalho, e todo passo está escrito em [`docs/steps/`](docs/steps/README.md). O fluxo foi pensado para quem trabalha com o Claude Code, mas vale sem ele.

## Antes do primeiro PR: o CLA

O código é AGPL-3.0 ([`LICENSE`](LICENSE)). Para aceitar uma contribuição, a DB Software Solutions LTDA, que mantém o projeto, pede que você assine o [Acordo de Licença de Contribuidor](CLA.md) (CLA). Ele diz que você tem o direito de enviar o que enviou e deixa o projeto relicenciar a contribuição, por exemplo numa licença comercial. Você continua dono do que escreveu.

Você assina pelo [CLA Assistant](https://cla-assistant.io): no seu primeiro pull request, ele comenta com um link; entre com o GitHub e aceite. Vale para todos os PRs seguintes. Sem a assinatura, o PR não é mesclado.

## O fluxo de passos

1. Abra [`docs/steps/README.md`](docs/steps/README.md) e pegue o primeiro passo `pendente` cujas dependências estejam `feito`, ou o passo de uma issue.
2. Leia o arquivo do passo inteiro, mais o que ele manda ler antes. As decisões citadas (decisão 13, Q6) estão em [`docs/decisoes.md`](docs/decisoes.md).
3. Faça **só** o que o passo pede. O que aparecer fora do escopo vai para "Achados", no fim do arquivo do passo.
4. Feche quando todos os itens de "Pronto quando" passarem. Marque `feito` no `docs/steps/README.md` e escreva em "Notas de implementação" o que a próxima pessoa precisa saber.
5. Um PR por passo, contra a `main`, com `npm run typecheck` e `npm test` passando.

Uma correção pequena (bug, texto, teste) não precisa de passo: abra o PR direto, dizendo o que estava errado e como você conferiu.

## Rodar e testar

O [`README.md`](README.md) mostra como rodar nativo, e o [`CLAUDE.md`](CLAUDE.md) lista todos os comandos. O essencial:

```sh
npm ci
docker compose up -d db
npm run typecheck
npm test
```

Os testes que compilam PDF pulam se faltar o Tectonic, o Python com `pypdf` ou o `pdftotext`; os do banco pulam sem Postgres.

## Regras que um PR não quebra

- **Dado de pessoa real nunca vai para o git:** nem PDF, nem transcrição, nem dump de banco. Fixtures usam pessoas inventadas.
- **O modelo nunca escreve LaTeX.** Ele produz uma Selection JSON, e o template fixo renderiza.
- **Nenhum número sem origem.** Toda Metric tem `origem` e, se estimada, a `ancora`.
- **Chamada paga ao modelo** (`simular`, `gerar`, o teste de integração do import) gasta a sua chave; diga o custo no PR se ela fizer parte da conferência. No dia a dia, no `MODO=local`, escolha em "Configuração" a sua assinatura do Claude (ou a do ChatGPT, experimental).
- Interface e interrogatório em **português**; currículo em **inglês**. A redação segue [`docs/regras-de-redacao.md`](docs/regras-de-redacao.md).
- Arquivo de código novo começa com o cabeçalho de licença:

  ```ts
  // Copyright (C) 2026 DB Software Solutions LTDA
  // SPDX-License-Identifier: AGPL-3.0-or-later
  ```

## Segurança

Achou uma falha de segurança? Não abra issue pública: escreva para hello@teamdbsolutions.com.
