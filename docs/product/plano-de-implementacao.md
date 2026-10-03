# Plano de implementação — Ordem da Última Luz

Documento de referência para evolução do portal comunitário de
Shadow of the Demon Lord, suas integrações com Discord e Foundry VTT e as
automações editoriais.

Este documento descreve o estado do produto, a ordem técnica das entregas e os
critérios que precisam ser atendidos antes de cada avanço. Ele complementa a
arquitetura detalhada, a matriz RBAC, o padrão de UI/UX e os runbooks de
produção.

## 1. Objetivo do produto

Construir uma plataforma gratuita e sem fins lucrativos para administrar uma
campanha persistente:

- jogadores escolhem missões e participam quando puderem;
- mestres e gestores administram missões, sessões, publicações e integrações;
- o portal é a experiência central para jogadores e administração;
- o Discord é o canal de comunidade e comandos;
- o Foundry VTT é a fonte de verdade das fichas mecânicas e do mundo conectado;
- automações ajudam na organização editorial, mas nunca publicam conteúdo sem
  revisão humana.

## 2. Princípios permanentes

- O backend é autoritativo para autenticação, autorização e regras de negócio.
- RBAC global e RBAC por campanha são superfícies distintas.
- O papel global `owner` é protegido e não pode ser removido por controles de
  uma campanha.
- O portal público, a área do jogador e o painel de gestão permanecem separados.
- O Foundry continua sendo a fonte de verdade da ficha mecânica.
- Integrações usam contratos versionados, idempotência e auditoria.
- Toda mutação externa deve ser segura para reentrega.
- Automação gera rascunhos; aprovação e publicação continuam humanas.
- Conteúdo oficial da Ordem da Última Luz tem precedência sobre texto inventado.
- Toda alteração chega à `main` por Pull Request.
- Depois do merge, a branch correspondente é removida do remoto e localmente.

## 3. Arquitetura-alvo

### 3.1 Stack

- **Portal:** Next.js App Router, React, TypeScript estrito e TailwindCSS.
- **Estado remoto no navegador:** TanStack Query; Server Components continuam
  responsáveis pela primeira renderização e metadados.
- **Serviços de domínio:** Node.js, TypeScript, Hono e contratos OpenAPI.
- **Validação:** Zod como origem dos tipos e validação em runtime.
- **Persistência:** Cloudflare D1/SQLite com migrations Drizzle.
- **Filas:** Cloudflare Queues com consumidores idempotentes.
- **IA editorial:** Workers AI, limitada por cota diária e revisão humana.
- **Módulo Foundry:** TypeScript em repositório público separado.
- **Python:** reservado para importadores ou integrações locais que realmente
  dependam de bibliotecas incompatíveis com Workers; não é necessário para o
  fluxo editorial atual.

### 3.2 Unidades implantáveis

O workspace é um monorepo de código do portal, Workers, contratos e documentação,
mas as unidades de runtime são independentes:

```text
Navegador -> Portal Worker (Next.js/BFF)
                         -> Identity
                         -> Campaign

Discord -> Discord Integration Worker -> Integration D1
                                     -> Portal por Service Binding
                                     -> Queue -> fórum Discord

Foundry -> Foundry Bridge Worker -> Integration D1

Portal -> Automation Worker -> Automation D1
                            -> Queue -> Workers AI
                            -> callback interno -> Portal
```

O módulo cliente do Foundry reside exclusivamente em:

`guicaxero/founcord-module-foundryVTT`

O repositório `guicaxero/founcord` mantém portal, Workers, contratos e
documentação de integração, sem copiar o código do módulo.

### 3.3 Bancos

Na configuração atual existem três bancos físicos:

| Banco | Responsabilidade |
| --- | --- |
| `ordem-da-ultima-luz` | Identity, Campaign, auditoria e outbox |
| `ordem-integration-db` | Discord, Foundry, inbox, jobs, entregas e referências externas |
| `ordem-automation-db` | fontes temporárias, jobs, leases, tentativas e cota de IA |

Identity e Campaign continuam juntos enquanto não houver ganho real de
segurança, escala ou ciclo de release em uma separação adicional.

## 4. Estado atual

### Entregue

- Monorepo organizado em `apps/`, `workers/` e `packages/`, com Bun, TypeScript
  em todo o código e contratos compartilhados (ADR 0004).
- Discord OAuth 2 com PKCE, sessão opaca em cookie HTTP-only e RBAC.
- Campanhas, membros, atribuição de papéis, missões, inscrições e lista de
  espera.
- Posts com fluxo de revisão, publicação, auditoria e outbox.
- Portal público e painel administrativo.
- Deploy em Cloudflare Workers/OpenNext.
- D1 isolado para as integrações Discord/Foundry.
- Bot HTTP do Discord com `/post`, modal, tag e publicação em fórum.
- Associação entre post do portal e tópico externo do Discord.
- Foundry Bridge com pareamento seguro, credencial operacional, heartbeat,
  estado online/offline, sincronização sanitizada e fila idempotente.
- Sessões com captura sanitizada de chat público do Foundry.
- Automation Worker com Workers AI, cota, leases, retry, DLQ e rascunhos
  obrigatoriamente `pending_review`.
- Diário de Sessões com entidade própria, vínculo explícito à sessão, revisão,
  publicação, arquivo e exclusão auditada.
- Front-end refeito em três fases (ADR 0005): tema escuro, Tailwind 4, Radix e
  Motion; rotas próprias para missões, crônicas, diário e área do jogador (`/eu`);
  painel de gestão com uma URL por área (`/dashboard/[area]`).
- CI protegido e workflow manual de produção.
- Deploy da PR #24 validado em produção no commit `5914126`.
- Lojista publicado no portal e no Discord, com catálogo vindo do ator
  configurado no Foundry: ícones, raridade, tipo de consumível, propriedades,
  dados de arma e armadura, moeda padrão para preços só com número (módulo 0.7.0)
  e pedidos assistidos com saldo informativo.

### Limitações conhecidas

- A identidade narrativa por webhook depende de `MANAGE_WEBHOOKS`; sem essa
  permissão a publicação usa o bot com atribuição textual.
- Compra no Lojista e edição completa de ficha ainda não existem.
- A estrutura de moedas foi confirmada: o saldo fica em `actor.system.wealth`
  (`gc`, `ss`, `cp`, `bits`) e o preço dos itens é texto livre em
  `item.system.value`. O portal interpreta os preços e exibe o saldo; a compra
  automática ainda depende de uma escrita segura e idempotente no Foundry.
- Captura atual usa apenas chat público do Foundry; Discord é referência, não
  fonte importada para automação.

## 5. Ordem de implementação

### Fase 0 — Fundação e entrega protegida — concluída

Objetivo: criar uma base sustentável sem transformar o produto em monólito.

Entregas:

- monorepo, contratos Zod/OpenAPI e TypeScript estrito;
- módulos de Identity, Campaign, Integration, Foundry e Automation;
- migrations e ownership dos três D1;
- CI para PRs;
- deploy de produção somente por workflow manual disparado na `main`;
- smoke tests dos quatro Workers;
- documentação de arquitetura, RBAC, operação e rollback.

### Fase 1 — Portal e administração — concluída

Entregas:

- login pelo Discord e sessões;
- papéis globais e por campanha;
- matriz de permissões aplicada no backend;
- campanhas, membros e papéis;
- CRUD de missões;
- quadro público e inscrições;
- posts com revisão e publicação;
- auditoria e outbox.

### Fase 1.5 — Cloudflare — concluída

Entregas:

- Portal Worker com OpenNext;
- D1 e migrations remotas;
- secrets e OAuth configurados;
- Workers de Integration, Foundry e Automation publicados;
- endpoints `/health` validados;
- procedimento de deploy e rollback documentado.

### Fase 2 — Discord — concluída

Entregas já disponíveis:

- Worker HTTP separado;
- comando `/post` com modal;
- associação do autor à identidade do portal;
- validação de fórum e tag;
- publicação assíncrona e idempotente;
- referência entre post do portal e tópico Discord;
- D1 de integração separado do banco do portal.

Melhorias concluídas após o primeiro corte:

1. **Conteúdo completo no tópico**
   - usar título, descrição e corpo preenchidos no portal;
   - incluir ao final um CTA legível para o portal, como “Abrir publicação
     completa na Ordem”;
   - não publicar somente uma URL sem contexto.

2. **Identidade visual por webhook**
   - webhook gerenciado por fórum e pertencente à aplicação;
   - nome e avatar HTTPS configurados com segurança;
   - manter o bot como responsável por comandos e operações autorizadas;
   - fallback para o bot quando `MANAGE_WEBHOOKS` não estiver disponível;
   - nenhum token de webhook armazenado no Portal, contratos ou logs.

3. **Ciclo de vida de posts**
   - permitir arquivar/remover da exibição;
   - permitir exclusão permanente somente conforme RBAC e confirmação explícita;
   - manter auditoria da ação e referências externas consistentes;
   - definir o comportamento de um tópico Discord já publicado.

### Fase 2.5 — Persistência isolada — concluída

Objetivo: impedir que o Worker de integração tenha acesso ao banco do portal.

Entregas:

- Integration D1 próprio;
- inbox, deliveries, jobs e IDs externos sob ownership da integração;
- contratos internos para comunicação com o Portal;
- migrations idempotentes, ordem de corte e rollback.

### Fase 3 — Foundry VTT — concluída no primeiro corte

Entregas:

- módulo Shadow of the Demon Lord em repositório separado;
- pareamento inicial seguro;
- troca de código temporário por credencial operacional;
- hash da credencial no servidor e revogação;
- heartbeat e estado online/offline;
- sincronização sanitizada de personagens;
- fila de comandos com lease e idempotência;
- conexão por campanha respeitando RBAC:
  - `owner`: pode conectar qualquer mundo;
  - mestre/gerente: pode conectar um mundo à própria campanha;
  - jogador/usuário: não pode conectar mundos.

Evoluções necessárias antes de considerar o domínio completo:

- sincronização por eventos/deltas para reduzir polling;
- projeções de itens e inventários;
- testes com mais de um mundo e mais de uma campanha.

### Fase 4 — Automações editoriais — primeiro corte concluído

Entregas:

- Automation Worker e Automation D1 próprios;
- Queue e DLQ;
- resumo factual, crônica e extração editorial;
- cota diária configurável;
- retry com lease e idempotência;
- fontes temporárias com retenção limitada;
- callback interno autenticado;
- todo resultado materializado como rascunho revisável;
- captura sanitizada de chat público do Foundry;
- área de sessões com preparação, captura, encerramento e revisão de fontes.

## 6. Diário de Sessões — concluído

O domínio foi separado de Posts e implantado em produção pela PR #24.

### Objetivo

Separar semanticamente e tecnicamente os resumos de sessão das publicações
editoriais. Posts representam crônicas, lore e textos editoriais; o Diário de
Sessões representa registros factuais e resumos ligados a uma sessão da
campanha.

### Escopo

- migration aditiva para uma entidade de resumo/registro de sessão;
- contratos Zod e tipos compartilhados;
- endpoints de listagem, criação, revisão, publicação, arquivamento e exclusão
  conforme RBAC;
- vínculo com campanha, sessão, missão, autor e job de automação;
- estados `draft`, `pending_review`, `published` e `archived`;
- auditoria e outbox;
- callback da Automation Worker direcionando `session_summary` para o novo
  domínio;
- área pública com nome sugerido **Diário de Sessões**;
- painel de gestão para revisão humana;
- filtros por sessão, missão, data e campanha;
- links entre uma sessão e suas missões, posts e personagens quando disponíveis;
- aplicação do design system nos componentes tocados;
- testes de contrato, RBAC, migration, idempotência e renderização.

### Regras

- encerrar captura nunca inicia a IA automaticamente;
- a pessoa autorizada revisa as fontes antes de solicitar rascunho;
- nenhum resumo é publicado diretamente pela IA;
- crônicas continuam no domínio de posts;
- dados privados, sussurros, rolagens cegas e HTML não entram na fonte;
- fontes brutas continuam sujeitas à retenção definida no runbook de automação.

## 7. Próxima entrega e funcionalidades posteriores

### 7.1 Lojista — Etapa A concluída; Etapa B em pedido assistido

> **Compra automática adiada (2026-09-25).** O desconto de moedas e a entrega
> automática do item dependem de uma escrita segura e idempotente em
> `actor.system.wealth` e no inventário do Foundry. Por decisão do produto, esse
> passo fica para depois; a compra continua assistida (o jogador pede, o mestre
> acerta no Foundry e registra a decisão). No lugar dele entrou o sorteador de
> estoque do Lojista (7.1.1).

Implementar em duas etapas para reduzir risco.

#### Etapa A — vitrine somente leitura

- ator `lojista` no Foundry como fonte de verdade;
- sincronização sanitizada de itens, preço, quantidade, descrição e imagem;
- projeção no Integration D1 e no Portal;
- aba **Lojista** no portal;
- comando `/lojista` no Discord;
- filtros e indicação de estoque;
- estado offline e data da última sincronização;
- nenhuma alteração de ficha nesta etapa.

O contrato, a persistência, a API, `/lojista`, a página pública e o comando
Discord foram publicados. A captura do ator permanece exclusivamente no
repositório público do módulo Foundry.

#### Etapa B — compra assistida ou automática

- identificar com segurança o jogador Discord/portal;
- vincular identidade ao ator do jogador no mundo conectado;
- confirmar permissões e campanha ativa;
- validar saldo e quantidade no Foundry como fonte autoritativa;
- descontar moedas e inserir item em uma operação idempotente;
- registrar recibo, auditoria e notificação;
- impedir compra quando o mundo estiver offline ou a projeção estiver vencida.

Primeiro incremento da Etapa B:

- associação explícita entre membro da campanha e ator sincronizado;
- um personagem ativo por membro e um membro por ator;
- gestão por proprietário, gestor ou mestre no escopo da campanha;
- consulta privada do próprio personagem;
- preservação do vínculo quando a projeção ficar indisponível;
- auditoria de criação, troca e remoção.

Esse incremento está especificado em `docs/product/specs/vinculo-jogador-ator.md` e não
realiza escrita em moedas ou inventário.

Segundo incremento (concluído): preços interpretados nas quatro moedas do
sistema, custo total do pedido e saldo informativo do personagem, conforme
`docs/product/specs/lojista-moedas-e-saldo.md`. Nenhum pedido é bloqueado
por saldo.

Fallback caso a escrita segura não seja possível:

- registrar pedido de compra;
- notificar mestre no portal, Discord e Foundry;
- deixar o escambo para confirmação manual;
- não simular saldo ou inventário no portal.

### 7.1.1 Sorteador de estoque do Lojista — concluído

O portal mantém a lista de itens que o Lojista pode vender (a lista base vem da
planilha "Estoque Lojista", 137 itens) e sorteia o estoque por disponibilidade
máxima, categorias, quantidade e repetição. Ao confirmar, o módulo cria os itens
no ator do Lojista; o Foundry continua sendo a fonte de verdade. Especificação em
`docs/product/specs/lojista-sorteio-de-estoque.md`.

Próximos passos registrados:

- itens feitos pelos NPCs artesãos (arcanista, ocultista, druida, alquimista),
  distribuídos pelo mesmo Lojista, sem página própria por NPC;
- pergaminhos do arcanista com a magia sorteada do JSON de magias;
- importação de `.xlsx` pelo painel, peso por raridade e vários lojistas, se
  fizerem falta.

### 7.1.2 Seleção manual do estoque do Lojista — concluído

Além do sorteio, o mestre escolhe o estoque item a item no painel, a partir do
catálogo, do estoque atual ou de uma prévia sorteada. O envio usa o mesmo
comando do sorteio e troca só os itens que o portal colocou no Lojista.
Especificação em `docs/product/specs/lojista-sorteio-de-estoque.md`.

### 7.2 Criador de criaturas para mestres — concluído

Antecipado para antes da área do jogador. Especificação em
`docs/product/specs/criador-de-criaturas.md`.

Decisões:

- **ponto de partida:** uma criatura do bestiário ou uma ficha em branco, com
  Defesa e Vida sugeridas pela mediana do bestiário na mesma dificuldade;
- **conteúdo do livro:** o bestiário e o grimório entram só por importação no
  painel (JSON exportados do Foundry, pasta `compendium/` na raiz FMS). Nada
  disso vai para os repositórios, e o conteúdo fica restrito a
  `creature:manage`;
- **resultado:** biblioteca de criaturas no portal e o comando tipado
  `creature.upsert`. O módulo (0.10.0) cria o ator na pasta "Ordem — Criaturas"
  e, no reenvio, atualiza o mesmo ator.

Regras de segurança:

- nenhuma macro ou código arbitrário vindo do usuário é executado;
- arquivos importados são dados não confiáveis: são validados e convertidos
  para texto simples;
- imagem e token aceitam só caminhos do Foundry ou HTTPS;
- criação e envio exigem `creature:manage` (mestre, gerente, administrador,
  dono);
- envio idempotente por criatura, versão e mundo; resultados de envios antigos
  são ignorados.

Fora deste corte: comando equivalente no Discord, importação de texto livre e
efeitos ativos do Foundry.

### 7.3 Área do jogador e ficha — concluído

- aba autenticada de personagem para jogadores;
- associação explícita entre usuário, campanha e ator do Foundry;
- projeção sanitizada da ficha no portal;
- exibição somente dos campos autorizados;
- edição apenas quando o contrato e o sistema Foundry suportarem a operação;
- comando Discord que encaminha para o portal;
- estado claro para ator não vinculado, mundo offline e dados desatualizados;
- auditoria de toda alteração.

Primeiro corte implementado junto ao vínculo de identidade:

- rota autenticada **Meu personagem**;
- projeção sanitizada de identidade, nível, ancestralidade, caminhos e condição;
- estados sem vínculo, sincronizado e temporariamente indisponível;
- comando Discord `/personagem` com resposta privada e acesso direto ao portal;
- nenhum campo editável e nenhum dado de outros jogadores exposto.
- retrato e token do personagem (módulo 0.9.0), com a opção de alternar entre
  os dois e ampliar, na área do jogador e no cartão de Personagens do painel.

Segundo corte, concluído com o módulo 0.11.0 (especificação em
`docs/product/specs/ficha-do-jogador.md`):

- ficha completa com atributos, características, aparência, inventário,
  magias, talentos e raízes, enviada pelo módulo 0.11.0;
- anotações do personagem editáveis pelo portal e gravadas no Foundry pelo
  módulo, com proteção contra sobrescrever edições feitas no Foundry.

O comando `/personagem` do Discord já encaminha para esta área.

O portal não substitui a ficha mecânica do Foundry. Em caso de divergência, o
Foundry vence e a projeção é atualizada.

### 7.4 Vida na Sede — em implementação

Entre missões, cada Corvo escolhe no portal as atividades que faz na Sede, de
acordo com o nível da Sede; o Guardião resolve e registra o resultado.
Especificação em `docs/product/specs/vida-na-sede.md`.

Entregas:

1. portal: nível da Sede, catálogo de atividades (com as seis do nível 1),
   escolha pelo jogador, rolagem automática e resolução pelo Guardião;
2. Registro do Corvo no Discord: link do tópico de cada Corvo e publicação da
   escolha e do resultado;
3. Lojista: escolha de itens Comuns até 1 xelim no catálogo, entregues no
   Foundry pelo módulo depois da aprovação do Guardião.

## 8. Front-end e design system

A refatoração do front foi concluída em três fases (ADR 0005). Não há mais CSS
fora de `apps/portal/app/globals.css`: telas novas usam os tokens do tema e as
primitivas de `apps/portal/components/ui/`, conforme
`docs/design/padrao-de-ui-ux.md`.

Toda alteração de interface deve seguir:

1. especificação de UI/UX;
2. contrato e implementação Front-end;
3. validação renderizada em 375, 768 e 1440 px;
4. revisão final de UI/UX;
5. correção de achados críticos e altos.

Requisitos permanentes:

- WCAG 2.2 AA;
- texto funcional mínimo de 12 px;
- alvo de interação mínimo de 44 px;
- foco visível e navegação por teclado;
- diálogos centralizados, responsivos e com retorno de foco;
- estados de loading, vazio, erro, sucesso e permissão insuficiente;
- nenhuma decisão de autorização baseada somente no frontend;
- sem overflow horizontal em larguras estreitas;
- tokens semânticos em vez de novas cores literais;
- conteúdo longo sem truncar ações essenciais.

## 9. Segurança e autorização

Toda operação segue:

```text
autenticar -> resolver principal -> resolver campanha -> aplicar policy
           -> executar caso de uso -> auditar
```

Regras adicionais:

- secrets nunca entram no Git, no browser ou em mensagens de log;
- tokens de Portal, Integration, Foundry e Automation são distintos;
- credenciais operacionais são armazenadas somente como hash quando possível;
- endpoints internos exigem service token e contratos validados;
- `Idempotency-Key` é obrigatório em mutações externas;
- falhas externas têm retry limitado e DLQ;
- exclusões permanentes exigem confirmação e auditoria;
- fontes enviadas à IA são temporárias e têm retenção limitada.

## 10. Deploy e operação

Fluxo obrigatório:

```text
branch de trabalho -> Pull Request -> CI -> merge em main
               -> workflow manual de produção -> migrations -> deploy -> smoke
```

O workflow de produção:

1. repete o quality gate;
2. aplica migrations do Portal, Integration e Automation;
3. publica Portal, Discord Integration, Foundry Bridge e Automation;
4. consulta os quatro endpoints `/health`;
5. falha se qualquer serviço não responder com `status: ok`.

Após cada deploy:

- validar o portal público e o painel autenticado;
- testar uma operação representativa do marco alterado;
- confirmar logs e ausência de erros novos;
- registrar o commit implantado;
- não iniciar a próxima PR enquanto houver falha crítica de produção.

Rollback:

- identificar a versão anterior do Worker;
- executar rollback do Worker correspondente;
- preservar migrations e dados;
- executar smoke tests novamente;
- registrar causa, versão e correlation ID.

## 11. Critérios para criar um novo microserviço

Não criar um Worker ou repositório separado apenas porque uma tela ou CRUD é
novo. A separação é justificada quando houver pelo menos um destes fatores:

- limite de segurança próprio;
- escala independente;
- isolamento de falhas;
- ciclo de release diferente;
- segredo ou integração externa com perfil de risco distinto.

O monorepo continua adequado para compartilhar contratos, testes e padrões sem
acoplar os bancos ou o ciclo de execução.

## 12. Definition of Done de cada entrega

- escopo e decisões registrados em documentação ou ADR;
- contrato versionado e validado com Zod;
- RBAC aplicado no backend;
- migrations retrocompatíveis e testadas;
- idempotência em integrações e filas;
- auditoria para ações administrativas;
- testes unitários, de contrato e de integração pertinentes;
- lint, typecheck, build e bundles aprovados;
- validação visual quando houver interface;
- deploy realizado a partir da `main`;
- smoke tests de produção aprovados;
- PR mergeada e branch removida local/remotamente.

## 13. Sequência resumida

```text
Estado atual
  -> Fundação visual, Diário de Sessões e Discord (concluídos)
  -> Lojista: vitrine, pedido assistido, moedas e detalhes do item (concluídos)
  -> Refatoração completa do front em três fases (concluída)
  -> Sorteador de estoque do Lojista (concluído)
  -> Criador de criaturas para mestres (concluído)
  -> Seleção manual do estoque do Lojista (concluída)
  -> Área do jogador e ficha completa, com anotações (concluída)
  -> Vida na Sede: atividades entre missões (em implementação)
  -> Compra automática no Lojista (adiada)
  -> Otimizações de polling, eventos/deltas e escala
```

Cada item deve ser entregue por PR independente, validado em produção e
documentado antes de iniciar o seguinte.
