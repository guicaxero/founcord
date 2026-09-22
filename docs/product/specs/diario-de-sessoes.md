# Diário de Sessões — especificação funcional e de UI/UX

## Objetivo

Separar os registros factuais de sessões das publicações editoriais. Posts
continuam representando crônicas, lore e textos narrativos; o Diário de Sessões
representa o que aconteceu em uma sessão específica e pode ser revisado antes
de ficar visível para a comunidade.

## Usuários e permissões

### Leitura pública

Visitantes e jogadores podem consultar somente registros publicados de uma
campanha pública. Rascunhos, fontes brutas, notas do mestre e erros de geração
nunca aparecem nessa superfície.

### Gestão

Mestre, gestor, editor ou outro papel com a capacidade correspondente pode:

- criar e editar o registro associado a uma sessão;
- revisar fontes e solicitar uma geração;
- revisar, publicar, arquivar ou excluir o resumo conforme a policy do backend.

A interface apenas reflete capacidades; toda operação é autorizada novamente no
backend e auditada.

## Modelo de conteúdo

Cada registro pertence a uma campanha e, opcionalmente, a uma sessão e missão.
Campos mínimos:

- título;
- resumo em corpo rico apenas no formato textual já suportado pelo portal;
- campanha;
- sessão relacionada;
- missão relacionada, quando existir;
- autor e revisor;
- origem (`manual` ou `automation`);
- estado (`draft`, `pending_review`, `published`, `archived`);
- datas de criação, atualização e publicação;
- versão para controle de concorrência;
- referência idempotente ao job de automação, quando houver.

O resumo não compartilha a listagem ou a navegação de Posts. A relação com a
sessão é explícita e não pode ser inferida a partir do título ou de texto livre.

## Fluxos

### Fluxo público

1. Pessoa entra no portal.
2. Escolhe **Diário de Sessões** na navegação pública.
3. Consulta registros publicados, ordenados pelos mais recentes.
4. Abre um registro para ler o conteúdo completo e seus vínculos públicos.

Filtros futuros podem incluir missão e período, sem alterar a leitura padrão.

### Fluxo de gestão manual

1. Pessoa autorizada abre **Diário de Sessões** no painel.
2. Escolhe uma sessão encerrada ou cria um registro manual.
3. Preenche título e conteúdo.
4. Salva como rascunho ou envia para revisão.
5. Revisa o conteúdo e publica, arquiva ou exclui conforme sua capacidade.

### Fluxo de automação

```text
encerrar sessão
  -> revisar fontes
  -> solicitar geração
  -> job queued/processing
  -> resumo pending_review
  -> revisão humana
  -> publicar ou rejeitar
```

Encerrar a captura nunca chama a IA automaticamente. O solicitante precisa
confirmar as fontes antes de criar o job. O callback da automação deve apontar
para o registro de sessão por um identificador explícito e idempotente; não usar
o título da sessão como chave.

## Hierarquia da interface

### Superfície pública

1. Título: “Diário de Sessões”.
2. Descrição curta: “Registros do que a Ordem viveu em cada expedição.”
3. Filtros, quando disponíveis.
4. Lista de registros publicados.
5. Metadados secundários: data, missão e mestre, somente se públicos.
6. Conteúdo completo sob demanda ou em página própria.

### Painel de gestão

1. Campanha ativa e localização no painel.
2. Título e descrição da área.
3. Resumo de registros por estado.
4. Ação primária contextual: “Novo registro” ou “Revisar resumo”.
5. Lista filtrável por estado, sessão e missão.
6. Editor com título, conteúdo e vínculos.
7. Ações secundárias: salvar rascunho, enviar para revisão, arquivar.
8. Exclusão permanente somente em progressive disclosure, com confirmação
   explícita do objeto e da consequência.

## Estados obrigatórios

- **Carregando:** preserve a estrutura e informe “Carregando registros de
  sessão”.
- **Vazio inicial:** explique que registros publicados aparecerão ali e, para
  quem tiver permissão, ofereça “Criar primeiro registro”.
- **Sem resultado:** diferencie filtros sem resultado de ausência de registros.
- **Dados parciais:** mostre claramente sessão ou missão não vinculada.
- **Processando:** mostre que a geração está em andamento e permita continuar
  navegando.
- **Pendente de revisão:** destaque que o texto não está público.
- **Publicado:** confirme publicação e consequência de visibilidade.
- **Arquivado:** mantenha indicação de que não está público.
- **Erro recuperável:** explique a falha e ofereça tentar novamente sem perder
  os valores preenchidos.
- **Sem permissão:** não exponha ações de edição; explique a superfície adequada.
- **Sessão expirada:** preserve o contexto seguro e encaminhe para autenticação.
- **Conteúdo longo:** permita leitura e edição sem cortar texto ou ações.

## Conteúdo e UX writing

Usar linguagem concreta e orientada à ação:

- “Salvar rascunho”;
- “Enviar para revisão”;
- “Publicar resumo”;
- “Arquivar registro”;
- “Excluir registro permanentemente”;
- “Gerar rascunho para revisão”.

Mensagem de geração:

> O rascunho será criado a partir das fontes revisadas e ficará privado até
> alguém com permissão publicá-lo.

Erro de geração:

> Não foi possível criar o rascunho. As fontes foram preservadas; revise-as ou
> tente novamente quando o serviço estiver disponível.

## Responsividade e acessibilidade

- Em 375 px, a navegação pública continua acessível pelo menu compacto.
- A ação primária aparece no primeiro viewport da área de gestão.
- Lista e editor ficam empilhados em uma coluna quando não houver largura útil.
- Metadados passam para linhas empilhadas; nenhuma informação essencial depende
  de tabela ou rolagem horizontal.
- Campos usam labels persistentes, ajuda associada e erro com
  `aria-describedby`/`aria-invalid` quando aplicável.
- Foco retorna ao acionador após diálogos de confirmação.
- Estados de processamento e sucesso usam regiões vivas sem anunciar listas
  inteiras repetidamente.
- Contraste, foco visível, alvos de no mínimo 44 px e zoom a 200% seguem o
  padrão do produto.
- O conteúdo não depende apenas de cor para diferenciar estados.

## Contrato de implementação

### Persistência

Criar uma entidade própria de registros de sessão em migration aditiva. Ela não
deve reutilizar `posts` como armazenamento semântico. A tabela deve possuir
índices para campanha/estado, sessão e publicação.

### Automação

Adicionar ao job um contexto explícito de destino, por exemplo
`{ type: "session_summary", sessionId }`. O callback deve ser idempotente por
`jobId`, validar campanha e sessão e criar o registro em `pending_review`.

O callback não pode aprovar, publicar ou editar Posts. Crônicas e extrações que
forem materializadas como Posts permanecem no fluxo editorial existente.

### API

Rotas previstas:

- `GET /api/campaigns/:campaignId/session-summaries`;
- `POST /api/campaigns/:campaignId/session-summaries`;
- `GET /api/campaigns/:campaignId/session-summaries/:summaryId`;
- `PATCH /api/campaigns/:campaignId/session-summaries/:summaryId`;
- `POST /api/campaigns/:campaignId/session-summaries/:summaryId/publish`;
- `POST /api/campaigns/:campaignId/session-summaries/:summaryId/archive`;
- `DELETE /api/campaigns/:campaignId/session-summaries/:summaryId`.

O endpoint público retorna somente `published`. O painel aplica filtros de
estado e a policy correspondente.

### Compatibilidade e migração

- Nenhum post existente deve desaparecer ou mudar de estado automaticamente.
- Jobs antigos continuam apontando para Posts.
- Jobs novos de `session_summary` usam o destino explícito de sessão.
- A remoção de campos ou tabelas antigas só pode ocorrer em uma PR posterior,
  após consumidores e dados serem verificados.

## Critérios de aceitação

1. Um resumo publicado não aparece na lista pública de Crônicas.
2. Uma crônica publicada não aparece no Diário de Sessões.
3. Um job `session_summary` cria exatamente um registro `pending_review` para a
   sessão informada, mesmo que o callback seja reentregue.
4. O encerramento de uma sessão não inicia geração sem confirmação humana.
5. Usuário sem capacidade de gestão não recebe controles de criação, edição ou
   publicação.
6. Um resumo arquivado deixa de ser público sem ser confundido com exclusão.
7. Exclusão permanente exige confirmação explícita, aplica RBAC e gera auditoria.
8. Falha de geração preserva fontes e permite nova tentativa segura.
9. A interface funciona em 375, 768 e 1440 px sem overflow ou corte de ações.
10. Lint, typecheck, migrations, testes de contrato, testes de integração e
    smoke de produção passam antes do merge.

## Fora deste corte

- importação de mensagens do Discord para a fonte da IA;
- edição mecânica de fichas Foundry;
- Mercador;
- criador de criaturas;
- redesign fora das superfícies tocadas;
- publicação automática sem revisão humana.
