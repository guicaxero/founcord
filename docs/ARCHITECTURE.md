# Arquitetura

## Objetivo

Manter o portal operável no nível gratuito sem transformar o projeto em um
monólito inseparável ou em uma coleção difícil de operar de microsserviços
ociosos.

## Contexto

```text
Navegador -> Next.js/BFF -> Identity
                        -> Campaign -> D1
Discord ----------------> Integration -> Campaign
Foundry -----------------> Integration -> Campaign
Automação Python --------> Integration -> rascunhos editoriais
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

A primeira implantação utiliza um D1 físico, com tabelas agrupadas por domínio.
Isso reduz custo e operação enquanto o tráfego é pequeno. O código não faz joins
entre regras de serviços diferentes.

Quando houver necessidade operacional, cada serviço receberá seu próprio D1:

```text
iam-db          <- tabelas iam_*
campaign-db     <- campanhas, missões, inscrições e posts
integration-db  <- entregas, inbox, outbox e jobs
```

Clientes não mudam nessa separação porque dependem de contratos, não do banco.

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
- Filas usam entrega pelo menos uma vez; consumidores devem ser idempotentes.
- Automações e IA produzem rascunhos, nunca conteúdo publicado diretamente.

## Observabilidade

Cada requisição recebe um correlation ID. Logs são estruturados em JSON e ações
administrativas geram auditoria. Falhas externas são persistidas com número de
tentativas e seguem para uma dead-letter queue quando filas forem ativadas.
