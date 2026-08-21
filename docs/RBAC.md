# Matriz RBAC

Papéis podem ter escopo global ou de campanha. Uma concessão global cobre todas
as campanhas; uma concessão de campanha nunca vaza para outra.

| Permissão | Owner | Admin | Gestor | Mestre | Editor | Moderador | Jogador | Automação |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Gerenciar campanha | ✓ | ✓ | ✓ |  |  |  |  |  |
| Gerenciar integração | ✓ | ✓ | ✓ |  |  |  |  |  |
| Gerenciar membros | ✓ | ✓ | ✓ |  |  |  |  |  |
| Atribuir papéis | ✓ | ✓ |  |  |  |  |  |  |
| Criar missão | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| Editar missão | ✓ | ✓ | ✓ | Própria | ✓ |  |  |  |
| Revisar missão | ✓ | ✓ | ✓ |  |  | ✓ |  |  |
| Publicar missão | ✓ | ✓ | ✓ |  |  |  |  |  |
| Criar post | ✓ | ✓ | ✓ | ✓ | ✓ |  |  | Rascunho |
| Revisar post | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |
| Publicar post | ✓ | ✓ | ✓ |  |  | ✓ |  |  |
| Consultar auditoria | ✓ | ✓ | ✓ |  |  |  |  |  |

Regras como “editar somente a própria missão” são ABAC e complementam a matriz.
O papel `automation` não recebe nenhuma permissão de publicação.
