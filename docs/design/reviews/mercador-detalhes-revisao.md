# Revisão de UI/UX — detalhes do item no Mercador

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e a
[especificação da vitrine](../../product/specs/mercador-vitrine.md).

## Pedido

- O ícone do item não aparecia.
- Preços com um número só apareciam sem moeda ("22").
- O cartão precisava mostrar propriedades, quantidade, tipo de consumível,
  descrição, raridade e preço.
- O selo "Atualização atrasada" aparecia sempre, porque o catálogo só é
  reenviado quando o mestre altera o estoque.

## Especificação

| Elemento | Decisão |
| --- | --- |
| Ícone | Miniatura de 64 px enviada pelo módulo; sem imagem, a inicial do nome. |
| Raridade e consumível | Selos com o nome do livro (Comum, Incomum, Raro, Exótico; Bebida, Comida, Encanto, Poção, Veneno, Bugiganga). A cor apenas reforça. |
| Ficha curta | Dano, empunhadura e requisito de armas; defesa, defesa fixa, agilidade, escudo e requisito de armaduras; propriedades em linha própria. |
| Descrição | Visível. Acima de 220 caracteres, limitada a três linhas com "Ler descrição completa" (`aria-expanded`). |
| Preço | Nome completo da moeda. Número sem moeda mostra "Moeda não informada no Foundry" até o módulo 0.7.0 reenviar o catálogo. |
| Atualização | Uma linha: "Última atualização do estoque: 7 de set. de 2026, 12:03 (há 18 dias)", sem selo de estado. |
| Busca | Nome, descrição, propriedades e categoria. |

## Validação renderizada

Prévia `/dev/merchant-purchase`, com poção incomum com miniatura, arma rara com
requisito, armadura com descrição longa e pão com preço "22".

| Largura | Resultado |
| --- | --- |
| 1440 px | Ícone, selos, ficha e preço alinhados; ficha da arma em chips. |
| 375 px | Sem rolagem horizontal; preço e ação vão para baixo do conteúdo, separados por linha. |
| Teclado | "Ler descrição completa" alterna `aria-expanded` e o texto do botão. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | A descrição ficava escondida atrás de "Ver detalhes", e o pedido era mostrá-la. | Descrição visível, com recorte só para textos longos. |
| Médio | O Discord também exibia "Dados desatualizados". | Mesmo tratamento do portal: só a data. |
| Baixo | O catálogo inteiro vai para uma linha do D1 (máximo de 2 MB). | O contrato limita a soma das miniaturas a 1 milhão de caracteres; o módulo respeita um orçamento menor. |

## Pendências aceitas

- Itens de catálogos anteriores ao módulo 0.7.0 continuam sem ícone e sem
  detalhes até o mestre sincronizar de novo.
