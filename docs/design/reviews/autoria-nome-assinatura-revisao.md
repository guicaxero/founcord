# Revisão de UI/UX — Nome no portal e assinatura

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

### Contexto

- **Problema 1 — "AP":** o autor das crônicas oficiais aparecia como
  "Guardião da Chama AP". O nome vinha de uma migração antiga que batizou o
  usuário de sistema; o nome de quem entra pelo Discord também é recopiado a
  cada login, então ninguém conseguia ajustá-lo no portal.
- **Problema 2 — "Escrito por tatuzando":** a importação do Discord e o
  `/post` colocavam a autoria dentro do texto, com o nome do Discord.
- **Objetivo:** autoria consistente em todas as publicações, escolhida no
  portal, sem depender da origem do texto.

### Decisões

- **Nome no portal** (`iam_users.portal_name`): cada pessoa escolhe como
  aparece; vazio volta ao nome do Discord (`discord_name`, guardado a cada
  login). O `display_name` passa a ser sempre o nome efetivo, então missões,
  crônicas, Diário, pedidos e listas usam o nome escolhido sem mudanças nas
  telas. O usuário de sistema passa a "Guardião da Chama" (migração 0034).
- **Assinatura da crônica** (`posts.byline`): opcional; vazia mostra o nome
  no portal de quem escreveu. Importação e `/post` preenchem a assinatura em
  vez de escrever "Escrito por…" no texto; a migração move a autoria das
  crônicas existentes para a assinatura e limpa o texto.

### Fluxo

- Minha área → aba "Nome no portal" (também no menu da conta): campo com o
  nome do Discord no texto de apoio, "Salvar nome", toast com o resultado.
- Editor de crônica: campo "Assinatura" (opcional).
- Crônicas já publicadas: "Organizar o arquivo" ganha, por crônica,
  "Assinatura" ao lado de "Tags".

### Estados

Nome vazio (volta ao Discord, dito no toast); erro ao salvar (aviso com foco,
valor preservado); assinatura vazia (o campo mostra quem aparecerá como
autor); visitante sem login não altera nada (`401`).

### Critérios de aceitação

- Definir o nome no portal muda o nome no menu da conta e em novas e antigas
  publicações da pessoa; apagar volta ao nome do Discord, inclusive em contas
  criadas antes da migração.
- Crônicas importadas ou do `/post` não têm "Escrito por" no texto e mostram
  a assinatura como autor.
- O arquivo de Crônicas não mostra "AP" depois da migração.

## Validação renderizada

Portal local com a migração 0034.

| Verificação | Resultado |
| --- | --- |
| Migração | Três crônicas locais com "> Escrito por **Guardião da Chama**" ficaram com a assinatura "Guardião da Chama" e o texto começando no conteúdo; usuário de sistema renomeado; `discord_name` preenchido para todos. |
| Nome no portal | Aba "Nome no portal" com o nome do Discord no apoio; "Mestre de Teste" → toast "Você aparece como Mestre de Teste no portal."; o menu da conta passa a "Conta de Mestre de Teste". Apagado, volta a "Guilherme (dev)". |
| Arquivo de Crônicas | Autores: "Guardião da Chama"; nenhum "Chama AP" nem "Escrito por" na página. |
| Organizar o arquivo | Cada crônica tem "Tags" e "Assinatura" com rótulos que incluem o título ("Assinatura de Validação: Ecos na Floresta"). |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Alto | O "AP" vinha do usuário de sistema, que nunca faz login: o formulário de nome não o alcançaria. | A migração 0034 renomeia o usuário de sistema. |
| Médio | Crônicas publicadas não abrem no editor, então a assinatura das já importadas não podia ser trocada. | Assinatura também em "Organizar o arquivo". |
| Médio | Contas sem nome do Discord guardado não voltariam ao nome original ao apagar o nome no portal. | O primeiro salvamento guarda o nome atual como nome do Discord. |

## Pendências aceitas

- O nome no portal é por pessoa, para todas as campanhas.
- Publicações enviadas do portal ao Discord continuam usando o nome e o
  avatar narrativos escolhidos no envio.
