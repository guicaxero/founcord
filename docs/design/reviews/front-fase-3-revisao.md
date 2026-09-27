# Revisão de UI/UX — fase 3 do front (painel de gestão)

Revisão da implementação contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e o
[ADR 0005](../../architecture/adr/0005-front-end-escuro-e-navegacao-completa.md).

## Execução

- **Ambiente:** `bun run dev` com D1 local e sessão de desenvolvimento com papel
  `owner`. As automações e o Foundry não estão configurados localmente, o que
  permitiu revisar os estados de erro dessas áreas.
- **Dados de exemplo:** a prévia `/dev/ui-foundation/[area]` cobre publicação
  arquivada, resumos em revisão e arquivado, e o elenco de personagens.
- **Larguras:** 1440, 768 e 375 px.

## Entregas revisadas

| Superfície | O que mudou |
| --- | --- |
| Rotas | `/dashboard/[area]`, com 11 áreas. `/dashboard` abre a primeira área liberada. Endereço desconhecido responde 404; área sem permissão explica o motivo e aponta uma área liberada. |
| Navegação | Barra lateral agrupada (mesa de jogo, conteúdo, Foundry e Lojista, campanha) com indicador animado. Abaixo de 1024 px, seletores de campanha e de área. A campanha escolhida persiste entre áreas, porque o painel vive no layout. |
| Estrutura | O painel deixou de abrir um segundo `<main id="main-content">` dentro do AppShell. |
| Missões, Publicações, Diário, Histórico | `DataTable` com ordenação por teclado e `aria-sort`, busca e filtros com contagem. Abaixo de 768 px, cada linha vira cartão. |
| Formulários | Criação e edição em diálogo (missão, publicação, resumo, sessão, fontes da sessão, automação, membro, campanha). |
| Ações destrutivas | `ConfirmDialog` para arquivar, desconectar mundo, desvincular personagem, suspender membro e encerrar captura. Exclusão permanente exige `EXCLUIR`. |
| Retorno | Toasts em Radix para resultados; erros ficam no formulário e recebem foco. |
| Pareamento do Foundry | `/foundry/connect` migrado para as primitivas; o sucesso leva direto a `/dashboard/foundry`. |
| CSS | Saíram `base.css`, `merchant.css`, `characters.css`, `admin.css` e `responsive.css` (4.980 linhas), a camada `legacy` e o bloco de compatibilidade. |

## Resultados

| Item verificado | Resultado |
| --- | --- |
| Rotas das 11 áreas | Título, item atual (`aria-current="page"`) e conteúdo corretos. Nenhum `<main>` aninhado. |
| Diálogo de missão | Foco inicial no título; `Esc` fecha e o foco volta a "Nova missão". |
| Confirmação de arquivamento | Foco inicial em "Cancelar"; ao cancelar, o foco volta a "Arquivar". |
| Exclusão permanente | O botão só é liberado com `EXCLUIR` exato; `excluir` não serve. |
| Ordenação | Clicar em "Missão" ordena de A a Z e marca `aria-sort="ascending"`. |
| Toast | "Configurações salvas" aparece no canto inferior direito, acima do conteúdo. |
| Rolagem horizontal | Zero em 375 e 768 px nas 11 áreas. |
| Pipeline | `bun run ci`: 15 arquivos e 120 testes. Bundle do portal com 1,64 MB comprimido. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Alto | O painel renderizava `<main id="main-content">` dentro do `<main>` do AppShell: dois marcos principais e um id duplicado, o que quebrava o "Pular para o conteúdo". | O painel e seus estados viraram blocos comuns; um teste impede o `<main>` de voltar. |
| Médio | O menu "Gestão" usava uma lista própria de permissões, sem `merchant:purchase:manage`. Um perfil com apenas essa permissão não veria a entrada. | O menu passou a derivar das permissões das áreas. |
| Médio | Em 1440 px, a barra lateral precisava de rolagem por causa do cartão de usuário, que repetia o menu de conta do cabeçalho. | Cartão removido e itens com 40 px, que continuam confortáveis com mouse. No toque vale o seletor de 44 px. |
| Médio | Em 768 px, a coluna de ações da tabela reservava 320 px e espremia o título. | A largura fixa só vale a partir de 1024 px. |
| Baixo | O histórico dizia "Últimas 1 ações". | Singular e plural tratados. |
| Baixo | O preflight do Tailwind 4 deixa o cursor padrão em botões; o `base.css` removido fazia essa correção. | A regra foi para `globals.css`. |

## Pendências aceitas

- **Tabela como cartões:** abaixo de 768 px, a tabela muda de `display`. Os papéis
  ARIA explícitos (`row`, `cell`, `rowgroup`) mantêm a semântica em navegadores
  que a descartariam; o lint recebeu exceções comentadas nesses pontos.
- **Campanha na URL:** a campanha escolhida vive no estado do layout. Um recarregamento
  volta para a primeira campanha elegível.
- **Captura no navegador de revisão:** o painel embutido limitava o
  `requestAnimationFrame` enquanto estava em segundo plano, o que atrasava as
  animações de saída. O DOM confirmou o fechamento e o retorno de foco.
