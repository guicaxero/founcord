# ADR 0002 — Isolamento do banco de integração

## Estado

Aceito em 23 de agosto de 2026.

## Contexto

O Discord Integration Worker possuía acesso ao mesmo D1 do portal. Para obter a
identidade do autor, fazia `JOIN` entre tabelas de integração, posts e usuários;
ao publicar um tópico, também gravava diretamente na auditoria da campanha.

O Marco 3 acrescentará conexões Foundry, heartbeats e filas de comandos. Esse
tráfego possui segredos, frequência e perfil de falha diferentes de sessões,
RBAC e conteúdo editorial.

## Decisão

Usar dois bancos D1 físicos:

- `ordem-da-ultima-luz`: Identity, Campaign, auditoria e outbox do portal;
- `ordem-integration-db`: inbox, deliveries, referências Discord e, no Marco 3,
  conexões e comandos Foundry.

O Integration Worker recebe somente o binding `INTEGRATION_DB`. Ele consulta e
modifica o portal exclusivamente por Service Binding e contratos validados. O
portal continua sendo o único serviço capaz de ler sessões, resolver RBAC,
alterar posts e gravar a auditoria editorial.

Identity e Campaign permanecem fisicamente juntos enquanto compartilharem o
mesmo limite de segurança e necessitarem de consistência transacional. Seus
módulos continuam separados no código para permitir uma divisão futura.

## Consequências

- não existem joins nem foreign keys entre bancos;
- IDs externos são referências opacas, não chaves estrangeiras;
- callbacks entre serviços são idempotentes;
- publicar no Discord e registrar a auditoria no portal é eventualmente
  consistente;
- a outbox permanece junto das mutações de Campaign;
- associações técnicas do Discord podem sobreviver à exclusão do conteúdo no
  portal, sem armazenar título ou corpo do post;
- migrations, bindings e rollback são independentes por banco.
