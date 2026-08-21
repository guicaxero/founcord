export const orderMotto =
  "A última luz não pertence a um homem. Ela pertence àqueles que decidiram mantê-la acesa.";

export const orderCode = [
  {
    numeral: "I",
    title: "O mestre conduz a mesa",
    body: "Durante uma missão, o mestre possui a palavra final sobre situações de regras, interpretações e acontecimentos da aventura. Discussões sobre regras podem ser feitas depois da sessão.",
  },
  {
    numeral: "II",
    title: "Nada de metagame",
    body: "Não utilize informações que seu personagem não teria como conhecer.",
  },
  {
    numeral: "III",
    title: "Compromisso com as missões",
    body: "Ao confirmar presença, comprometa-se com o horário. Caso não possa comparecer, avise com antecedência. Após 15 minutos de atraso, a Ordem poderá preencher a vaga com outro jogador disponível.",
  },
  {
    numeral: "IV",
    title: "As vagas pertencem à Ordem",
    body: "Quando uma missão possuir mais interessados do que vagas, a seleção seguirá os critérios definidos pela Ordem.",
  },
  {
    numeral: "V",
    title: "A história possui consequências",
    body: "Personagens podem falhar, sofrer consequências e morrer. A Ordem não garante a sobrevivência de nenhum personagem, e as decisões tomadas durante as missões afetam a história.",
  },
  {
    numeral: "VI",
    title: "A Ordem existe para todos",
    body: "O objetivo não é competir contra outros jogadores. Somos companheiros contando uma história juntos. Vitória, derrota, glória e morte fazem parte da mesma jornada.",
  },
  {
    numeral: "VII",
    title: "Regra do óbvio",
    body: "Trate jogadores, mestres e membros da Ordem com respeito. Conflitos entre personagens pertencem à história e não devem se transformar em conflitos entre jogadores. Não há espaço para desrespeito.",
  },
] as const;

export const levelProgression = [
  { from: 0, to: 1, sessions: 1 },
  { from: 1, to: 2, sessions: 2 },
  { from: 2, to: 3, sessions: 3 },
  { from: 3, to: 4, sessions: 4 },
  { from: 4, to: 5, sessions: 5 },
] as const;

export const missionProtocol = [
  {
    label: "Inscrição",
    value: "✅",
    body: "A reação demonstra interesse, mas não garante uma vaga. Cada chamado informa grau, vagas, data, horário e condições da missão.",
  },
  {
    label: "Seleção",
    value: "Equidade",
    body: "Quando houver mais interessados do que vagas, a Ordem aplicará os critérios da missão. Em geral, terão prioridade jogadores com menos sessões realizadas.",
  },
  {
    label: "Preparação",
    value: "−30 min",
    body: "Os selecionados recebem acesso ao canal de sessão trinta minutos antes do horário e participam da chamada de presença.",
  },
  {
    label: "Tolerância",
    value: "10 + 5 min",
    body: "Após dez minutos de espera, começa uma segunda chamada relâmpago de cinco minutos para jogadores disponíveis e de grau compatível.",
  },
] as const;

export const fiveTruths = [
  {
    numeral: "I",
    title: "Os deuses são poderes distantes",
    body: "A fé faz parte da vida em Rûl, mas os deuses, se realmente observam o mundo, permanecem distantes.",
  },
  {
    numeral: "II",
    title: "A magia é real",
    body: "Ela molda o mundo desde tempos antigos e deixa sua marca em pessoas, artefatos, ruínas e lugares.",
  },
  {
    numeral: "III",
    title: "A civilização avança",
    body: "Armas de fogo, mecanismos de precisão e autômatos começam a transformar a sociedade, embora ainda sejam raros e caros.",
  },
  {
    numeral: "IV",
    title: "Monstros habitam as terras selvagens",
    body: "Além das muralhas, dragões, trolls, gigantes, mortos-vivos e outros horrores ameaçam viajantes e aldeias.",
  },
  {
    numeral: "V",
    title: "O Império está em crise",
    body: "A morte do imperador espalhou revoltas, guerras, refugiados e disputas por poder entre as províncias.",
  },
] as const;
