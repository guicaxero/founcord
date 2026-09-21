# Moedas do Mercador e saldo do personagem — especificação

## Contexto

O sistema `demonlord` do Foundry guarda o preço dos itens como texto livre em
`item.system.value` (por exemplo `5 cp`, `1 gc`, `2 ss 5 cp`). O saldo do
personagem fica em `actor.system.wealth`, com quatro moedas:

| Campo | Moeda | Abreviação no sistema pt-BR | Valor em trocados |
| --- | --- | --- | --- |
| `gc` | coroa de ouro | CO | 1.000 |
| `ss` | xelim de prata | XP | 100 |
| `cp` | centavo de cobre | CC | 10 |
| `bits` | trocado | Trocados | 1 |

Hoje o portal e o bot mostram o texto cru do preço (`5 cp`), em abreviações
inglesas, e não conhecem o saldo do personagem. O jogador não consegue avaliar
se pode pagar antes de pedir, e o mestre recebe pedidos que talvez não tenham
como ser atendidos.

**Usuários:**

- O jogador vinculado a um personagem consulta o catálogo, decide a quantidade
  e envia o pedido.
- O visitante apenas consulta.
- O mestre ou gestor lê os pedidos no painel.

**Restrições:**

- O Foundry continua como fonte de verdade.
- O portal não altera moedas nem inventário: saldo e custo servem apenas para
  informar a decisão. Nenhum pedido é bloqueado por saldo, porque o mestre pode
  aceitar escambo, crédito ou acerto na mesa.
- O preço original continua sendo o valor enviado ao Foundry para revalidação.

## Regras de interpretação do preço

- Um preço é **estruturado** quando o texto contém apenas pares
  `quantidade + moeda`, separados por espaço, vírgula, `+`, `;` ou `e`.
- Aliases aceitos, sem diferenciar maiúsculas, acentos, singular e plural:

  | Moeda | Aliases |
  | --- | --- |
  | Coroa de ouro | `gc`, `gp`, `co`, `coroa(s)`, `coroa(s) de ouro`, `gold crown(s)` |
  | Xelim de prata | `ss`, `sp`, `xp`, `xelim`, `xelins`, `xelim/xelins de prata`, `silver shilling(s)` |
  | Centavo de cobre | `cp`, `cc`, `centavo(s)`, `centavo(s) de cobre`, `copper penny/pennies` |
  | Trocado | `bit(s)`, `trocado(s)` |

- Qualquer outro conteúdo, como `2 gc e um favor`, `5` ou `a combinar`, torna o
  preço **especial**. O texto é exibido exatamente como o mestre escreveu, sem
  cálculo de custo nem comparação de saldo.
- Um preço estruturado cujo valor total é zero é exibido como **Gratuito**.

## Conteúdo

**Formatação do preço:**

- Usa nomes completos em português, com plural correto, na ordem ouro → prata
  → cobre → trocados. Moedas com quantidade zero são omitidas.
- Exemplos: `1 coroa de ouro`, `5 xelins de prata`,
  `2 coroas de ouro e 5 centavos de cobre`,
  `1 xelim de prata, 3 centavos de cobre e 4 trocados`.
- Nomes completos evitam a sigla `XP`, que jogadores associam a experiência.

**Custo de um pedido:**

- O custo total multiplica cada moeda pela quantidade e mantém as denominações
  do preço: 3 × `5 cp` = `15 centavos de cobre`.

**Saldo:**

- Quatro valores, sempre na ordem ouro, prata, cobre e trocados, inclusive os
  zerados, com os rótulos "Coroas de ouro", "Xelins de prata",
  "Centavos de cobre" e "Trocados".

## Superfícies e hierarquia

### Catálogo do Mercador (`/mercador`, público)

- A coluna **Preço** mostra o preço formatado como informação principal.
- Quando o texto do mestre difere do formatado, ele aparece como detalhe
  secundário (`Registrado como 5 cp`), menor e em cor secundária. Isso mantém a
  rastreabilidade com o que o mestre vê no Foundry.
- Um preço especial aparece como texto do mestre, com a nota secundária
  `Preço combinado com o mestre`.
- Sem preço, a regra atual se mantém: `Preço não informado`, e o item fica
  indisponível para pedido.

### Diálogo de pedido

Ordem de leitura:

1. Título.
2. Personagem.
3. Preço por unidade.
4. Quantidade (campo).
5. **Custo total**, que atualiza ao mudar a quantidade.
6. **Saldo registrado** do personagem.
7. Avaliação do saldo.
8. Observação.
9. Aviso "Nenhuma moeda ou item será alterado agora".
10. Ações.

Avaliação do saldo (texto sempre presente, nunca só cor):

- **Suficiente:** `O saldo registrado cobre este pedido.`
- **Insuficiente:** `O saldo registrado parece insuficiente: faltam
  {diferença}. Você ainda pode enviar o pedido; o mestre decide o acerto.` A
  diferença é formatada em moedas canônicas: 1.000 trocados vira 1 coroa de
  ouro.
- **Saldo desconhecido** (módulo antigo ou personagem sem sincronização):
  `O saldo deste personagem ainda não foi sincronizado pelo Foundry.`
- **Preço especial:** a avaliação não aparece. No lugar do custo total aparece
  `O custo depende do acerto com o mestre.`

O botão principal continua **Enviar pedido ao mestre** e não fica desabilitado
por saldo.

### Meu personagem (`/personagem`, área do jogador)

- Nova seção **Moedas**, entre as estatísticas e os detalhes, com os quatro
  valores do saldo.
- Estado sem saldo: `Saldo ainda não sincronizado. Ele aparece após a próxima
  sincronização do Foundry.`

### Painel de pedidos e cartões "Meus pedidos"

- **Preço registrado** passa a mostrar o preço formatado.
- Um novo item **Custo total** aparece quando o preço é estruturado.

### Bot do Discord (`/mercador`)

- O campo **Preço** usa a mesma formatação do portal.

## Estados

| Estado | Comportamento |
| --- | --- |
| Preço estruturado | Formatação em português, com o original como detalhe quando diferente. |
| Preço especial | Texto do mestre, sem cálculo nem avaliação de saldo. |
| Preço ausente | "Preço não informado"; pedido indisponível (regra existente). |
| Saldo suficiente | Mensagem neutra positiva, sem bloquear. |
| Saldo insuficiente | Alerta de atenção com a diferença; envio permitido. |
| Saldo desconhecido | Mensagem informativa; envio permitido. |
| Quantidade inválida | Validação nativa existente; o custo não é recalculado para valores fora do intervalo. |

## Responsividade

- **375 px:**
  - O detalhe `Registrado como …` quebra linha abaixo do preço, sem estourar o
    cartão da linha.
  - No diálogo, custo, saldo e avaliação empilham em uma coluna, e os quatro
    valores do saldo formam uma grade de 2 × 2.
- **768 px e acima:**
  - O saldo aparece em 4 colunas.
  - O custo total e o saldo podem ficar lado a lado.
- Em nenhuma largura surge rolagem horizontal, e textos longos de preço
  especial quebram linha.

## Acessibilidade

- O custo total fica em uma região `aria-live="polite"`, para anunciar o novo
  valor ao mudar a quantidade.
- A avaliação de saldo insuficiente usa estilo de atenção, com o texto como
  portador do significado. Não usa `role="alert"`, porque não é um erro.
- O saldo usa lista de definição (`dl`) com rótulos completos.
- A ordem de foco do diálogo permanece: quantidade → observação → voltar →
  enviar.

## Critérios de aceitação

1. Um item com preço `5 cp` aparece no catálogo como `5 centavos de cobre`,
   com `Registrado como 5 cp` como detalhe secundário.
2. Um item com preço `2 gc e um favor` aparece com o texto original e a nota
   `Preço combinado com o mestre`, e o pedido continua disponível quando há
   estoque.
3. No diálogo, ao mudar a quantidade de 1 para 3 em um item de `5 cp`, o custo
   total passa a `15 centavos de cobre`, e a mudança é anunciada por leitor de
   tela.
4. Um personagem com 0 coroas, 1 xelim, 0 centavos e 0 trocados vê a avaliação
   "insuficiente" com `faltam 5 centavos de cobre` para 3 × `5 cp`. O envio
   continua possível.
5. Um personagem sem saldo sincronizado vê a mensagem de saldo desconhecido e
   consegue enviar o pedido.
6. `/personagem` mostra os quatro valores do saldo, inclusive zeros, e o estado
   sem saldo quando o módulo ainda não o enviou.
7. `/mercador` no Discord mostra o preço formatado.
8. Em 375, 768 e 1440 px não há rolagem horizontal no catálogo, no diálogo nem
   em `/personagem`. O diálogo continua operável só pelo teclado.
