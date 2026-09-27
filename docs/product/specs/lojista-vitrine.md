# Lojista — vitrine somente leitura

## Resultado do marco

Disponibilizar no portal público e no Discord uma projeção sanitizada do ator
Lojista existente no Foundry VTT. O Foundry permanece como fonte de verdade;
portal e bot nunca calculam saldo, alteram quantidade ou transferem itens neste
corte.

```text
Ator Lojista no Foundry
  -> módulo cliente (HTTPS autenticado)
  -> Foundry Bridge
  -> ordem-integration-db
       -> Portal /lojista
       -> Discord /lojista
```

O código do módulo cliente continua exclusivamente em
`guicaxero/founcord-module-foundryVTT`. A evolução do protocolo e a evolução do
módulo são entregues em PRs independentes.

## Contrato de dados

- Um mundo conectado publica um catálogo completo e limitado a 500 itens.
- Cada sincronização possui `syncId` idempotente e `capturedAt` para rejeitar
  snapshots atrasados.
- Item contém identificador do Foundry, nome, descrição, categoria opcional,
  imagem opcional, preço textual da origem, quantidade opcional e data da
  última alteração na origem.
- A partir do módulo 0.7.0, o item também traz raridade
  (`system.availability`: comum, incomum, raro, exótico), tipo de consumível
  (`system.consumabletype`: bebida, comida, encanto, poção, veneno, bugiganga),
  propriedades (`system.properties`), dados de arma (dano, empunhadura e
  requisito) e dados de armadura (defesa, defesa fixa, agilidade, escudo e
  requisito). Os campos são opcionais: catálogos de módulos antigos continuam
  válidos e aparecem sem esses detalhes.
- Quantidade `0`, quantidade desconhecida (`null`) e quantidade positiva são
  estados distintos.
- Preço ausente nunca é transformado em zero. O campo `system.value` do sistema
  Demon Lord é textual. Um preço só com número (`22`) não diz a moeda: o módulo
  aplica a moeda padrão escolhida pelo mestre na tela de conexão (centavos de
  cobre, se nada for escolhido) e envia `22 cp`. Catálogos antigos com número
  puro aparecem com o aviso "moeda não informada".
- Caminhos locais de imagem do Foundry não são publicados, porque o servidor do
  mestre não é exposto à internet. O módulo gera no navegador do mestre uma
  miniatura de 64 px (`data:image/webp;base64,...`, até 16 KB) a partir do
  ícone do item. Endereços HTTPS continuam aceitos.

## Seleção e atualidade

Uma campanha pode possuir mais de um mundo conectado. A vitrine seleciona o
catálogo do mundo ativo mais recente, priorizando mundo online e depois o
snapshot mais novo. Um heartbeat observado nos últimos 150 segundos caracteriza
o mundo como online.

- `fresh`: mundo online e catálogo sincronizado nos últimos 15 minutos;
- `stale`: mundo online, mas catálogo anterior a 15 minutos;
- `offline`: mundo sem heartbeat recente; o último catálogo continua visível.

O catálogo só é reenviado quando o mestre altera o estoque ou sincroniza pelo
módulo; não há atualização periódica. Por isso portal e Discord não exibem esses
estados como selo ("atualização atrasada" seria sempre verdadeiro) e mostram
apenas a data da última atualização do estoque. O campo continua no contrato
para uso interno.

Se não existir catálogo, a resposta ainda distingue campanha sem mundo, mundo
offline e integração ainda não sincronizada.

## Contrato de UI/UX

### Superfície e hierarquia

- Página pública dedicada `/lojista`, presente na navegação principal e usada
  como destino do comando Discord.
- Título “Lojista”, descrição objetiva e aviso de que a vitrine é somente para
  consulta.
- A data da última atualização do estoque fica próxima do cabeçalho, com o
  tempo relativo entre parênteses.
- Busca por nome ou descrição, filtro “Todos / Em estoque / Esgotados” e total
  de resultados.
- Nome do item é primário; preço e estoque são secundários. Raridade e tipo de
  consumível aparecem como selos com texto; dano, empunhadura, requisito, defesa
  e propriedades formam uma ficha curta. A descrição fica visível, limitada a
  três linhas quando longa, com "Ler descrição completa".
- Não há botão de compra, carrinho, saldo, edição ou controle desabilitado que
  prometa funcionalidade futura.

### Estados

Tratar explicitamente carregamento, atualização em segundo plano, catálogo
preenchido, vazio real, filtros sem resultado, mundo offline com cache, mundo
offline sem cache, catálogo desatualizado, erro recuperável e dados parciais.
Falha ao atualizar não remove um catálogo já renderizado.

### Responsividade

- 375 px: uma coluna, filtros empilhados e cartões sem overflow.
- 768 px: filtros em até duas colunas e grade de dois cartões.
- 1440 px: lista comparativa com cabeçalhos semânticos para item, descrição,
  preço e estoque.
- Zoom de 200% deve adaptar a lista antes de criar rolagem horizontal na página.

### Acessibilidade

- Um `h1`, catálogo identificado por `h2`, labels persistentes e resultados em
  região `aria-live="polite"`.
- Busca, filtros, limpeza e detalhes operáveis por teclado com foco visível.
- Estados de conexão e estoque sempre usam texto, nunca apenas cor.
- Alvos interativos mínimos de 44 px, contraste WCAG 2.2 AA e respeito a
  `prefers-reduced-motion`.

## Discord

`/lojista` consulta a mesma projeção no Integration D1. A resposta mostra o
estado do catálogo e uma seleção compacta dos itens filtrados, com link rotulado
“Consultar estoque completo” para o portal. O limite de mensagem do Discord não
é contornado por truncamento silencioso: a resposta informa quantos itens foram
mostrados e quantos existem no catálogo.

## Fora do escopo

- compra, reserva e pedido manual;
- uso do vínculo entre membro e ator para compra;
- leitura ou alteração de moedas;
- transferência de item;
- edição do catálogo no portal;
- upload ou proxy de imagens locais do Foundry.

Essas operações pertencem à etapa de compra assistida/automática e exigirão um
comando Foundry tipado, idempotência, recibo, auditoria e autorização própria.

O vínculo entre membro do portal e ator já possui um primeiro corte isolado e
auditável. Ele não altera o catálogo público e ainda não autoriza transações.
