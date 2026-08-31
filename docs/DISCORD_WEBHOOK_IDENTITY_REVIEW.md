# Revisão de experiência — identidade narrativa no Discord

## Escopo

Esta entrega altera somente o modal nativo do Discord e o cabeçalho da
publicação no fórum. Não cria nem modifica telas do portal. A validação foi
executada pelo agente principal porque o especialista de UI/UX não estava
disponível durante o corte.

## 1. Especificação de UI/UX

- **Usuário:** jogador, mestre ou gerente autorizado a usar `/post`.
- **Objetivo:** publicar uma crônica ou registro com identidade narrativa sem
  confundir essa identidade com a conta real que enviou o comando.
- **Hierarquia do modal:** nome narrativo opcional, avatar opcional, título e
  conteúdo.
- **Conteúdo:** linguagem direta em português; a URL informa explicitamente que
  deve usar HTTPS.
- **Estados:** identidade completa, somente nome, somente avatar, sem identidade,
  campo inválido, webhook indisponível e falha de entrega.
- **Feedback:** campo inválido recebe orientação acionável; rascunho aceito
  confirma que aguarda revisão humana.
- **Acessibilidade:** labels descrevem finalidade sem depender do placeholder;
  nenhum dado é indicado somente por cor; conteúdo não expande menções.

## 2. Contrato e implementação

- Nome limitado a 80 caracteres e uma linha.
- Avatar limitado a 2.048 caracteres e URL HTTPS válida.
- Modais `v1` e `v2` continuam aceitos; novas aberturas usam `v3`.
- A identidade é persistida apenas como metadado da publicação no Integration
  D1.
- O token do webhook não cruza o contrato interno nem é persistido.
- Sem `MANAGE_WEBHOOKS`, a entrega preserva o conteúdo e usa o bot.

## 3. Validação do comportamento

O modal do Discord não é renderizado pelo Next.js e, portanto, não se aplica a
validação de viewport do portal. Sua árvore de componentes e seus estados foram
validados por testes automatizados do payload nativo do Discord, incluindo:

- abertura do modal `v3` com campo de avatar;
- submissão e persistência de nome/avatar;
- compatibilidade com identificadores antigos;
- criação e reutilização do webhook gerenciado;
- publicação com `username`, `avatar_url`, título, tag, conteúdo e CTA;
- fallback único para o bot quando a permissão estiver ausente;
- bloqueio de URL HTTP e de nome em múltiplas linhas.

## 4. Revisão final de UI/UX

- **Crítico:** nenhum achado.
- **Alto:** nenhum achado.
- **Médio:** a URL do avatar exige que a pessoa já possua uma imagem hospedada;
  limitação aceita neste corte e documentada.
- **Baixo:** o Discord controla a apresentação final do modal e do cabeçalho;
  não há personalização visual adicional disponível pela API.

## 5. Critérios de conclusão

A entrega é considerada concluída quando typecheck, lint, testes unitários,
builds e bundles passarem no gate local e no Quality Gate da Pull Request.
