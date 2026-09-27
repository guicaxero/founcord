# Compra assistida do Lojista — especificação

## Objetivo

Permitir que um jogador vinculado a um personagem solicite um item do catálogo do
Lojista. O pedido deve ser persistente, idempotente e auditável, aparecer para a
equipe da campanha e gerar uma notificação privada para mestres no Foundry.

Esta etapa **não movimenta moedas, estoque ou itens automaticamente**. O preço do
Shadow of the Demon Lord atualmente é projetado como texto livre e o Foundry não
oferece uma transação atômica entre as três alterações. A interface nunca deve
comunicar que uma compra foi realizada antes da confirmação manual do mestre.

## Pessoas e permissões

- Visitante: consulta o catálogo público e pode entrar com o Discord.
- Jogador/membro: solicita para o próprio personagem vinculado e acompanha apenas
  os próprios pedidos.
- Mestre/gestor: consulta todos os pedidos da campanha e marca um pedido como
  atendido ou recusado.
- Proprietário/administrador: possui as mesmas capacidades em qualquer campanha.
- Automação: não solicita nem decide pedidos.

A autorização é sempre validada no backend. A ausência de um controle no frontend
não constitui proteção de acesso.

## Fluxo do jogador

1. O jogador autenticado encontra um item disponível no catálogo.
2. Seleciona `Solicitar ao mestre`.
3. Um diálogo identifica item, preço registrado, personagem, quantidade e um campo
   opcional de observação.
4. Antes do envio, a interface informa: `Nenhuma moeda ou item será alterado agora.`
5. O backend revalida campanha, permissão, vínculo, mundo, item, estoque e catálogo.
6. Um pedido persistente é criado e um comando idempotente é enfileirado para o
   mundo correspondente.
7. A confirmação usa `Pedido enviado`, nunca `Compra concluída`.
8. O jogador acompanha o estado em `Meus pedidos` e pode cancelar enquanto o mestre
   ainda não decidiu.

Se preço, disponibilidade ou mundo mudarem durante o envio, o pedido não deve ser
silenciosamente reinterpretado. O erro explica a mudança e orienta atualizar o
catálogo.

## Fluxo do mestre

1. O módulo recebe o comando, revalida ator do Lojista, personagem e item.
2. O módulo cria uma mensagem privada no chat para usuários GM. A mensagem deixa
   explícito que se trata de solicitação sem movimentação automática.
3. O painel `Pedidos do Lojista` lista pedidos de toda a campanha.
4. O mestre realiza o acerto no Foundry e marca o pedido como `Atendido`, ou registra
   uma recusa. Uma nota de resolução é opcional.

## Estados

- `pending_delivery`: registrado no portal, aguardando entrega ao Foundry.
- `awaiting_master`: entregue ao Foundry, aguardando decisão do mestre.
- `delivery_failed`: o Foundry não recebeu ou não aceitou a notificação.
- `fulfilled`: mestre confirmou o atendimento manual.
- `rejected`: mestre recusou o pedido.
- `cancelled`: jogador cancelou antes da decisão.

Estados terminais não podem voltar a estados anteriores. Callbacks repetidos do
Foundry são idempotentes e não sobrescrevem uma decisão humana.

## Contratos e persistência

- O banco principal guarda o workflow e sua auditoria.
- O banco de integração guarda apenas a entrega temporária do comando Foundry.
- O comando `merchant.purchase.request` inclui IDs estáveis e snapshots de nome,
  preço e quantidade solicitada.
- A chave de idempotência do comando deriva do ID do pedido.
- O callback do bridge altera somente `pending_delivery` para `awaiting_master` ou
  `delivery_failed`.
- Toda criação, cancelamento e decisão gera entrada no histórico da campanha.

## Conteúdo e acessibilidade

- `Solicitar ao mestre` é a ação primária; `Cancelar` nunca fica visualmente mais
  forte que uma decisão do mestre.
- Estado não depende apenas de cor; sempre há texto.
- Diálogo possui título acessível, descrição, foco inicial previsível, fechamento por
  `Escape` e devolução de foco ao acionador.
- Erros aparecem próximos ao fluxo e usam `role="alert"`; confirmações usam região
  de status.
- Alvos interativos têm no mínimo 44 px e foco visível.
- Em 375 px, cartões empilham conteúdo e ações sem rolagem horizontal; em 768 px,
  filtros e metadados se reorganizam; em 1440 px, a largura de leitura permanece
  controlada.

## Critérios de aceitação

- Visitante continua consultando o catálogo sem regressão.
- Usuário sem vínculo recebe orientação para procurar a equipe, sem botão inerte.
- Item esgotado ou sem preço não pode originar pedido.
- Reenvio/retry não cria dois pedidos nem duas entregas lógicas.
- O portal distingue visualmente pedido pendente, falha, atendimento, recusa e
  cancelamento.
- Somente o solicitante vê seus pedidos no portal público autenticado.
- Somente quem possui permissão de gestão vê e decide pedidos da campanha.
- A notificação no Foundry é privada para GMs e afirma que nenhuma alteração foi
  executada automaticamente.
- Testes cobrem contratos, RBAC, domínio, rotas, comando e callback.
- A interface renderizada é validada em 375, 768 e 1440 px, incluindo teclado.

