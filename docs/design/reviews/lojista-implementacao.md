# Lojista — contrato de implementação do frontend

## Objetivo

Entregar em `/lojista` uma vitrine pública e somente leitura da projeção
`MerchantCatalogResponse`, sem sugerir compra, reserva, edição ou acesso ao ator
do Foundry.

## Integração

- Consulta: `GET /api/campaigns/:campaignId/merchant`.
- Cache e atualização: TanStack Query, chave
  `queryKeys.merchant(campaignId)`, atualização automática a cada 60 segundos e
  nova tentativa manual nos estados recuperáveis.
- Segurança de apresentação: descrições são renderizadas como texto, nunca como
  HTML; imagens somente usam as URLs HTTPS já validadas pelo contrato.
- Uma falha de atualização não remove dados já mantidos pelo cache.

## Hierarquia e estados

1. Título, explicação de consulta e ausência deliberada de compra.
2. Estado da conexão e horários exatos do catálogo e do mundo.
3. Busca por nome/descrição, filtro de disponibilidade e contagem de resultados.
4. Itens com nome/categoria, descrição progressiva, preço e estoque textual.

O preço é exibido exatamente como recebido de `item.system.value`, sem parsing,
cálculo, conversão ou inferência de moeda no navegador.

Foram separados: carregamento inicial, erro inicial recuperável, erro de
atualização com cache, campanha sem mundo, mundo offline sem cache, mundo online
aguardando sincronização, catálogo vazio, filtros sem resultado, catálogo
atrasado e catálogo offline com cache.

## Responsividade e acessibilidade

- Até 760 px: uma coluna, controles empilhados e cartões sem overflow.
- De 761 a 1199 px: grade de dois cartões.
- A partir de 1200 px: tabela com cabeçalhos semânticos para item, descrição,
  preço e estoque. Em zoom alto o viewport volta aos cartões antes de exigir
  rolagem horizontal.
- Um único `h1`; catálogo identificado por `h2`; campos com labels persistentes;
  contagem em `aria-live="polite"`; `details/summary` nativo para descrição;
  estados de conexão e estoque comunicados por texto e cor; controles com alvo
  mínimo de 44 px e foco global visível.

## Decisões de escopo

- Quantidade desconhecida aparece somente em “Todos”; “Em estoque” significa
  quantidade positiva confirmada e “Esgotados” significa quantidade zero.
- O componente de imagem usa elemento nativo porque as origens HTTPS do Foundry
  são dinâmicas e não podem ser enumeradas no `next.config`; a imagem é
  decorativa porque o nome do item já está no mesmo cabeçalho.
- O Código da Ordem mantém sua navegação interna própria; o link do Lojista foi
  acrescentado à navegação principal do portal e a nova página oferece retorno
  a todas as superfícies públicas.

## Validação renderizada — 2026-08-31

A página foi executada localmente com um catálogo tipado de quatro itens,
incluindo quantidade positiva, zero e desconhecida, além de preço e descrição
ausentes. A inspeção renderizada confirmou:

- **375 × 812:** uma coluna, quatro cartões, controles empilhados, um único
  `h1` e largura de rolagem menor ou igual ao viewport;
- **768 × 900:** dois cartões por linha e nenhuma rolagem horizontal;
- **1440 × 1000:** tabela semântica, navegação principal visível e nenhuma
  rolagem horizontal;
- busca sem distinção de acentos, filtro de esgotados e limpeza atualizam a
  contagem anunciada;
- descrições abrem e fecham por `details/summary`, com rótulo atualizado;
- o foco do campo é visível com contorno sólido de 3 px;
- o navegador não registrou erros ou avisos durante o fluxo.

Na revisão final de UI/UX não restaram achados críticos, altos ou médios. A
captura visual do painel do módulo Foundry permanece como validação operacional
da release, pois depende de um mundo aberto com o sistema `demonlord`; estrutura,
estados, responsividade, localização e sintaxe do módulo foram validados antes
do PR independente.
