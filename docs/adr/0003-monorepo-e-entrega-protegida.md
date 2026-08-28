# ADR 0003 — Monorepo e entrega protegida por serviço

## Estado

Aceito em 28 de agosto de 2026.

## Contexto

O portal, Discord Integration, Foundry Bridge e Automation já possuem entradas,
bindings, bancos e perfis de falha independentes. A presença deles no mesmo
repositório não os transforma em um monólito de implantação.

Separar um repositório por Worker não acrescentaria isolamento de runtime nem
reduziria consumo na Cloudflare. Em contrapartida, exigiria versionamento e
publicação adicionais para contratos, dificultaria testes integrados e impediria
mudanças atômicas entre produtores e consumidores TypeScript.

O processo anterior também dependia de comandos `wrangler deploy` executados em
uma estação local. Isso permitia diferenças entre ambientes e não garantia que o
conteúdo implantado tivesse passado pela mesma validação da Pull Request.

## Decisão

- Manter portal, Workers e contratos compartilhados neste monorepo.
- Manter o módulo cliente Foundry exclusivamente em
  `guicaxero/founcord-module-foundryVTT`.
- Tratar cada configuração Wrangler ativa como unidade independente de deploy.
- Entregar toda alteração por Pull Request para `main`.
- Validar Pull Requests em ambiente limpo com `npm ci` e `npm run ci`.
- Implantar produção somente a partir de `main`, por execução manual do workflow
  GitHub Actions. O disparo manual é o gate de aprovação compatível com um
  repositório privado no GitHub Free.
- Aplicar migrações aditivas antes do código e remover estruturas antigas apenas
  em uma entrega posterior, depois que todos os consumidores forem atualizados.
- Implantar primeiro o portal, que fornece contratos internos, e depois Discord,
  Foundry e Automation.
- Executar smoke tests dos quatro serviços antes de considerar o deploy concluído.

## Quando extrair outro repositório ou Worker

Uma nova fronteira exige pelo menos um motivo verificável:

1. segredos ou risco de segurança próprios;
2. escala ou limite de CPU distinto;
3. isolamento de falhas necessário;
4. ciclo de release independente;
5. responsável técnico diferente;
6. runtime incompatível com os serviços atuais.

Uma tela, tabela ou CRUD isolado não satisfaz esse critério.

## Consequências

- Contratos Zod continuam alteráveis atomicamente com seus consumidores.
- Cada Worker mantém secrets, bindings, observabilidade e rollback próprios.
- O deploy passa a exigir repository secrets do GitHub Actions. Se o repositório
  se tornar público ou migrar para um plano que os suporte, eles devem ser
  movidos para um Environment `production` com revisor obrigatório.
- Enquanto o repositório permanecer privado no GitHub Free, Pull Requests são
  política operacional, pois branch protection não está disponível nessa
  combinação. Torná-lo público ou adotar um plano compatível habilita a proteção
  técnica de `main`.
- Uma migração incompatível não pode ser misturada à remoção imediata do contrato
  anterior.
- Mudanças coordenadas com o módulo Foundry usam duas PRs e protocolo versionado,
  nunca uma cópia do módulo dentro deste repositório.
