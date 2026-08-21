# PADRÃO DE UI/UX

Este documento é a fonte de verdade para todo trabalho de frontend da Ordem da Última Luz. Deve ser lido integralmente antes de criar, alterar ou revisar telas, componentes, navegação, formulários e textos de interface.

## Objetivo

Construir interfaces com qualidade comparável a produtos digitais profissionais, priorizando clareza, usabilidade, consistência, acessibilidade, hierarquia visual e percepção de qualidade. Cada decisão deve possuir uma justificativa de experiência do usuário, hierarquia de informação ou comportamento esperado.

## 1. Prioridades fundamentais

Priorize, nesta ordem:

1. Clareza.
2. Usabilidade.
3. Hierarquia visual.
4. Consistência.
5. Feedback ao usuário.
6. Acessibilidade.
7. Eficiência.
8. Estética.

A interface deve ser compreensível sem exigir descoberta por tentativa e erro. Remova complexidade visual ou funcional que não agregue valor.

## 2. Hierarquia visual

Use escala e peso tipográfico, espaçamento, contraste, agrupamento, posicionamento, proximidade, repetição e alinhamento para deixar evidente:

- O que é mais importante.
- O que pode ser acionado.
- Qual é a ação principal.
- Qual informação é secundária.
- Em que seção o usuário está.
- O que aconteceu depois de uma interação.

Não dê a todos os elementos a mesma importância visual.

## 3. Layout e composição

- Use grid consistente, alinhamentos precisos, espaçamento sistemático, ritmo visual e margens equilibradas.
- Mantenha largura de leitura e densidade apropriadas.
- Use espaço negativo deliberadamente para criar respiração, agrupamento e hierarquia.
- Evite desalinhamento, espaçamento arbitrário, containers excessivamente largos, congestionamento e decoração sem propósito.

## 4. Sistema visual

Mantenha uma linguagem coerente em tipografia, escalas, bordas, raios, sombras, ícones, botões, campos, cartões, estados, espaçamentos e cores. Elementos com a mesma função devem compartilhar aparência e comportamento. Não crie variantes visuais sem necessidade funcional.

## 5. Tipografia

- Estabeleça hierarquia clara entre títulos, subtítulos, rótulos e corpo.
- Preserve comprimento de linha confortável e altura de linha adequada.
- Use peso, tamanho e estilo com propósito semântico, não apenas para criar variedade.
- Prefira legibilidade a efeitos decorativos.

## 6. Cores

As cores devem distinguir fundo, superfícies, texto primário e secundário, elementos interativos, ações, sucesso, erro, alerta, informação e estados desabilitados. Não dependa exclusivamente da cor para comunicar significado.

## 7. Contraste e acessibilidade

- Garanta contraste adequado, legibilidade e áreas de interação confortáveis.
- Ofereça foco perceptível, navegação previsível e erros identificáveis.
- Use HTML semântico e rótulos acessíveis.
- Toda informação visual relevante deve possuir alternativa textual ou estrutural.
- Não sacrifique contraste em nome da estética.

## 8. Interações e feedback

Todo componente interativo deve considerar estados `default`, `hover`, `focus`, `active`, `disabled`, `loading`, `success`, `error`, `empty` e `selected` quando aplicáveis. O fluxo deve comunicar claramente: ação → processamento → resultado.

## 9. Microinterações

Animações devem reforçar causalidade, orientar atenção, mostrar mudança de estado, manter continuidade ou reduzir sensação de espera. Devem ser rápidas, discretas e respeitar `prefers-reduced-motion`. Evite animações lentas ou puramente decorativas.

## 10. Formulários

- Use labels claros e persistentes, agrupamento lógico e ordem natural.
- Indique obrigatoriedade, preserve valores preenchidos e forneça valores padrão quando úteis.
- Mostre processamento, sucesso e erro próximos do contexto da ação.
- Mensagens de erro devem explicar o que aconteceu, por que aconteceu e como corrigir.
- Botões devem descrever a ação concreta.

## 11. Estados da interface

Projete explicitamente estados de carregamento, vazio, erro, sucesso, dados parciais, sem resultados, indisponibilidade, desabilitado, primeiro uso, conteúdo longo e conteúdo curto. Nenhum desses estados deve parecer improvisado.

## 12. Comunicação

Use mensagens inline, indicadores de progresso, confirmações, toasts e feedback contextual de acordo com a importância e a duração da ação. Evite modais e confirmações desnecessárias.

## 13. Navegação

A navegação deve ser previsível, consistente, hierárquica e contextual. O usuário deve responder facilmente:

- Onde estou?
- De onde vim?
- Onde posso ir?
- Como volto?

Não esconda tarefas principais em padrões pouco intuitivos.

## 14. Responsividade e adaptação

A experiência móvel deve ser repensada, não apenas reduzida. Conforme o espaço muda, reavalie hierarquia, densidade, navegação, tamanho dos controles, agrupamento, ordem e prioridade das ações. Evite overflow, conteúdo cortado, sobreposição, controles pequenos, tabelas inutilizáveis e dimensões rígidas.

## 15. Componentes

Cada componente deve ter responsabilidade clara, comportamento previsível, estados definidos, consistência e reutilização coerente. Não crie componentes visualmente diferentes para resolver a mesma tarefa.

## 16. UX Writing

Textos devem ser claros, curtos, humanos, objetivos, contextuais e orientados à ação. Evite jargão técnico. Prefira “Publicar missão” a “OK” ou “Enviar”.

## 17. Prevenção e recuperação de erros

Antecipe erros com restrições, validação, feedback contextual e desabilitação de ações impossíveis. Confirme apenas ações destrutivas ou difíceis de reverter. Sempre ofereça um caminho claro de recuperação.

## 18. Performance percebida

Use feedback imediato, carregamento contextual, preservação de contexto e atualizações previsíveis. Nunca deixe o usuário esperando sem explicar o que está ocorrendo.

## 19. Design emocional

A interface deve transmitir confiança, refinamento, controle, clareza, modernidade e coerência. A identidade sombria e medieval da campanha pode aparecer em materiais, tipografia editorial e cores, mas nunca deve prejudicar leitura ou operação.

## 20. Princípios de Gestalt

Use conscientemente proximidade, similaridade, continuidade, fechamento, figura e fundo, região comum, conexão e hierarquia. Elementos relacionados devem parecer relacionados; elementos independentes precisam de separação suficiente.

## 21. Lei de Hick e progressive disclosure

Reduza decisões simultâneas. Quando houver muitas opções, agrupe, priorize, categorize e mostre primeiro o necessário para a tarefa atual. Revele controles secundários somente no contexto apropriado.

## 22. Lei de Fitts

Controles frequentes devem ter áreas clicáveis adequadas, distância segura entre ações e posicionamento previsível. A ação principal deve ser fácil de localizar e alcançar.

## 23. Reconhecimento em vez de lembrança

Use labels, indicadores, breadcrumbs, contexto, sugestões, histórico e padrões reconhecíveis. O usuário não deve memorizar códigos ou navegar entre telas para concluir uma tarefa simples.

## 24. Consistência e padrões conhecidos

Use padrões familiares quando resolvem o problema. A mesma ação deve ter a mesma aparência, posição relativa, terminologia e resultado em toda a experiência.

## 25. Estados vazios

Um estado vazio deve explicar:

- O que aparecerá ali.
- Por que ainda está vazio.
- O que o usuário pode fazer.
- Qual é a próxima ação recomendada.

## 26. Arquitetura da informação

Organize conteúdo segundo o modelo mental do usuário, não conforme tabelas, serviços ou estrutura interna. Priorize descoberta, escaneabilidade, agrupamento semântico, contexto e fluxos naturais.

## 27. Menor esforço

Sempre questione se o mesmo resultado pode ser alcançado com menos cliques, decisões, digitação, navegação e informação irrelevante.

## 28. Qualidade percebida

Antes de concluir uma interface, revise alinhamento, espaçamento, hierarquia, contraste, tipografia, consistência, responsividade, estados, feedback, acessibilidade, microinterações, erros, estados vazios e densidade visual. Corrija pequenas inconsistências.

## 29. Regras específicas da Ordem da Última Luz

### Separação de superfícies

- **Portal público:** ambientação, quadro de missões publicadas, crônicas e Código da Ordem.
- **Área do jogador:** inscrições, personagens e histórico pessoal quando essas funções existirem.
- **Painel de gestão:** criação, revisão, publicação, membros, auditoria e configuração.
- Visitantes e jogadores não devem ser direcionados para uma superfície chamada “administrativa”.
- A entrada do painel de gestão só aparece para quem possui ao menos uma permissão de gestão.

### Papéis e permissões

- Papéis globais e de campanha devem ser exibidos em grupos separados.
- `owner` deve aparecer como papel global protegido e nunca como chip removível.
- Papéis são cumulativos, não modos entre os quais o usuário alterna.
- Exiba nome humano, escopo e resumo da capacidade de cada papel.
- Ações de concessão e remoção devem usar progressive disclosure e feedback explícito.
- Não permita que a interface sugira que remover `player` remove `owner`.

### Identidade visual

- Preserve a atmosfera de pergaminho, fuligem, metal envelhecido e brasa.
- Use texturas por contraste, camadas e gradientes discretos; não comprometa a leitura.
- Tipografia editorial pode ser usada em títulos; texto funcional deve usar fonte de alta legibilidade.
- Vermelho-brasa é cor de ênfase, não cor universal de interação.

## 30. Checklist de conclusão

Antes de entregar qualquer alteração de frontend, confirme:

- [ ] A tarefa principal está evidente no primeiro viewport.
- [ ] A navegação informa localização e retorno.
- [ ] Ações administrativas estão ocultas para usuários sem permissão.
- [ ] Papéis globais e locais estão visualmente separados.
- [ ] Loading, vazio, erro, sucesso e desabilitado foram tratados.
- [ ] Foco por teclado está visível.
- [ ] Contraste e áreas clicáveis são adequados.
- [ ] A tela funciona em desktop, tablet e celular.
- [ ] Textos descrevem ações concretas.
- [ ] A interface não depende apenas de cor.
- [ ] A autorização continua protegida no backend.

## Regra final

Cada elemento deve resolver um problema, comunicar informação, facilitar uma ação, apoiar uma decisão ou fornecer feedback. Se não cumprir nenhuma dessas funções, considere removê-lo.

O resultado deve parecer maduro, profissional e cuidadosamente projetado por meio de hierarquia, consistência, clareza, precisão, acessibilidade e comportamento — nunca por excesso de decoração.
