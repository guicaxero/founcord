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
| Conectar mundo Foundry | ✓ |  | ✓ | ✓ |  |  |  |  |
| Iniciar automação | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| Consultar automações | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |

Regras como “editar somente a própria missão” são ABAC e complementam a matriz.
O papel `automation` não recebe nenhuma permissão de publicação.

`automation:run` permite enviar, repetir e cancelar jobs na própria campanha.
`automation:read` permite acompanhar a fila e abrir o rascunho resultante. A
permissão de execução é reaplicada quando o callback tenta criar o post; perder
o acesso durante o processamento impede a materialização do rascunho.

`foundry:world:manage` é a permissão dedicada para conectar, consultar,
sincronizar e revogar mundos. Uma concessão global de `owner` cobre qualquer
campanha. `campaign_manager` e `gm` recebem essa permissão apenas no escopo da
própria campanha. `administrator` global não a recebe por padrão: a exceção
global é intencionalmente exclusiva do proprietário.
