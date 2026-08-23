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
Automação Python -> Automation Worker -> rascunhos editoriais
```

O Next é responsável pela experiência web, composição de respostas e sessão.
Regras de autorização, campanha ou integração pertencem aos respectivos
serviços.

Em produção, o Next.js é compilado pelo OpenNext e executado em Cloudflare
Workers. A navegação interna usa o App Router oficial; o adaptador não substitui
`next/link` nem mantém um roteador paralelo no navegador.

## Unidades de domínio

### Identity

É dono de usuários, identidades Discord, sessões, papéis e concessões de
permissão. Produz um `Principal` para os demais serviços e nunca confia em
permissões enviadas pelo navegador.

### Campaign

É dono de campanhas, membros, missões, inscrições, posts e fluxo editorial.
Uma atualização de missão e seu evento de outbox devem ser gravados na mesma
transação.

### Integration

É dono das conexões Discord/Foundry, jobs, tentativas, idempotência e IDs
externos. Não é dono da ficha nem da missão.

No Marco 2, Discord recebeu uma unidade de implantação independente porque tem
superfície pública assinada, segredos, limites e perfil de falha diferentes do
portal. No Marco 2.5, essa fronteira passou a possuir também um D1 independente.
A comunicação síncrona usa Service Binding e a publicação externa usa Queue.
No Marco 3, o Foundry recebeu um Bridge Worker próprio: sua autenticação,
presença, polling e perfil de falha são diferentes do Discord. Automações só
recebem Worker próprio quando forem implementadas.

## Fontes de verdade

| Dado | Fonte de verdade |
| --- | --- |
| Ficha mecânica do personagem | Foundry VTT |
| Missões, inscrições e posts | Campaign Service |
| Usuários, sessões e permissões | Identity Service |
| Mensagens e tópicos publicados | Discord, referenciados pelo Integration Service |

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

Produção utiliza dois D1 físicos. O portal mantém Identity e Campaign juntos;
integrações externas possuem banco próprio e não acessam o binding do portal:

```text
ordem-da-ultima-luz <- Identity, Campaign, auditoria e outbox
ordem-integration-db <- inbox, deliveries, Discord e Foundry
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

- `server/auth`: Discord OAuth com PKCE, estado assinado e sessões opacas;
- `server/domain/campaigns`: campanhas, membros e papéis;
- `server/domain/missions`: fluxo editorial, inscrições e lista de espera;
- `server/domain/posts`: rascunho, revisão e publicação no portal;
- `server/audit`: auditoria e outbox gravadas junto das mutações.

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
- Filas usam entrega pelo menos uma vez; consumidores devem ser idempotentes.
- Automações e IA produzem rascunhos, nunca conteúdo publicado diretamente.

Um novo Worker é criado quando o domínio exige ao menos um destes limites:
segurança própria, escala independente, isolamento de falhas ou ciclo de release
diferente. Telas e CRUDs não justificam microsserviços por si só.

## Observabilidade

Cada requisição recebe um correlation ID. Logs são estruturados em JSON e ações
administrativas geram auditoria. Falhas externas são persistidas com número de
tentativas e seguem para uma dead-letter queue quando filas forem ativadas.
