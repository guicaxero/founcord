## Objetivo

Descreva o resultado entregue e o problema que motivou a mudança.

## Validação

- [ ] `bun run ci` foi executado com sucesso.
- [ ] Contratos e migrações são retrocompatíveis durante o deploy.
- [ ] Autorização continua validada no backend.
- [ ] Alterações no módulo Foundry, quando necessárias, estão em PR independente.

## Interface

- [ ] Esta PR não altera experiência, apresentação, navegação, formulários ou mensagens de interface.
- [ ] Ou a especificação de UI/UX foi registrada antes da implementação.
- [ ] O contrato Front-end e a implementação foram revisados separadamente.
- [ ] A interface foi inspecionada em larguras estreita, intermediária e ampla, com teclado.
- [ ] A revisão final de UI/UX não possui achados críticos ou altos pendentes.

## Operação

- [ ] Foram avaliados impacto em Workers, D1, Queues, R2 e Workers AI.
- [ ] Novos secrets não aparecem no código, logs, comentários ou artefatos.
- [ ] Há estratégia de rollback para alterações com risco operacional.
