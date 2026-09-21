# Marco 4 — Automações editoriais

## Escopo do primeiro corte vertical

O Marco 4 transforma registros fornecidos por uma pessoa autorizada em conteúdo
editorial revisável. Este corte entrega:

- Worker independente `ordem-automation`;
- D1 próprio `ordem-automation-db`;
- Queue `ordem-automation-jobs` e dead-letter queue;
- geração por Workers AI;
- resumo factual de sessão;
- rascunho de crônica;
- extração de personagens, locais, decisões, recompensas e ganchos;
- cota diária configurável;
- retry idempotente e lease de processamento;
- criação obrigatória de post `pending_review` no portal;
- retenção limitada do registro bruto e auditoria no domínio da campanha.

O corte 4.1 acrescenta sessões reais e captura automática do chat público do
Foundry. O Discord continua somente como referência associada: suas mensagens
não são importadas nesta versão. Texto colado permanece disponível para
automações editoriais avulsas.

## Marco 4.1 — Sessões e fontes reais

O portal possui uma área separada de **Sessões**, com o ciclo:

```text
preparar -> iniciar captura -> acompanhar fontes -> encerrar
         -> revisar fontes -> solicitar rascunho -> revisão humana
```

Encerrar uma captura nunca inicia a IA. A pessoa autorizada confere os
contadores, as notas do mestre e a ausência explícita do Discord antes de usar
**Gerar rascunho para revisão**.

### Fluxo Foundry

```text
Portal D1                  Foundry Bridge / Integration D1       Módulo
campaign_sessions  --->   foundry_capture_sessions       <---  chat público
                               |
                               +-- foundry_chat_events
                                       |
Portal solicita texto <--- transcript sanitizado e limitado
        |
        +-- Automation Worker -> post pending_review
```

- o Portal D1 guarda sessão, missão relacionada, notas, responsável e vínculo
  do job editorial;
- o Integration D1 guarda eventos temporários e idempotentes do Foundry;
- o módulo envia apenas texto simples de mensagens públicas pelo HTTPS de saída;
- sussurros, rolagens cegas, mensagens privadas e HTML não entram no contrato;
- mensagens fora de uma captura ativa e mensagens anteriores ao início são
  descartadas;
- eventos brutos de capturas encerradas são removidos após 90 dias;
- o Automation D1 recebe somente a fonte composta e limitada que foi confirmada
  na etapa de preparação do rascunho.

O módulo mantém no máximo 500 projeções públicas em uma configuração do mundo
para tolerar indisponibilidade. O Bridge deduplica pelo par mundo/mensagem; um
reenvio não cria eventos nem altera o contador duas vezes.

## Topologia

```text
Pessoa autorizada -> Portal/BFF -> Automation Worker -> Automation D1
                                         |
                                         +-> Queue -> Workers AI
                                                       |
                                                       +-> Portal interno
                                                           -> post pending_review
                                                           -> auditoria/outbox
```

O Portal autentica a sessão Discord e aplica RBAC antes de criar, listar,
cancelar ou repetir um job. O Automation Worker não recebe cookies, papéis nem
acesso ao D1 do portal.

## Ownership

### Automation D1

- `automation_jobs`: fonte, estado, lease, tentativas e resultado do job;
- `automation_daily_usage`: cota operacional diária e volume de caracteres.

### Portal D1

- `automation_draft_links`: idempotência entre job e post;
- `posts`: rascunho editorial em `pending_review`;
- `audit_log`: solicitação, retry, cancelamento e criação do rascunho;
- `outbox_events`: evento editorial do post.

Um banco nunca consulta tabelas do outro. IDs atravessam a fronteira apenas por
contratos validados com Zod.

## Garantia de revisão humana

O Worker não possui rota, binding ou permissão para aprovar ou publicar. Ao
terminar uma geração, ele chama somente
`POST /api/internal/automation/drafts`. Esse callback:

1. autentica `AUTOMATION_SERVICE_TOKEN`;
2. reidrata a pessoa que solicitou o job;
3. reaplica `automation:run` no escopo da campanha;
4. recusa campanhas arquivadas;
5. cria o post diretamente como `pending_review` e `source = automation`;
6. vincula `jobId` e `postId` de forma idempotente;
7. grava auditoria e outbox na mesma operação D1.

Somente o fluxo editorial humano já existente pode mover o post para
`approved` e depois `published`.

## Segurança e privacidade

- o registro é tratado pelo prompt como dado não confiável;
- instruções encontradas dentro do registro são ignoradas;
- a IA é orientada a usar somente fatos presentes na fonte;
- a saída precisa obedecer ao contrato `{ title, body }` antes do callback;
- mensagens de erro persistidas são truncadas e não incluem tokens;
- jobs usam `Idempotency-Key` e lease de três minutos;
- registros cancelados são apagados imediatamente;
- a manutenção reenfileira jobs órfãos a cada cinco minutos;
- fontes de jobs concluídos, falhos ou cancelados são apagadas após 30 dias pelo
  mesmo Cron Trigger;
- o secret de automação é diferente do token de Integration/Foundry.

Não envie segredos, notas privadas do mestre ou dados pessoais desnecessários à
automação.

## Custo e limites

Workers AI possui alocação gratuita diária e interrompe novas inferências
quando o limite do plano gratuito termina. O projeto adiciona uma proteção mais
conservadora: `AUTOMATION_DAILY_JOB_LIMIT=3` por padrão. A interface exibe uso e
saldo antes de aceitar um novo registro.

Referências oficiais:

- [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [Workers AI JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Queues JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/)

O modelo padrão é `@cf/meta/llama-3.1-8b-instruct-fast`. A variante sem o
sufixo `-fast` foi descontinuada pela Cloudflare em 30 de maio de 2026, enquanto
a variante rápida permanece ativa. A troca usa a variável `AUTOMATION_MODEL` e
não exige mudança de contrato. Alguns modelos podem exigir faturamento;
mantenha um modelo disponível no Workers Free.

A geração usa JSON Mode com um schema explícito para `title` e `body`. O parser
aceita tanto a resposta estruturada do binding quanto a resposta textual e o
envelope da API REST, mantendo a validação final pelo contrato Zod.

Referência de compatibilidade:

- [Descontinuações de modelos em maio de 2026](https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/)

## Por que TypeScript, não Python, neste corte

Workers AI, Queue, D1 e Service Bindings possuem integração nativa no mesmo
runtime TypeScript já usado pelos outros Workers. Um serviço Python separado
adicionaria hospedagem, autenticação e observabilidade sem melhorar a extração
de texto atual. Python permanece uma opção para importadores locais futuros que
dependam de bibliotecas específicas, como processamento de arquivos complexos;
esses importadores deverão criar jobs pelo mesmo contrato HTTP.

## Recursos provisionados

```text
D1: ordem-automation-db
Queue: ordem-automation-jobs
DLQ: ordem-automation-jobs-dlq
Worker: ordem-automation
```

O `database_id` do D1 está versionado apenas como identificador público de
recurso no Wrangler. Credenciais nunca são versionadas.

## Secret

Gere um token exclusivo. Esta versão funciona também no Windows PowerShell que
não oferece `RandomNumberGenerator.Fill`:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$token = [Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Cadastre exatamente o mesmo valor no Portal e no Automation Worker:

```powershell
$token | bunx wrangler secret put AUTOMATION_SERVICE_TOKEN
$token | bunx wrangler secret put AUTOMATION_SERVICE_TOKEN --config workers/automation/wrangler.jsonc
Remove-Variable token
```

Não reutilize `INTEGRATION_SERVICE_TOKEN`.

## Migrations locais

```bash
bun run db:migrate:portal:local
bun run db:migrate:integration:local
bun run db:migrate:automation:local
```

## Publicação

Depois do merge na `main`:

1. confirme D1 Time Travel/backup do banco do portal e do Integration D1;
2. aplique a migration do Integration D1;
3. aplique a migration do portal;
4. publique o Foundry Bridge;
5. publique o Portal com a área de sessões e RBAC;
6. publique o Automation Worker quando houver mudança nele;
7. valide `/health` dos Workers;
8. publique a release `v0.3.0` do módulo depois do merge do repositório próprio;
9. inicie uma sessão, envie chat público, encerre e gere um rascunho de teste;
10. confirme que o post nasceu em revisão e que um sussurro não foi capturado.

```bash
bun run db:migrate:portal:remote
bun run db:migrate:integration:remote
bun run deploy:foundry
bun run db:migrate:automation:remote
bun run deploy:portal
bun run deploy:automation
```

## Verificação

```bash
bun run typecheck
bun run lint
bun run build
bun run bundle
bun run test:unit
bun run test:integration
```

O teste de integração usa Miniflare, D1 e Queue locais para validar token,
contratos, idempotência, isolamento por campanha, cota e cancelamento sem gastar
inferência do Workers AI.

## Falhas e recuperação

- uma falha transitória volta à Queue após 30 segundos;
- o job possui no máximo três leases automáticos;
- uma entrega duplicada não processa um job que já possui lease ou resultado;
- o callback idempotente impede dois posts para o mesmo job;
- ao esgotar tentativas, o registro permanece como `failed` e pode ser reenviado
  manualmente enquanto existir cota;
- falhas não apagam posts já criados nem publicam conteúdo.

## Rollback

1. remova o acesso à aba de automações revertendo o Portal;
2. desative o consumidor ou reverta `ordem-automation`;
3. preserve Queue, DLQ e D1 para diagnóstico;
4. posts já criados continuam em revisão e podem ser arquivados manualmente;
5. não remova `automation_draft_links` durante o rollback, pois ela protege a
   idempotência de callbacks reentregues.
