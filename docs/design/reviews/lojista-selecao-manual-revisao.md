# Revisão de UI/UX — Seleção manual do estoque do Lojista

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e a
[especificação do estoque](../../product/specs/lojista-sorteio-de-estoque.md).

## Especificação

- **Usuário:** mestre ou gestor da campanha (`merchant:catalog:manage`).
- **Objetivo:** decidir exatamente o que o Lojista vende, sem depender do
  sorteio e sem cadastrar item por item no Foundry.
- **Área:** aba **Seleção** (`?aba=selecao`) em `/dashboard/estoque`, entre
  Sorteio e Catálogo.
  - **Catálogo:** busca, filtro por categoria e lista com disponibilidade,
    categoria, preço e dano ou defesa; "Adicionar" põe o item com quantidade 1.
  - **Estoque escolhido:** itens com quantidade (1 a 100) e "Remover";
    contagem de itens e unidades; "Carregar o estoque atual" e "Limpar".
  - **Envio:** "Enviar ao Foundry" com `ConfirmDialog`, que explica que só os
    itens enviados antes pelo portal são trocados.
  - **Sorteio:** "Ajustar à mão" na prévia leva os itens sorteados para a
    seleção.
- **Estados:**
  - catálogo vazio, com "Abrir o catálogo";
  - seleção vazia;
  - nenhum resultado na busca;
  - limite de 100 itens;
  - sem envio anterior, com "Carregar o estoque atual" desabilitado;
  - envio bloqueado (sem mundo, módulo antigo, Lojista não configurado);
  - aguardando o Foundry, aplicado ou falhou;
  - item desativado no catálogo antes do envio (409 com orientação).
- A seleção continua montada ao trocar de aba dentro do painel.

## Validação renderizada

Ambiente local com D1 migrado, sessão `owner` e o catálogo base (137 itens). O
bridge do Foundry não está configurado localmente; o envio aplicado foi
simulado no D1 local.

| Verificação | Resultado |
| --- | --- |
| Busca e inclusão | Buscar um item e usar "Adicionar" põe o item na seleção; o botão passa a "Na seleção" e a aba mostra a contagem. |
| Quantidade | Alterar para 5 atualiza o resumo para "1 item · 5 unidades". |
| Ajustar à mão | A partir da prévia do sorteio, os 5 itens sorteados vão para a seleção, e a aba muda para Seleção. |
| Envio (API) | `POST /merchant/stock/selections` devolve a prévia com `mode: "manual"` e as quantidades escolhidas. |
| Estoque atual | Com um envio aplicado, "Carregar o estoque atual" traz os itens e as quantidades, com toast de confirmação. |
| Situação | O aviso "Estoque aplicado no Lojista" aparece na aba. |
| Histórico | O envio aparece como "Seleção manual · 2 itens · 5 unidades". |
| 375 px | Sem rolagem horizontal; as quatro abas cabem em uma linha, com 44 px. |
| 768 px | Sem rolagem horizontal. |
| 1440 px | Catálogo e estoque escolhido lado a lado. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | No celular, o rótulo "Seleção manual (2)" quebrava em três linhas. | A aba passa a "Seleção (2)". |
| Baixo | O sobretítulo da área ainda dizia "Sorteio de estoque". | Passa a "Sorteio e seleção". |

## Pendências aceitas

- "Ajustar à mão" substitui a seleção em andamento sem pedir confirmação. A
  ação é explícita e o conteúdo anterior pode ser recarregado do estoque atual.
- "Estoque atual" é o último envio do portal. Itens colocados ou vendidos à mão
  no Foundry não entram nessa conta.
- O envio real só pode ser validado num mundo conectado. Ele usa o mesmo
  comando do sorteio, já validado em produção.
