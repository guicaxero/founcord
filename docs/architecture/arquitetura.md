# Arquitetura

## Objetivo

Manter o portal operável no nível gratuito sem transformar o projeto em um
monólito inseparável ou em uma coleção difícil de operar de microsserviços
ociosos.

## Contexto

```text
Navegador -> Portal Worker (Next.js/BFF) -> Identity
                                        -> Campaign -> D1
Discord -> Discord Integration Worker -> Integration D1
                                      -> Portal por Service Binding
                                      -> Queue -> fórum Discord
Foundry -> Foundry Bridge Worker -> Integration D1 -> Portal por Service Binding
Portal -> Automation Worker -> Automation D1 -> Queue -> Workers AI
                                              -> Portal -> rascunhos editoriais
```

Identity e Campaign são **módulos do Portal Worker** (`apps/portal/server/identity`
e `apps/portal/server/campaign`), não Workers separados: compartilham o mesmo
D1 e o mesmo ciclo de release, e a separação física só acontecerá quando houver
ganho real de segurança, escala ou isolamento (ver ADR 0001 e ADR 0004). O Next
é responsável pela experiência web, composição de respostas e sessão; as regras
de autorização e de domínio ficam nos módulos de `server/`.

Em produção, o Next.js é compilado pelo OpenNext e executado em Cloudflare
Workers. A navegação interna usa o App Router oficial; o adaptador não substitui
`next/link` nem mantém um roteador paralelo no navegador.

## Unidades de domínio

### Identity (`apps/portal/server/identity`)

É dono de usuários, identidades Discord, sessões, papéis e concessões de
permissão. Produz um `Principal` para os demais serviços e nunca confia em
permissões enviadas pelo navegador.

### Campaign (`apps/portal/server/campaign`)

É dono de campanhas, membros, missões, inscrições, posts e fluxo editorial.
Uma atualização de missão e seu evento de outbox devem ser gravados na mesma
transação.

### Integration (`workers/discord` e `workers/foundry-bridge`)

É dono das conexões Discord/Foundry, jobs, tentativas, idempotência e IDs
externos. Não é dono da ficha nem da missão.

### Automation (`workers/automation`)

É dono de fontes temporárias, jobs, leases, tentativas, cota e resultado bruto
das gerações. Não recebe sessão, papéis ou acesso ao banco do portal. Todo
resultado volta por callback idempotente e nasce como `pending_review`.

No Marco 2, Discord recebeu uma unidade de implantação independente porque tem
superfície pública assinada, segredos, limites e perfil de falha diferentes do
portal. No Marco 2.5, essa fronteira passou a possuir também um D1 independente.
A comunicação síncrona usa Service Binding e a publicação externa usa Queue.
No Marco 3, o Foundry recebeu um Bridge Worker próprio: sua autenticação,
presença, polling e perfil de falha são diferentes do Discord. No Marco 4,
automações receberam Worker, Queue e D1 próprios para isolar conteúdo enviado à
IA, cota e falhas de inferência.

## Fontes de verdade

| Dado | Fonte de verdade |
| --- | --- |
| Ficha mecânica do personagem | Foundry VTT |
| Missões, inscrições, sessões e posts | Campaign Service |
| Usuários, sessões e permissões | Identity Service |
| Mensagens e tópicos publicados | Discord, referenciados pelo Integration Service |
| Jobs e fontes temporárias de automação | Automation Service |
| Eventos públicos temporários de sessão Foundry | Foundry Bridge / Integration D1 |
| Catálogo sanitizado do Lojista | Foundry VTT, projetado no Integration D1 |
| Rascunho editorial gerado | Campaign Service, após callback interno |

O portal guarda apenas uma projeção sanitizada da ficha necessária para a
campanha. Assim, comandos editoriais continuam funcionando quando o Foundry
está offline.

## Contratos

- OpenAPI 3.1 para APIs HTTP.
- Zod como validação em runtime e origem dos tipos TypeScript.
- Eventos JSON versionados por envelope.
- `Idempotency-Key` obrigatório em mutações para sistemas externos.
- Datas em UTC e formato ISO 8601.
- Nenhum `any` nos contratos públicos.

## Persistência

Produção utiliza três D1 físicos. O portal mantém Identity e Campaign juntos;
integrações externas e automações possuem bancos próprios e não acessam o
binding do portal:

```text
ordem-da-ultima-luz <- Identity, Campaign, auditoria e outbox
ordem-integration-db <- inbox, deliveries, Discord e Foundry
ordem-automation-db <- jobs, leases, fontes temporárias e cota
```

Uma separação futura de `identity-db` e `campaign-db` só acontecerá quando esses
domínios tiverem limite de segurança, escala ou release realmente diferente.
Clientes não mudam porque dependem de contratos, não do banco.

## Autorização

Toda mutação segue:

```text
autenticar -> resolver principal -> resolver campanha -> aplicar policy
            -> executar caso de uso -> auditar
```

O frontend pode ocultar controles a partir de `/me/capabilities`, mas isso é
apenas UX. O serviço repete a autorização antes de acessar dados.

## Estado no frontend

Server Components produzem a primeira renderização e metadados. TanStack Query
é a camada de estado remoto no navegador: mantém query keys por agregado,
coordena mutations, invalida quadro/painel após gravações e compartilha o estado
de sessão entre componentes. O cache do cliente nunca participa de decisões de
autorização; toda policy é repetida no servidor.

## Marco 1

O portal publica APIs BFF finas que chamam casos de uso separados por domínio:

- `apps/portal/server/identity`: Discord OAuth com PKCE, estado assinado e sessões opacas;
- `apps/portal/server/campaign/campaigns`: campanhas, membros e papéis;
- `apps/portal/server/campaign/missions`: fluxo editorial, inscrições e lista de espera;
- `apps/portal/server/campaign/posts`: rascunho, revisão e publicação no portal;
- `apps/portal/server/shared/audit`: auditoria e outbox gravadas junto das mutações.

O primeiro usuário Discord recebe o papel global `owner`. Usuários seguintes
entram como `player` na campanha padrão e só ganham privilégios por atribuição
explícita.

## Integrações

- Discord entrega slash commands por HTTP, sem Gateway na primeira fase.
- O módulo Foundry inicia apenas conexões HTTPS de saída.
- O token de bootstrap do Foundry é aceito uma única vez; o token operacional é
  aleatório, armazenado apenas como hash no servidor e pode ser revogado.
- Estado online é derivado do último heartbeat, nunca controlado diretamente
  pelo cliente.
- Comandos Foundry usam tipos permitidos, idempotência e lease; macros e código
  arbitrário não fazem parte do contrato.
- Integration Workers não recebem binding para o banco do portal.
- O Lojista é um read model no Integration D1: Foundry publica snapshots
  completos e idempotentes; Portal e Discord consomem a mesma projeção.
- Filas usam entrega pelo menos uma vez; consumidores devem ser idempotentes.
- Automações e IA produzem rascunhos, nunca conteúdo publicado diretamente.
- Fontes concluídas são descartadas após 30 dias e jobs cancelados apagam o
  texto imediatamente.

Um novo Worker é criado quando o domínio exige ao menos um destes limites:
segurança própria, escala independente, isolamento de falhas ou ciclo de release
diferente. Telas e CRUDs não justificam microsserviços por si só.

O repositório compartilhado não define a fronteira de runtime. Portal, Discord,
Foundry e Automation são unidades implantáveis independentes e permanecem no
mesmo workspace para compartilhar contratos e testes. A política de entrega e
os critérios para uma futura extração estão registrados no
[ADR 0003](./adr/0003-monorepo-e-entrega-protegida.md).

## Entrega

Pull Requests executam um quality gate reproduzível. Produção aceita somente o
conteúdo de `main`, aplica migrações aditivas, implanta primeiro os provedores de
contrato e encerra com smoke tests. O procedimento, rollback e orçamento do
nível gratuito estão em [Entrega, operação e orçamento](./DELIVERY.md).

## Observabilidade

Cada requisição recebe um correlation ID. Logs são estruturados em JSON e ações
administrativas geram auditoria. Falhas externas são persistidas com número de
tentativas e seguem para uma dead-letter queue quando filas forem ativadas.
