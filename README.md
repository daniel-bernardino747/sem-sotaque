# sem-sotaque

> **In English:** a tool that interviews a Brazilian developer about their career, in Portuguese, without inventing a single number, and writes a one-page résumé in English for international jobs, in general and per job posting. Use the hosted version (paid) or run it on your own machine with your own Anthropic API key: `cp .env.example .env`, fill `ANTHROPIC_API_KEY`, `docker compose -f docker-compose.local.yml up`, open `localhost:3000`. The model never writes LaTeX: it picks a JSON Selection from what you said, and a fixed template renders the PDF.

O sem-sotaque conversa com você em português sobre o que você fez no trabalho, pergunta o que um recrutador de fora vai querer saber e escreve um currículo de uma página, em inglês, para vaga internacional. Ele não inventa número: toda métrica tem origem (você disse, ou estimou com uma âncora), e todo bullet aponta para o que você contou.

## Pague ou rode local

- **Hospedado:** você paga a assinatura e usa no navegador, sem instalar nada. O modelo roda na conta do sem-sotaque.
- **Local:** o mesmo código, de graça, na sua máquina, só para você. O modelo roda na **sua** chave da API da Anthropic, e o gasto é seu (a conversa e o currículo geral ficam perto de US$ 1,15 por sessão, medido nas simulações).

O código é um só. O que muda é a variável `MODO`: o `local` é para um usuário só, sem login, sem pagamento, sem landing e sem o painel `/admin`. No `local` também não há tela de consentimento (quem preenche o `.env` já escolheu por onde o dado passa) nem limite de vagas; o teto de gasto por sessão continua valendo (`TETO_SESSAO_USD`).

## Rodar local com Docker (o caminho oficial)

Precisa do Docker e de uma chave da API da Anthropic ([console.anthropic.com](https://console.anthropic.com)).

```sh
cp .env.example .env
# edite o .env e preencha ANTHROPIC_API_KEY
docker compose -f docker-compose.local.yml up
```

A primeira subida constrói a imagem (uns minutos: ela aquece o cache do Tectonic, o que gera o PDF). As migrações do banco rodam sozinhas a cada subida. Depois, abra `http://localhost:3000`: ele vai direto para a sua página, sem login. O banco fica no volume `db-local`; `docker compose -f docker-compose.local.yml down -v` apaga tudo.

**E a assinatura do Claude (Pro/Max)?** Não pelo Docker. A política da Anthropic diz que quem constrói um produto usa chave da API e que terceiros não podem oferecer o login do Claude.ai nem os limites da assinatura no próprio app; ela também diz que você pode usar o Claude Code, sem modificação, com a sua própria assinatura. Um app local, só seu, que chama o `claude -p` cai entre as duas frases, e nenhum texto da Anthropic trata desse caso ([legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance), [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), lidos em 2026-11-03). Por isso o Docker usa só a chave. O caminho nativo, abaixo, aceita a assinatura para quem quiser assumir essa leitura.

## Rodar nativo (para quem vai contribuir)

Precisa de:

- Node 24 (`.nvmrc`)
- Postgres 16 (o `docker compose up -d db` sobe um em `localhost:5432`)
- [Tectonic](https://tectonic-typesetting.github.io) 0.16.9, a mesma versão do `Dockerfile`: outra versão pode mudar a quebra de linha, e as regras de página são medidas por linha
- Python 3 com `pypdf`, e o `pdftotext` (poppler), para medir o PDF

```sh
npm ci
cp .env.example .env              # preencha ANTHROPIC_API_KEY
docker compose up -d db
npm run db:migrate
MODO=local npm run dev           # e abra http://localhost:3000
```

**No Windows,** o `next dev` com Turbopack (o padrão) quebra ao baixar as fontes do Google ("next/font/google queries have exactly one entry"). Use o webpack: `MODO=local npx next dev --webpack`. No Linux, o Turbopack funciona (conferido em 2026-11-05, dentro da imagem).

**Pela assinatura do Claude, em vez da chave:** com o [Claude Code](https://code.claude.com) instalado e logado no host (`claude auth status`), rode `MODO=local LLM_BACKEND=assinatura npm run dev`. O app chama o `claude -p` sem modificação, e as chamadas aparecem com "custo não medido". Leia o parágrafo sobre a política acima antes: o uso é seu, sob os termos da Anthropic. O hospedado recusa a assinatura sempre, com qualquer `NODE_ENV`.

`npm test` roda os testes (os que precisam de Tectonic, do Python ou do banco pulam se faltar), e `npm run typecheck` confere os tipos. Os comandos todos estão no `CLAUDE.md`.

## Variáveis

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | A chave da API. Obrigatória, a não ser que `LLM_BACKEND=assinatura` |
| `MODO` | `local` ou `hospedado` (vazio é `hospedado`). O `docker-compose.local.yml` já põe `local` |
| `LLM_BACKEND` | `assinatura` usa o `claude -p` logado no host, e só vale com `MODO=local`. Vazio: a API |
| `TYPESAFE_API_KEY` | O Jev, o classificador do avaliador. Opcional (abaixo) |
| `DATABASE_URL` | O Postgres. No Docker, o compose já define |
| `APP_URL` | O endereço que vai nos links. Vazio: `http://localhost:3000` |
| `TETO_SESSAO_USD` | O teto de gasto por sessão, em dólar. Vazio: US$ 3 |
| `ADMIN_TOKEN` | Só no hospedado: a senha do painel `/admin` |
| `CONTATO_WHATSAPP` | Só no hospedado: o número que os links de convite da landing abrem no WhatsApp. Vazio: os links mandam e-mail |

## Sem o Jev

O avaliador decide, a cada resposta, se o assunto já rendeu o bastante ou se vale mais uma pergunta. Com a `TYPESAFE_API_KEY`, quem decide é o Jev, um classificador da [TypeSafe](https://typesafe.ai) que custa frações de centavo por sessão. Sem ela, o avaliador segue regras fixas: muda de assunto quando um número entra ou quando você pula, adia quando você diz que não sabe e, no resto, continua até o limite de perguntas por registro. A conversa funciona e vai até o PDF. O que já foi medido sem o Jev, e a comparação com ele que ainda falta, estão em `docs/steps/23-self-host.md`.

## O modelo nunca escreve LaTeX

O modelo lê o que você contou e devolve uma Selection: um JSON validado com o que entra no currículo, em que ordem e com que compressão. Um template fixo, compilado pelo Tectonic, transforma a Selection em PDF, e um script mede o resultado contra as regras de página. Assim o currículo não quebra por um comando LaTeX inventado, e cada linha continua apontando para o registro de onde veio.

## Onde está o resto

- `docs/steps/`: os passos de implementação, um por sessão
- `docs/regras-de-redacao.md`: as regras do currículo e como cada uma é garantida
- `CONTEXT.md`: o vocabulário
- `docs/decisoes.md`: as decisões técnicas e o porquê de cada uma
- `docs/deploy.md`: como o hospedado sobe
- `CONTRIBUTING.md`: como contribuir, o CLA e o fluxo de passos
- `LICENSE`: AGPL-3.0
