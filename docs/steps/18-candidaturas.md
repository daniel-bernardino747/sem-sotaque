# 18: Candidaturas

## Objetivo

A pessoa gere o andamento de cada vaga pela casa. A lista é das **vagas**, não dos currículos gerados: o currículo é uma das coisas da Candidatura.

## Ler antes

- `docs/decisoes.md`, "Parte 2", e `CONTEXT.md` (Candidatura, Versão)
- As notas dos passos 14 a 17
- A casa (`src/app/s/[token]/page.tsx`) e a página da vaga

## Decisões (grilling de 2026-10-26/27)

1. **Os status** (P13): Preparando → Enviei (data) → Em entrevista (nota opcional) → Proposta → Encerrada, com o motivo (não passei / sem resposta / desisti / aceitei). Um toque cada. O cartão mostra a data da última mudança.
2. **"Enviei" trava a versão enviada** (P14): grava qual versão foi mandada e o cartão mostra "versão enviada". Gerar de novo depois cria uma versão nova, sem mudar a enviada.
3. **Na casa** (P17): os cartões das candidaturas, a mais recente primeiro, com as encerradas recolhidas em "Encerradas".

## Fazer

1. **Migração:** o status, a data de cada mudança, a nota de entrevista, o motivo de encerramento e a versão enviada na vaga, mais o histórico das mudanças (status e data, sem conteúdo, com `sessao_id`; sobrevive ao esvaziamento da vaga, para o funil). Os eventos novos (`vaga_enviada`, `vaga_entrevista`, `vaga_proposta`, `vaga_encerrada`), com `{ vaga_id }` e sem conteúdo.
2. **As ações:** cada mudança de status é uma server action com a transição conferida no servidor (não se volta para Preparando depois de Enviei; Encerrada pede o motivo). Uma nova Enviei sem versão gerada não existe: o botão só aparece com uma versão pronta.
3. **Os cartões na casa** e os controles de status na página da vaga.
4. **O texto novo** (os status, os motivos, "versão enviada") segue `docs/regras-de-redacao.md` e vai para o Daniel antes de aplicar.
5. **`apagarVaga` e `apagarSessao`** levam a nota de entrevista (é texto da pessoa) e mantêm o histórico de status e os eventos, que não têm conteúdo.

## Fora do escopo

Lembretes, prazos e integração com e-mail ou LinkedIn. Prep de entrevista.

## Pronto quando

- [ ] Uma vaga passa por Enviei → Em entrevista (com nota) → Encerrada · não passei, e a casa mostra o cartão em "Encerradas" com a data da última mudança.
- [ ] "Enviei" grava a versão; gerar de novo depois não muda a versão enviada (teste).
- [ ] Uma transição inválida é recusada no servidor (teste).
- [ ] A casa a 360px sem scroll lateral, com 0, 1 e 10 candidaturas.
- [ ] `npm run typecheck` e `npm test` passam.

## Notas de implementação

(preencher ao terminar)

## Achados

(o que aparecer fora do escopo)
