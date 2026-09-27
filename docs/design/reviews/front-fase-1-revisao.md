# Revisão de UI/UX — fase 1 do front (fundação, navegação e termos)

Revisão da implementação contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e o
[ADR 0005](../../architecture/adr/0005-front-end-escuro-e-navegacao-completa.md).

## Execução

- `bun run dev` com o D1 local migrado (16 migrations) e uma sessão de
  desenvolvimento semeada, para ver as superfícies autenticadas.
- Larguras 1440, 768 e 375 px, em `/`, `/missoes`, `/lojista`, `/ordem` e `/eu`.

## Resultados

| Item verificado | Resultado |
| --- | --- |
| Tema escuro em todas as superfícies, inclusive nas telas ainda em CSS legado | Atendido pela ponte de tokens em `globals.css`. |
| Navegação cobre as áreas do produto | Missões, Crônicas, Diário, Lojista e A Ordem aparecem em toda superfície pública. |
| Navegação consciente de papel | Autenticado mostra "Minha área"; com permissão de gestão aparece "Gestão". Verificado com sessão de `owner`. |
| Rota atual marcada | `aria-current="page"` e sublinhado de acento na rota ativa, inclusive em rotas filhas. |
| Menu compacto | Abaixo de 1024 px a navegação vira menu; o botão tem nome acessível. |
| Abas da área do jogador | Trocam por clique, reagem ao teclado e refletem o estado na URL (`/eu?aba=pedidos`), que é restaurado ao recarregar. |
| Endereço antigo `/personagem` | Redireciona para `/eu?aba=personagem`, preservando o link do comando do Discord. |
| Cookie renomeado | Sessão criada com `ordem_session` funciona; o nome antigo continua sendo lido. |
| Foco por teclado | Primeiro tab é "Pular para o conteúdo", com contorno visível de 2 px. |
| Rolagem horizontal | `scrollWidth === clientWidth` em 375, 768 e 1440 px nas rotas revisadas. |
| Termos inventados | Ausentes do HTML servido; teste automatizado cobre a regressão. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Baixo | Em 768 px, a quebra manual do título do herói produzia três linhas desequilibradas. | A quebra passou a valer só a partir de 1024 px. |

## Pendências aceitas

- **Telas ainda em CSS legado.** Lojista, Código, personagem e painel herdaram o
  tema pela ponte de tokens, mas mantêm a composição antiga: tipografia grande
  demais no herói do Lojista e densidade irregular. É exatamente o escopo das
  fases 2 e 3.
- **`prefers-reduced-motion`** está implementado no `MotionProvider` e no reset
  global, mas não foi possível emular a preferência pelo navegador embutido; a
  verificação foi por inspeção de código.
- **Inscrições do jogador** ainda não têm aba: falta um endpoint que liste as
  inscrições da pessoa. Entra na fase 2, junto das páginas de detalhe.
- **Bundle** do portal foi de 1,32 MB para 1,66 MB comprimido, por causa de Radix
  e Motion. O limite do plano gratuito é 3 MB.
