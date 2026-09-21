# Fundação visual — revisão final de UI/UX

## Escopo revisado

A revisão compara a implementação com `docs/design/fundacao-ui.md` e cobre o shell
público, o Código da Ordem, o shell autenticado de gestão, a navegação de áreas,
o primeiro fluxo editorial de missões, feedback assíncrono e diálogo destrutivo.

## Evidência renderizada

| Superfície | Viewport | Resultado |
| --- | ---: | --- |
| Portal público | 375 × 812 | Sem overflow; marca, sessão e menu completo em duas linhas |
| Código da Ordem | 375 × 812 | Sem overflow; navegação do documento e retorno ao portal visíveis |
| Entrada protegida | 375 × 812 | Estado sem sessão legível, centralizado e com ações completas |
| Painel autenticado | 375 × 812 | Seletores de campanha e área completos; proprietário global separado e protegido |
| Diálogo destrutivo | 375 × 812 | Centralizado entre 19 e 341 px, inteiramente visível e com rolagem segura |
| Portal público | 768 × 900 | Sem overflow; menu compacto, loading contextual e conteúdo em uma coluna |
| Painel autenticado | 768 × 900 | Sem faixa horizontal; seletor de área e ação “Nova missão” visíveis |
| Portal público | 1440 × 1000 | Navegação ampla, hierarquia editorial e grade sem overflow |
| Painel autenticado | 1440 × 1000 | Sidebar ampla, lista/editor simultâneos e campos sem truncamento |

Também foram verificados:

- foco inicial no campo de confirmação ao abrir o diálogo;
- retorno de foco ao botão “Excluir permanentemente” após cancelar;
- foco visível no `summary` do menu público;
- alteração de “Missões” para “Publicações” pelo seletor de área em 375 px;
- estados público de carregamento e vazio, além de erro recuperável definido;
- contraste dos pares funcionais principais: 16,35:1, 9,21:1, 6,04:1,
  7,83:1, 5,97:1, 6,39:1 e 5,68:1 — todos acima de 4,5:1.

## Achados e resolução

### Altos — resolvidos

1. **Links amplos sobrepunham o cabeçalho em 375 px.** A regra responsiva passou
   a ocultar especificamente a navegação ampla; o cabeçalho estreito usa duas
   linhas e mantém a sessão separada do menu.
2. **Navegação administrativa era uma faixa truncada.** Foi substituída por um
   `select` rotulado que preserva todas as áreas permitidas pelo RBAC.
3. **Diálogo podia depender do posicionamento padrão.** Agora usa `inset: 0`,
   `margin: auto`, altura máxima e rolagem interna; o fluxo devolve foco.
4. **Campos do editor lateral truncavam conteúdo em largura ampla.** Editores
   laterais usam uma coluna, mantendo rótulos e valores completos.

### Médios — resolvidos

1. **A ação de início da tarefa aparecia tarde no mobile.** “Nova missão” agora
   fica junto ao resumo da lista e leva ao editor autorizado.
2. **Lista inteira era anunciada após atualizações.** Missões e crônicas usam
   feedback localizado para loading, erro, vazio e sucesso.
3. **Texto e alvos funcionais eram pequenos.** A fundação centraliza 12 px como
   mínimo funcional e 44 px como alvo de controles; os painéis existentes
   recebem a correção de compatibilidade.
4. **Semântica de tabs estava incompleta.** A área de gestão agora é `nav` com
   `aria-current`; em espaço menor, usa combobox nativo.

## Pendências aceitas neste corte

- Mercador, ficha de jogador, criador de criaturas e separação de resumos não
  pertencem à fundação visual e continuam nas fases funcionais do roadmap.
- Os painéis extensos ainda conservam seletores CSS legados. O corte adiciona
  tokens e primitivas para migração gradual sem reescrever regras de negócio.
- Não houve alteração da autorização: a prévia autenticada existe apenas em
  desenvolvimento, usa contratos tipados e retorna 404 na build de produção.

Não restaram achados críticos ou altos no escopo definido.
