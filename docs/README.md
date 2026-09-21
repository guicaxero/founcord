# Documentação

| Pasta | Quando consultar |
| --- | --- |
| [`architecture/`](architecture/) | Antes de criar um domínio, Worker, contrato ou permissão. Contém [arquitetura](architecture/arquitetura.md), [RBAC](architecture/rbac.md) e os [ADRs](architecture/adr/). |
| [`operations/`](operations/) | Para implantar, provisionar ou recuperar produção. Contém o [processo de entrega](operations/entrega.md) e os [runbooks](operations/runbooks/) de cada integração. |
| [`product/`](product/) | Para entender o que existe e o que vem a seguir. Contém o [plano de implementação](product/plano-de-implementacao.md) e as [especificações](product/specs/) de cada funcionalidade. |
| [`design/`](design/) | Antes de qualquer mudança de interface. Contém o [padrão de UI/UX](design/padrao-de-ui-ux.md), a [fundação visual](design/fundacao-ui.md) e as [revisões](design/reviews/) registradas. |

## Runbooks

| Runbook | Escopo |
| --- | --- |
| [cloudflare-portal](operations/runbooks/cloudflare-portal.md) | Portal Worker, D1 principal, OAuth e secrets (Marco 1.5). |
| [discord](operations/runbooks/discord.md) | Bot HTTP, comandos, fila de publicações e webhooks (Marco 2). |
| [banco-de-integracao](operations/runbooks/banco-de-integracao.md) | D1 de integração isolado (Marco 2.5). |
| [foundry](operations/runbooks/foundry.md) | Foundry Bridge, pareamento e projeções (Marco 3). |
| [automacoes](operations/runbooks/automacoes.md) | Automation Worker, Workers AI e cota (Marco 4). |
