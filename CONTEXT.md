# sem-sotaque

O vocabulário vem do `career` (`../career/CONTEXT.md`), adaptado para muitas pessoas. Use estes termos no código, nas tabelas e nos prompts.

## Linguagem

**Conta**:
Quem entra, pelo GitHub ou pelo Google (passo 20). Uma Conta tem um Tester, e por ele tudo o que a pessoa tem. Some junto com os dados em "Apagar meus dados".

**Acesso**:
Um navegador com login: o cookie guarda um valor aleatório e o banco só o hash dele. "Sair" encerra o Acesso daquele navegador.
_Evite_: sessão (Sessão é outra coisa, abaixo); e não confunda com `temAcesso`, que pergunta pela Assinatura

**Assinatura**:
O plano da Conta no Stripe (passo 21): R$ 99 por trimestre. Só o webhook grava o status; sem Assinatura `active` ou `trialing` (e sem reembolso), a Casa mostra só a tela de assinar. `temAcesso(conta)` é essa pergunta; no `MODO=local` a resposta é sempre sim.

**Cota de vagas**:
Quantas Vagas a Sessão cria por período pago: 15, contadas desde o início do período (as apagadas também), e de volta a zero na renovação. Sem Assinatura (o `local`, um Tester do v0), contam todas as Vagas de sempre.

**Tester**:
Uma pessoa. No v0 entrava por um link com Token, sem login; desde o passo 20 é da Conta, e o link antigo só serve para, no primeiro login por ele, ligar o Tester à Conta. No produto vira "usuário".

**Sessão**:
Tudo o que uma pessoa tem, a partir da sua Conta: consentimento, import, o Corpus, as gerações, as Vagas e as Candidaturas. Uma por Tester. O `estado` dela marca até onde a pessoa chegou no v0 (o funil); a partir da parte 2 ele não decide mais a tela.

**Leitura**:
O opt-in "pode ler para melhorar o produto" (`sessoes.pode_ler_em`, passo 22): só com ele o painel mostra o conteúdo da Sessão (transcrição, Corpus, tentativas, PDFs, vagas). Sem ele, só números. É uma caixa à parte no consentimento, desmarcada, e a Casa liga e desliga. Os consentimentos v1 e v2 já incluíam a leitura.
_Evite_: permissão, compartilhamento

**Casa**:
A página que a Conta abre (`/casa`): Cobertura, "Achei uma vaga", "Continuar a conversa", as Candidaturas e o currículo geral.
_Evite_: dashboard, home (a home é a página pública `/`)

**Corpus**:
A carreira de uma pessoa, guardada como Affiliations e Accomplishments. É a única fonte da verdade: todo currículo sai dele, e só o interrogatório escreve nele. É escrito em português (ou na língua em que a pessoa contou).

**Affiliation**:
Onde algo aconteceu: um empregador, um cliente, um curso. Guarda organização, cargo, período (mês/ano) e stack; não guarda feitos. Pode ser **confidencial**: aí o currículo usa a `descricao_publica` e nunca o nome.
_Evite_: emprego, experiência, cargo

**Accomplishment**:
Algo que a pessoa fez e consegue provar, independente da Affiliation. É a unidade que se seleciona para um currículo. Guarda o cenário completo (situação, mecanismo, quem fez o quê, como se sabe o resultado). Registro longo, bullet curto.
_Evite_: conquista, bullet, tarefa

**Metric**:
O número que torna um Accomplishment defensável, com a sua **Origem**:
- `afirmado`: a pessoa sabia o número.
- `estimado`: a pessoa chegou a um `~` por uma Âncora e confirmou explicitamente.
- `qualitativo`: não houve número possível; é um resultado concreto sem número, marcado como fraco e usado só para preencher.

Um Accomplishment sem Metric é rascunho.

**Âncora**:
Uma pergunta que ajuda a estimar quando a pessoa diz "não sei": quantos usuários, com que frequência, quanto tempo antes e depois, quantas pessoas no time, quanto custaria se quebrasse. A âncora usada fica registrada junto da Metric.

**Linha Original**:
Um bullet ou trecho do currículo que a pessoa importou, guardado como veio e ligado ao Accomplishment que ele virou. É o "antes" do "antes × depois".

**Selection**:
O subconjunto do Corpus escolhido para um currículo, com ordem e compressão, em JSON validado (`SELECTION_VERSION` do render). O modelo nunca escreve LaTeX.

**Render**:
Uma Selection transformada em PDF pelo template Tectonic fixo, com a medição (`measure-resume`) que a acompanha.

**Crítico**:
Um agente de contexto limpo, o "recrutador que não sabe nada", que lê o currículo pronto e aponta o que não entendeu, o que soa vazio e o que quebra uma regra.

**Fundador**:
Um Tester do v0 que garantiu o preço de fundador (um preço travado para sempre) deixando e-mail e WhatsApp. Era um sinal do critério de validação. Saiu da tela no passo 22; a coluna fica no banco.

**Indicação**:
Um dev que o Tester indicou (nome e contato). É o outro sinal do critério.

**Assunto**:
O que o interrogatório trata agora: um Accomplishment, o bloco de uma Affiliation (período, o que a empresa é, se o nome pode aparecer), a formação, uma Anotação ou a oferta de fim. O questionador vê só o assunto atual.

**Avaliador**:
O classificador (o Jev, da TypeSafe) que roda em checkpoints: julga a força de cada Accomplishment e decide se o assunto continua (com um objetivo novo), troca ou é **adiado** (volta uma vez, no fim da fila). Quando falha, regras de reserva decidem aquele checkpoint.

**Cobertura**:
Quanto do currículo já está coberto, de 0 a 100%: o peso (pela força) dos Accomplishments com Metric sobre o dos que não foram pulados. É o que a pessoa vê; passando de 70%, o fim é oferecido.

**Anotação**:
O que a pessoa disse sobre outro assunto, guardado nas palavras dela para quando ele chegar.

**Fila aberta**:
O que a conversa geral retoma: os rascunhos primeiro, depois os pulados e os adiados. "Contar algo novo" abre um Assunto na frente dela.

**Versão**:
Uma geração de currículo: a Selection, o PDF e, numa Vaga, o Mapa. O currículo geral e cada Vaga têm as suas; as antigas ficam no histórico.

**Vaga**:
Uma vaga que a pessoa colou ("Achei uma vaga"): o texto como veio, empresa e cargo confirmados, os Requisitos e as Versões. O link é guardado e nunca buscado.
_Evite_: job, posting, oportunidade

**Requisito**:
O que a Vaga pede, um por linha, "obrigatório" ou "desejável", com os Accomplishments que já o cobrem.

**Lacuna**:
Um Requisito que nenhum registro cobre. A pessoa marca "já usei" (vira Assunto da conversa da Vaga) ou "não usei" (fica gravado na Vaga). Sem resposta, conta como "não usei".

**Mapa da vaga**:
Em cada Versão de uma Vaga: cada Requisito → o `accomplishment_id` da linha que o responde, ou "não coberto". Montado pelo Crítico e conferido no código; nunca dispara reescrita.

**Candidatura**:
O andamento de uma Vaga: Preparando → Enviei → Em entrevista → Proposta → Encerrada (com o motivo). "Enviei" grava a Versão enviada. A lista da Casa é de Candidaturas, não de currículos.
