# Revisão de UI/UX — Diário restrito à gestão

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

- **Usuário:** o mestre (e quem cuida do Diário na gestão: `session:manage`,
  `post:review`, `post:publish` ou `post:delete`), que quer usar o Diário
  algumas vezes antes de mostrá-lo aos jogadores.
- **Objetivo:** tirar o Diário de Sessões da vista dos jogadores por enquanto,
  sem perder nada, e poder reabri-lo depois sem novo deploy.
- **Decisão:** a campanha ganha "Diário de Sessões aberto aos jogadores"
  (`campaigns.diary_public`, migração 0030), **desligado** por padrão.
  Fechado, só a gestão lê o Diário; o backend responde `403 diary_restricted`
  a visitantes e jogadores, na lista e no detalhe.
- **Hierarquia e fluxo:**
  - Visitante e jogador: o Diário some do menu, dos atalhos e da seção da
    página inicial. Quem abrir `/diario` por um link antigo vê "O Diário está
    fechado por enquanto", com o motivo e a ação "Ler as crônicas".
  - Gestão: continua vendo tudo. Em `/diario`, um aviso diz que só a gestão vê
    o Diário; quem tem `campaign:manage` recebe a ação "Abrir aos jogadores".
    Na área Diário de Sessões do painel, o mesmo aviso fica acima da lista.
  - Abrir/fechar: Configurações da campanha → caixa "Diário de Sessões aberto
    aos jogadores", com texto de apoio explicando o efeito → "Salvar
    configurações" (toast de sucesso, como as demais configurações).
- **Estados:** carregando (o menu só mostra o Diário depois que `/api/me`
  confirma acesso, sem piscar para visitantes); fechado; aberto; erro comum de
  leitura (inalterado).
- **Acessibilidade:** a caixa tem rótulo e `aria-describedby` no texto de
  apoio; os avisos usam `Notice` com título; o estado fechado usa
  `FeedbackState` com ação nomeada.

## Validação renderizada

Portal local (`next dev`, D1 local com a migração 0030), com um mestre
(`owner`) e um jogador de teste.

| Verificação | Resultado |
| --- | --- |
| Visitante | `/api/me` → `diary: { visible: false }`; menu e página inicial sem o Diário; a lista responde `403 diary_restricted`. |
| `/diario` fechado | "O Diário está fechado por enquanto", motivo e "Ler as crônicas". |
| Mestre | Menu com "Diário"; em `/diario`, o aviso "Só a gestão vê o Diário" com "Abrir aos jogadores" e a lista completa. |
| Painel → Diário de Sessões | Aviso "O Diário está fechado aos jogadores" acima dos filtros, com o atalho para Configurações. |
| Configurações | Caixa "Diário de Sessões aberto aos jogadores" com o texto de apoio; ao salvar, o jogador passa a ver o Diário (`visible: true`, lista `200`). Fechar de novo devolve o `403`. |
| 375 px | Estado fechado sem rolagem horizontal (`scrollWidth` 375). |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Baixo | Com o Diário fechado, o cabeçalho de `/diario` ainda descreve o conteúdo ("O que aconteceu em cada noite de jogo…"). | Aceito: o cabeçalho diz o que a área é e o aviso logo abaixo diz que está fechada. |

## Pendências aceitas

- O interruptor vale para a campanha do portal; o menu consulta o Diário da
  campanha padrão, como as demais páginas públicas.
