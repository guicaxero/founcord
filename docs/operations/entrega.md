# Entrega, operação e orçamento

## Fluxo normal

```text
branch codex/* -> Pull Request -> CI -> revisão -> merge em main
     -> disparo manual em main -> quality gate -> migrações -> deploy -> smoke
```

Não é permitido publicar uma alteração diretamente da estação de desenvolvimento
durante o fluxo normal. Os scripts locais de deploy permanecem apenas para
diagnóstico e recuperação de emergência.

Depois do merge, confirme que o conteúdo está presente em `main` e exclua a
branch remota e local. Ative também **Automatically delete head branches** nas
configurações do repositório.

O GitHub Free não oferece branch protection para repositórios privados. Enquanto
o projeto permanecer nessa combinação, a exigência de Pull Request é uma política
do projeto, auditável pelo histórico, mas não um bloqueio técnico contra push
direto. Proteção obrigatória de `main` sem custo requer tornar o repositório
público; mantendo-o privado, requer um plano GitHub compatível.

## Gate de produção sem custo

O repositório é privado. No GitHub Free, secrets de Environment e revisores
obrigatórios só estão disponíveis para repositórios públicos. Para manter
privacidade e custo zero, produção não reage automaticamente ao merge: um
responsável precisa abrir **Actions > Deploy production > Run workflow** e
selecionar `main`.

Cadastre os dados abaixo em **Settings > Secrets and variables > Actions** no
nível do repositório:

| Tipo | Nome | Finalidade |
| --- | --- | --- |
| Repository secret | `CLOUDFLARE_ACCOUNT_ID` | Conta que possui os Workers |
| Repository secret | `CLOUDFLARE_API_TOKEN` | Migrações e deploy |
| Repository variable opcional | `SMOKE_PORTAL_URL` | Substitui o endpoint padrão do portal |
| Repository variable opcional | `SMOKE_INTEGRATION_URL` | Substitui o endpoint do Discord Worker |
| Repository variable opcional | `SMOKE_FOUNDRY_URL` | Substitui o endpoint do Foundry Worker |
| Repository variable opcional | `SMOKE_AUTOMATION_URL` | Substitui o endpoint do Automation Worker |

O token Cloudflare deve ser limitado à conta do projeto e possuir somente as
permissões necessárias para Workers Scripts, D1 e os recursos referenciados
pelos arquivos Wrangler. Secrets de runtime, como tokens Discord e tokens entre
serviços, continuam cadastrados diretamente como Worker Secrets e não precisam
ser copiados para o GitHub. Se o repositório se tornar público no futuro, mova
os dois secrets de deploy para um Environment `production` com revisor
obrigatório.

## Workflows

### CI

Executado em toda Pull Request para `main`:

1. checkout;
2. Node fixado na versão suportada;
3. `bun install --frozen-lockfile`;
4. lint, tipos, builds e testes por `bun run ci`.

### Produção

Disparado manualmente e aceito somente com código de `main`:

1. repete o quality gate em ambiente limpo;
2. aplica migrações de Portal, Integration e Automation;
3. implanta Portal, Discord Integration, Foundry Bridge e Automation;
4. consulta os quatro endpoints de saúde com retries limitados.

## Política de migrações

Toda alteração incompatível usa expand/contract:

1. **Expandir:** adicionar tabelas, colunas e contratos opcionais.
2. **Migrar:** implantar produtores e consumidores capazes de ler os dois formatos.
3. **Preencher:** migrar dados existentes de maneira idempotente e observável.
4. **Contrair:** remover o formato antigo somente em outra PR e depois de verificar
   que nenhum consumidor ainda depende dele.

Nunca renomeie ou remova uma coluna necessária no mesmo deploy que introduz seu
substituto.

## Rollback

1. Não dispare uma nova execução do workflow de produção.
2. Identifique a versão anterior com `wrangler deployments list` usando o Wrangler
   correspondente ao serviço.
3. Execute `wrangler rollback <version-id>` com o mesmo arquivo de configuração.
4. Rode `bun run smoke:production`.
5. Registre o correlation ID, serviço, versão e causa na auditoria operacional.

Rollback de Worker não desfaz D1. Por isso migrações precisam permanecer
retrocompatíveis durante toda a janela de rollback.

## Orçamento do nível gratuito

Os limites são compartilhados pela conta, não reservados por Worker. Os valores
abaixo são guardrails operacionais; confirme os limites oficiais antes de uma
mudança de escala.

| Recurso | Limite de referência | Alerta interno | Ação |
| --- | ---: | ---: | --- |
| Workers | 100.000 requisições/dia | 70.000 | reduzir polling e investigar tráfego |
| D1 reads | 5.000.000 linhas/dia | 3.500.000 | revisar índices e projeções |
| D1 writes | 100.000 linhas/dia | 70.000 | trocar snapshots integrais por deltas |
| Queues | 10.000 operações/dia | 7.000 | avaliar retries e tamanho dos lotes |
| Cron Triggers | 5 por conta | 4 | consolidar manutenção em triggers existentes |
| R2 storage | 10 GB-mês | 7 GB-mês | revisar retenção e tamanhos de mídia |
| R2 Class A | 1.000.000 operações/mês | 700.000 | revisar uploads e listagens |
| R2 Class B | 10.000.000 operações/mês | 7.000.000 | revisar leituras e cache |

O GitHub Free inclui 2.000 minutos mensais para Actions em repositórios privados.
O CI usa Ubuntu, não publica artefatos e cancela execuções antigas da mesma PR.
Configure um orçamento de Actions com bloqueio de uso excedente para garantir
que o limite gratuito não se converta em cobrança.

Fontes conferidas em 28 de agosto de 2026:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

## Foundry permanentemente online

O módulo atual envia heartbeat a cada 30 segundos e consulta comandos a cada
5 segundos. Um único mundo com o navegador do mestre ativo durante 24 horas pode
gerar aproximadamente 20.160 requisições diárias, sem contar sincronizações.

A correção pertence ao repositório do módulo e deve ser entregue em PR própria:

- polling rápido enquanto houver atividade;
- backoff progressivo até 30–60 segundos quando ocioso;
- sincronização de personagens e itens por eventos e deltas;
- retorno imediato ao intervalo rápido quando houver comandos ou sessão ativa.
