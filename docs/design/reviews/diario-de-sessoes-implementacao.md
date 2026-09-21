# Diário de Sessões — implementação do painel editorial

## Escopo entregue

Este corte implementa a superfície de gestão prevista em
`docs/product/specs/diario-de-sessoes.md`, preservando a separação semântica entre resumos
factuais e Posts narrativos.

## Contrato de interface

- A navegação apresenta **Diário de Sessões** como área própria, condicionada às
  capacidades efetivas da campanha.
- A listagem editorial consulta uma chave TanStack Query distinta da listagem
  pública e pode ser filtrada por estado.
- Pessoas com `session:manage` podem criar registros e vinculá-los opcionalmente
  a uma sessão existente.
- Pessoas com `session:manage` ou `post:review` podem editar rascunhos e registros
  em revisão, enviá-los para revisão ou devolvê-los ao rascunho.
- `post:publish` é obrigatório para publicar, arquivar e restaurar um registro
  arquivado.
- `post:delete` é obrigatório para excluir definitivamente um registro já
  arquivado; a confirmação exige a expressão `EXCLUIR`.
- Todas as mutações apresentam erro no contexto e as conclusões relevantes são
  anunciadas em uma região viva sem reler a lista completa.

## Regras protegidas no backend

O frontend apenas apresenta as capacidades. A API valida novamente o escopo e
aceita somente estas transições:

```text
draft -> pending_review | archived
pending_review -> draft | published | archived
published -> archived
archived -> draft
```

Conteúdo publicado ou arquivado não pode ser editado antes de voltar a
`draft`. Publicação direta de um rascunho é rejeitada. Exclusão definitiva usa
versão otimista, remove referências técnicas órfãs e preserva uma entrada de
auditoria da exclusão.

## Integrações preservadas

- Jobs `session_summary` continuam exigindo destino explícito de sessão.
- Ao abrir a revisão a partir de Sessões ou Automações, o painel navega para o
  Diário, não para Posts.
- Invalidações atualizam as listas editorial e pública, além do vínculo exibido
  no histórico de sessões.

## Validação automatizada

- TypeScript sem emissão;
- ESLint;
- 44 testes unitários;
- build OpenNext/Cloudflare;
- bundles do portal, integração Discord, ponte Foundry e automações;
- integração de API cobrindo visibilidade pública, RBAC, transições, separação
  de Posts, edição de publicado, arquivo e exclusão permanente;
- smoke HTML da navegação pública e do shell administrativo.
