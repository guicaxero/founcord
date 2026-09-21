# Revisão de UI/UX — moedas do Mercador e saldo do personagem

Revisão da implementação contra
[`docs/product/specs/mercador-moedas-e-saldo.md`](../../product/specs/mercador-moedas-e-saldo.md)
e o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Execução

- **Rotas:** `/dev/merchant-purchase` (catálogo, diálogo, "Meus pedidos" e
  painel de pedidos) e `/dev/player-character` (saldo sincronizado e saldo
  desconhecido), rodando em `next dev`.
- **Larguras:** 1440, 768 e 375 px.
- **Fixtures:** as de desenvolvimento cobrem os estados da especificação.
  - Preços estruturados de uma e de várias moedas (`5 xp`, `8 cp`,
    `1 gc 5 ss`).
  - Preço especial (`2 gc e um favor`).
  - Item esgotado.
  - Saldo insuficiente e suficiente, e personagem sem saldo sincronizado.

## Critérios de aceitação

| # | Resultado | Evidência |
| --- | --- | --- |
| 1 | Atendido | `5 xp` aparece como "5 xelins de prata / Registrado como 5 xp"; `8 cp` como "8 centavos de cobre". |
| 2 | Atendido | "2 gc e um favor" mostra o texto original com "Preço combinado com o mestre", e o pedido fica disponível com estoque. |
| 3 | Atendido | Quantidade 1 → 3 atualiza o custo para "15 xelins de prata" dentro de uma região `aria-live="polite"`. Um valor fora do intervalo (33) mantém o último custo válido. |
| 4 | Atendido | Com saldo de 1 xelim, 3 × `5 xp` mostra "faltam 1 coroa de ouro e 4 xelins de prata", e o envio continua habilitado. |
| 5 | Atendido | Personagem sem saldo mostra "O saldo deste personagem ainda não foi sincronizado pelo Foundry." no diálogo. |
| 6 | Atendido | `/personagem` mostra as quatro moedas, inclusive zeros, e o estado sem saldo. |
| 7 | Atendido | Teste do Worker Discord confirma "**Preço:** 1 centavo de cobre". |
| 8 | Atendido | `scrollWidth === clientWidth` em 375, 768 e 1440 px no catálogo, no diálogo e em `/personagem`. O foco inicial do diálogo fica na quantidade; "Voltar ao catálogo" fecha o diálogo e devolve o foco ao botão de origem. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | No saldo, o rótulo "Centavos de cobre" quebrava em duas linhas e desalinhava o valor dessa coluna. | A grade de cada moeda ancora o valor na base (`grid-template-rows: 1fr auto`). |
| Médio | Em 768 px, o 4º item ("Custo total") nos cartões de pedido deixava as colunas estreitas, e a data quebrava no meio do número ("07/09/202 / 6"). | Grade `auto-fit` com mínimo de 7,5 rem; horários não quebram dentro do número. |
| Baixo | O rótulo "Moedas" em `/personagem` usava cor secundária, diferente de "Caminhos conhecidos". | Passou a usar o mesmo estilo de rótulo de seção. |

## Pendências aceitas

- **Fechamento por Esc:** o fechamento do diálogo por `Esc` não pôde ser
  verificado com a automação do navegador. O evento sintético também não fecha o
  diálogo de decisão existente, que não foi alterado. O comportamento é nativo
  do `<dialog>`, e o código de fechamento é o mesmo da versão anterior.
- **Mensagem aos mestres:** a notificação no Foundry continua exibindo o preço
  como o mestre o registrou, porque o interpretador de moedas vive nos contratos
  do portal. Isso é coerente para o mestre, que é quem escreveu o preço.
