# Revisão de UI/UX — Ficha do jogador

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e a
[especificação](../../product/specs/ficha-do-jogador.md).

## Especificação

- **Usuário:** jogador com personagem vinculado (`character:self:read`).
- **Objetivo:** consultar a ficha completa sem abrir o Foundry.
- **Área:** seção "Ficha completa" no cartão do personagem em
  `/eu?aba=personagem`.
  - Abas na URL (`?ficha=`): Atributos, Inventário, Magias, Talentos, Raízes e
    Anotações.
  - **Anotações:** campo de texto com o texto atual do Foundry, contagem de
    caracteres, "Descartar" e "Salvar no Foundry" (os dois só ficam ativos com
    alteração), estado do último envio e aviso ao sair com alterações não
    salvas.
  - Os rótulos seguem a ficha do sistema em pt-BR: Defesa, Velocidade, Poder,
    Tamanho e Fortuna.
  - Os itens são recolhíveis (`details`): o resumo fica na linha e a descrição
    aparece ao abrir.
- **Estados:**
  - carregando, com esqueleto e rótulo para leitores de tela;
  - erro, com "Tentar novamente";
  - ficha indisponível com módulo antigo;
  - listas vazias com mensagem;
  - anotações: aguardando o Foundry (campo travado, mostrando o texto
    enviado), gravadas, recusadas por conflito, falha no envio, e descrição
    alterada no Foundry durante a edição ("Carregar o texto atual").

## Validação renderizada

Ambiente local com D1 migrado, sessão `owner` vinculada a um personagem
sintético e uma ficha de teste gravada só no D1 local.

| Verificação | Resultado |
| --- | --- |
| Atributos | Valores com modificador ("12", "+2"); características com Velocidade e Fortuna; aparência e religião. |
| Inventário | Filtro "Tudo 6 · Armas 2 · Armaduras 1 · Itens 2 · Munição 1"; "Equipado" na espada e na armadura; resumos com dano, empunhadura, tipo de consumível e preço por extenso. |
| Magias | Agrupadas pela tradição, com nível, tipo, conjurações 2/3, alvo e duração. |
| Talentos | Agrupados por "Guerreiro" e "Outros", com usos 1/1. |
| Raízes | Ancestralidade, profissão e idiomas com fala, leitura e escrita. |
| URL | Trocar de aba atualiza `?ficha=` sem perder `?aba=personagem`. |
| 375 px | Sem rolagem horizontal; as abas da ficha quebram em duas linhas, com 44 px de altura. |
| 768 px | Sem rolagem horizontal; abas em uma linha. |
| 1440 px | Atributos e características em cinco colunas. |
| Anotações: edição | Editar ativa os botões e mostra "Alterações não salvas · 91 de 8.000 caracteres". |
| Anotações: sem bridge | O envio falha com "O Foundry não gravou as anotações" e o motivo; o texto continua no campo para tentar de novo. |
| Anotações: aguardando | Campo travado com o texto enviado e "Aguardando o Foundry", com a hora do envio. |
| Anotações: gravadas | "Gravadas no Foundry" com a hora, o texto novo no campo e nada pendente. |
| Anotações: conflito | "A última alteração não foi gravada" e o texto atual do Foundry no campo; editar libera "Salvar no Foundry" de novo. |
| Anotações: 375 px | Campo na largura do cartão, botões de 44 px, sem rolagem horizontal. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Alto | No celular, a barra de abas da ficha (411 px) alargava o cartão além da tela, que cortava o conteúdo. | O item da lista respeita a largura (`min-w-0`), o cartão usa padding menor no celular e a barra de abas quebra em linhas quando não cabe. |
| Baixo | Empunhadura e tipo de consumível chegavam como códigos do sistema. | Traduzidos para "Uma mão", "Poção" etc. |
| Alto | Depois de um conflito, "Salvar no Foundry" ficava travado mesmo com o texto atual carregado. | O conflito antigo vira aviso; o bloqueio vale só enquanto a edição se baseia numa versão desatualizada. |
| Médio | Ao recarregar durante o envio, o campo mostrava o texto antigo, como se nada tivesse sido enviado. | O campo mostra o texto enviado até o Foundry gravar. |

## Pendências aceitas

- O inventário não mostra ícones: miniaturas de todos os itens pesariam
  demais na sincronização.
- Com a aba do navegador em segundo plano, a consulta periódica do envio pausa
  e o estado só atualiza quando a pessoa volta à aba ou recarrega a página.
- Salvar substitui a formatação feita no Foundry por parágrafos simples, como
  o texto da tela avisa.
- A validação com dados reais depende do módulo 0.11.0 num mundo conectado.
