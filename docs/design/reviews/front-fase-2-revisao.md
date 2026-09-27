# Revisão de UI/UX — fase 2 do front (portal público e área do jogador)

Revisão da implementação contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e o
[ADR 0005](../../architecture/adr/0005-front-end-escuro-e-navegacao-completa.md).

## Execução

- **Ambiente:** `bun run dev` com D1 local, missões e registro de diário
  semeados, e sessão de desenvolvimento com papel `owner`.
- **Lojista:** revisado pela rota `/dev/merchant-purchase`, cujas fixtures
  cobrem preço estruturado, preço especial, item esgotado e saldo insuficiente.
- **Larguras:** 1440, 768 e 375 px.

## Entregas revisadas

| Superfície | O que mudou |
| --- | --- |
| `/` | Destaques com três chamados, duas crônicas e dois registros, cada bloco levando à rota completa. |
| `/missoes` | Busca, filtros por situação (recrutando, lista de espera, minhas inscrições), cartões com risco, companhia e data relativa. |
| `/missoes/[id]` | Página de detalhe com inscrição, estado da pessoa e link para o Código. |
| `/cronicas`, `/diario` | Arquivo com busca e cartões de prévia; página de leitura com largura controlada. |
| `/lojista` | Catálogo em cartões, diálogo de pedido em Radix, pedidos do jogador reaproveitados na área do jogador. |
| `/ordem` | Documento reescrito em seções e cartões, com sub-navegação fixa. |
| `/eu` | Nova aba **Minhas inscrições**, que usa o `currentUserSignup` que a lista de missões já trazia, sem endpoint novo. |

## Resultados

| Item verificado | Resultado |
| --- | --- |
| Fluxo de inscrição de ponta a ponta | Inscrever-se no detalhe atualiza selo, companhia e ação; a missão aparece em `/eu?aba=inscricoes`. |
| Diálogo de pedido | Foco inicial na quantidade; `Esc` fecha e o foco volta ao botão de origem; custo e saldo atualizam ao vivo. |
| Crônica por id | O novo `GET /api/posts/[id]` abre a crônica; teste cobre 404 e campanha privada. |
| Rolagem horizontal | Zero em 375 px nas onze rotas revisadas. As faixas roláveis restantes (sub-navegação do Código) são intencionais. |
| Termos inventados | Ausentes; teste de regressão mantido. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Alto | As folhas legadas eram importadas sem camada, e CSS sem camada vence qualquer `@layer`: o botão de filtro ativo ficava branco no branco e utilidades novas eram ignoradas em várias telas. | O legado passou a ser importado em `@layer legacy`, abaixo das utilidades, com a ordem declarada em `globals.css`. Teste cobre a ordem. |
| Médio | `m-0` nos filhos anulava o `space-y` dos contêineres: parágrafos das crônicas sem espaçamento. | `m-0` removido dos componentes novos, porque o preflight do Tailwind já zera as margens. |
| Médio | O diálogo controlado por estado não devolvia o foco ao botão de origem. | `Dialog` ganhou `returnFocusRef`. |
| Médio | Em 375 px, a terceira aba de `/eu` ficava fora da tela. | As abas dividem a largura e quebram linha no celular. |
| Médio | A aba de inscrições vazia dizia "ajuste a busca", sem busca na tela. | Estado vazio próprio, com atalho para os chamados abertos. |
| Baixo | O `FeedbackState` dependia do CSS legado e grudava título e texto. | Reescrito em Tailwind. |

## Pendências aceitas

- **Metadados por item:** as páginas de detalhe usam título e descrição
  genéricos por rota, porque carregam os dados no cliente. Metadados por item
  exigem leitura no servidor.
- **Painel de gestão:** ainda usa `merchant.css`, `characters.css`, `admin.css`
  e `responsive.css`, que saem na fase 3.
- **Datas de crônicas:** algumas crônicas semeadas não têm `publishedAt` e
  aparecem como "Sem data".
