# Mercador — vitrine somente leitura

## Resultado do marco

Disponibilizar no portal público e no Discord uma projeção sanitizada do ator
Mercador existente no Foundry VTT. O Foundry permanece como fonte de verdade;
portal e bot nunca calculam saldo, alteram quantidade ou transferem itens neste
corte.

```text
Ator Mercador no Foundry
  -> módulo cliente (HTTPS autenticado)
  -> Foundry Bridge
  -> ordem-integration-db
       -> Portal /mercador
       -> Discord /mercador
```

O código do módulo cliente continua exclusivamente em
`guicaxero/founcord-module-foundryVTT`. A evolução do protocolo e a evolução do
módulo são entregues em PRs independentes.

## Contrato de dados

- Um mundo conectado publica um catálogo completo e limitado a 500 itens.
- Cada sincronização possui `syncId` idempotente e `capturedAt` para rejeitar
  snapshots atrasados.
- Item contém identificador do Foundry, nome, descrição, categoria opcional,
  imagem HTTPS opcional, preço textual da origem, quantidade opcional e data da
  última alteração na origem.
- Quantidade `0`, quantidade desconhecida (`null`) e quantidade positiva são
  estados distintos.
- Preço ausente nunca é transformado em zero. O campo `system.value` do sistema
  Demon Lord é textual; ele é preservado como veio da origem e não é inferido,
  convertido ou usado em cálculos pelo portal.
- Caminhos locais de imagem do Foundry não são publicados; somente recursos
  HTTPS acessíveis ao navegador podem compor a projeção.

## Seleção e atualidade

Uma campanha pode possuir mais de um mundo conectado. A vitrine seleciona o
catálogo do mundo ativo mais recente, priorizando mundo online e depois o
snapshot mais novo. Um heartbeat observado nos últimos 90 segundos caracteriza
o mundo como online.

- `fresh`: mundo online e catálogo sincronizado nos últimos 15 minutos;
- `stale`: mundo online, mas catálogo anterior a 15 minutos;
- `offline`: mundo sem heartbeat recente; o último catálogo continua visível.

Se não existir catálogo, a resposta ainda distingue campanha sem mundo, mundo
offline e integração ainda não sincronizada.

## Contrato de UI/UX

### Superfície e hierarquia

- Página pública dedicada `/mercador`, presente na navegação principal e usada
  como destino do comando Discord.
- Título “Mercador”, descrição objetiva e aviso de que a vitrine é somente para
  consulta.
- Estado e hora exata da última sincronização ficam próximos do cabeçalho.
- Busca por nome ou descrição, filtro “Todos / Em estoque / Esgotados” e total
  de resultados.
- Nome do item é primário; preço e estoque são secundários; descrição completa
  é revelada progressivamente sem modal.
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

`/mercador` consulta a mesma projeção no Integration D1. A resposta mostra o
estado do catálogo e uma seleção compacta dos itens filtrados, com link rotulado
“Consultar estoque completo” para o portal. O limite de mensagem do Discord não
é contornado por truncamento silencioso: a resposta informa quantos itens foram
mostrados e quantos existem no catálogo.

## Fora do escopo

- compra, reserva e pedido manual;
- vínculo entre usuário Discord e ator;
- leitura ou alteração de moedas;
- transferência de item;
- edição do catálogo no portal;
- upload ou proxy de imagens locais do Foundry.

Essas operações pertencem à etapa de compra assistida/automática e exigirão um
comando Foundry tipado, idempotência, recibo, auditoria e autorização própria.
