# 24: O código aberto

## Objetivo

Um repo público novo, sob AGPL-3.0, com um commit inicial a partir deste e sem nada do negócio. O deploy do Coolify passa a vir dele. Este repo fica privado, só com o negócio.

## Ler antes

- `docs/decisoes.md`, "Parte 3" (Q2, Q3, Q4, Q5, Q7)
- `CLAUDE.md`, `docs/steps/README.md`, `docs/deploy.md`
- O texto da AGPL-3.0 (gnu.org) e a documentação do CLA Assistant

## Decisões (grilling de 2026-10-28)

1. **Tudo aberto**, prompts e regras inclusos (Q2).
2. **Repo novo, um commit inicial**; o histórico daqui não vai (Q3).
3. **Ficam só no repo privado:** os documentos do negócio (preço, funil, a busca de testers) (Q3, Q7). O resto de `docs/` vai, com os passos como roadmap aberto.
4. **AGPL-3.0 com CLA** pelo CLA Assistant (Q4, Q5).

## Fazer

1. **`docs/decisoes.md`:** as decisões técnicas do plano do negócio (stack, "o modelo nunca escreve LaTeX", Selection, regras como código, PT dentro e EN fora, o open-core, o `MODO`), sem preço, funil nem a busca de testers. Troque os links para o plano nos passos e no `CLAUDE.md` por ele.
2. **Varrer a árvore** antes de copiar: segredos, URLs internas da VPS, e-mail e WhatsApp pessoais, nomes de testers, `ADMIN_TOKEN`, referências ao `../career` que exponham conteúdo de lá. Liste o que achou e o que fez nas notas.
3. **O `CLAUDE.md` público:** o fluxo de passos para qualquer contribuidor; tira o "Daniel" onde for instrução pessoal e a regra do `../career` (fica no privado).
4. **`LICENSE`** (AGPL-3.0), o cabeçalho de licença onde a AGPL recomenda, `CONTRIBUTING.md` com o CLA e o fluxo de passos, e o CLA Assistant configurado.
5. **Criar o repo público** com `gh repo create` (**confirme o nome e a conta com o Daniel antes**: é público e não tem volta), e o commit inicial.
6. **O Coolify** passa a buildar do repo público; as variáveis continuam na VPS. Este repo perde o código e fica com o negócio; o `CLAUDE.md` daqui diz onde o trabalho acontece.

## Fora do escopo

Divulgação (passo 25). Issues e templates além do `CONTRIBUTING.md`.

## Pronto quando

- [x] O repo público existe, com um commit, `LICENSE` AGPL-3.0, `README.md`, `CONTRIBUTING.md` e o CLA Assistant respondendo num PR de teste.
- [x] `git grep` no repo público não acha os documentos privados, preço em R$, e-mail ou telefone pessoal, nem segredo.
- [x] Os links dos passos apontam para `docs/decisoes.md` e nenhum está morto.
- [x] O Coolify fez um deploy a partir do repo público e o `/health` responde.
- [x] `npm run typecheck` e `npm test` passam no clone limpo.

## Notas de implementação

**Decisões desta janela** (com o Daniel, 2026-11-03):
- **Repo:** o privado foi renomeado para `daniel-bernardino747/sem-sotaque-negocio`, e o público ficou com `daniel-bernardino747/sem-sotaque`.
- **Licença:** AGPL-3.0-or-later. O titular do copyright e quem recebe o CLA é a DB Software Solutions LTDA.
- **CLA:** o [cla-assistant.io](https://cla-assistant.io) hospedado, com o texto de `CLA.md`. O CLA Assistant Lite (a GitHub Action) foi arquivado em 2026 e rodaria sem manutenção em `pull_request_target`, com escrita no repo.
- **Preço:** o R$ 99 do beta fica, porque já aparece no app e nos termos. Saíram o preço do produto, o preço de fundador e a conta de margem do passo 21, que ficou no repo privado.

**A varredura** (`git grep` na árvore inteira, menos os documentos do negócio):
- **Segredos:** nenhum. Só as credenciais de dev do `docker-compose.yml` e os placeholders `sk_…`/`whsec_…` da documentação.
- **WhatsApp pessoal:** estava fixo em `src/app/whatsapp.ts`. Agora `linkDeContato` (`src/app/contato.ts`) lê `CONTATO_WHATSAPP`, e sem ela os links mandam e-mail para hello@teamdbsolutions.com. O Coolify já tem a variável.
- **E-mail:** só o da empresa (hello@teamdbsolutions.com), que já é público na política. O CNPJ e o endereço também já estão na política.
- **Testers:** nenhum nome. A única menção é um prefixo de id de sessão, no passo 09.
- **URLs internas:** a única era a do Railway (`.railway/railway.ts` e as notas do 09). O `.railway/` e a dependência `railway` saíram, porque produção é o Coolify. A VPS não tem URL nem IP no repo.
- **`ADMIN_TOKEN`:** só o nome da variável e o tamanho mínimo.
- **O `../career`:** ficam caminhos nos passos 01, 02, 04, 05, 06, 15, 16 e 17, no `CONTEXT.md`, no `regras-de-redacao.md` e num comentário de `src/db/schema.ts`. Eles dizem de onde veio a ideia e não copiam conteúdo de lá. Quem não tem o `career` lê o resultado aqui (os prompts em `src/geracao/`, `src/interrogatorio/`).
- **Documentos do negócio:** nenhum arquivo público os cita. O `docs/decisoes.md` fica com o técnico e mantém os números das decisões (decisão 13, P23, Q6), para os passos continuarem valendo. A linha da landing ("Daniel's own lines") perdeu a referência ao documento de onde vinha.

**O que entrou no código:**
- `LICENSE` (o texto da gnu.org), `CLA.md`, `CONTRIBUTING.md` e o cabeçalho SPDX em todo `.ts`, `.tsx`, `.py` e `.css`. O `src/licenca.test.ts` cobra o cabeçalho de arquivo novo. Os prompts `.md` e as migrações `.sql` ficam sem cabeçalho.
- O link "Código-fonte" em todo rodapé (`LinksLegais`), como a AGPL pede de um serviço de rede (seção 13).
- `src/docs.test.ts`: nenhum link relativo morto nos `.md`. Ele e o teste da licença pulam onde não há `.git`, como dentro da imagem.
- O `CLAUDE.md` público troca "o Daniel" por quem pediu o trabalho, tira a regra do `../career` (que fica no privado), troca o commit por passo por um PR por passo e ganha a regra de dizer o custo antes de uma chamada paga.
- Este passo foi editado para não nomear os documentos privados, porque o `git grep` do "Pronto quando" roda nele também.

**O fechamento** (2026-11-04):
- O Coolify builda do repo público. Depois do deploy, o `/health` respondeu `{"ok":true}`, e a landing de produção mostra o link "Código-fonte" e o convite pelo WhatsApp.
- O repo privado perdeu o código no mesmo dia, depois do deploy.
- O CLA Assistant está ligado ao repo, com o texto de `CLA.md` num gist. Ele respondeu no PR que fechou este passo.

## Achados

- **Os textos de contato ainda dizem "Oi, Daniel!"** (`src/app/page.tsx`, `curriculo-da-vaga.tsx`). Isso vale para o hospedado, mas fica estranho num fork hospedado por outra pessoa. O mesmo vale para o `CODIGO_FONTE`, fixo no código.
- **Sem o `CONTATO_WHATSAPP`, os rótulos continuam dizendo "WhatsApp"**, mas o link abre um e-mail.
