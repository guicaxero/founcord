UPDATE `iam_users`
SET `display_name` = 'Guardião da Chama AP',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = '00000000-0000-4000-8000-000000000000'
  AND `discord_user_id` = '__system__';
--> statement-breakpoint
UPDATE `campaigns`
SET `slug` = 'ordem-da-ultima-luz',
    `name` = 'Ordem da Última Luz',
    `description` = 'Campanha West Marches de Shadow of the Demon Lord ambientada em Urth, no ano 888 DF.',
    `version` = `version` + 1,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = '11111111-1111-4111-8111-111111111111';
--> statement-breakpoint
DELETE FROM `missions`
WHERE `campaign_id` = '11111111-1111-4111-8111-111111111111'
  AND `author_user_id` = '00000000-0000-4000-8000-000000000000'
  AND `id` IN (
    '22222222-2222-4222-8222-222222222221',
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222223'
  );
--> statement-breakpoint
INSERT OR IGNORE INTO `posts` (
  `id`, `campaign_id`, `author_user_id`, `title`, `body`, `status`, `source`,
  `published_at`, `version`, `created_at`, `updated_at`
) VALUES (
  '33333333-3333-4333-8333-333333333331',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'A Chama que Permaneceu',
  'Há muitos anos, esta fortaleza pertenceu a um grupo de homens e mulheres que, em tempos difíceis, escolheram enfrentar aquilo que outros não podiam ou não queriam enfrentar. Foram heróis, embora nunca tenham se chamado assim.

Durante anos, esta fortaleza foi seu lar. Aqui eram traçados planos, divididas tarefas e tomadas decisões que, algumas vezes, salvaram vidas. No centro de tudo havia uma chama. Uma simples pira, diante da qual nos reuníamos para conversar, discutir e, ocasionalmente, apenas permanecer em silêncio.

Então tudo terminou.

Partiram para uma missão e nunca retornaram. A Ordem deixou de existir e a fortaleza foi abandonada. Eu também parti.

Por muitos anos não voltei. Cinquenta anos se passaram antes que eu cruzasse novamente aqueles portões.

A fortaleza estava em ruínas, como era de se esperar. O tempo havia tomado quase tudo. Recuperei sua posse e comecei a limpar os escombros, sem saber exatamente o que pretendia fazer dali em diante.

Então entrei no antigo salão. A chama estava acesa. Não deveria estar.

Não havia madeira, óleo ou qualquer outra coisa que pudesse alimentá-la. Não havia ninguém ali. Ainda assim, ela queimava exatamente como eu me lembrava.

Não sei quem a acendeu. Não sei por que permaneceu apagada por tantos anos, apenas para voltar a arder quando retornei. E não pretendo encontrar uma resposta.

Naquele momento, compreendi que algumas coisas não precisam ser explicadas para serem lembradas.

Foi então que decidi reconstruir aquilo que havia sido perdido.

Não quero recriar a antiga Ordem. Seus dias terminaram junto daqueles que a fundaram. Quero construir algo novo sobre suas cinzas.

Uma Ordem que reúna aqueles dispostos a enfrentar a escuridão, qualquer que seja sua origem, e que ofereça uma chance àqueles que ainda acreditam que vale a pena proteger alguma coisa.

Assim nasceu a Ordem da Última Luz.

E enquanto ela permanecer, haverá aqueles dispostos a caminhar onde outros não ousam.

Enquanto houver luz, haverá esperança.',
  'published',
  'manual',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT OR IGNORE INTO `posts` (
  `id`, `campaign_id`, `author_user_id`, `title`, `body`, `status`, `source`,
  `published_at`, `version`, `created_at`, `updated_at`
) VALUES (
  '33333333-3333-4333-8333-333333333332',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'Crônica V — As Cruzadas',
  'Quando o Culto do Novo Deus se estabeleceu como a religião dominante no Império, seus líderes voltaram novamente os olhos para o norte.

A Desolação permanecia como uma ameaça constante, e suas criaturas continuavam a surgir das ruínas e terras devastadas que haviam pertencido aos Gog.

Durante muito tempo, o Império havia se tornado complacente com a proteção de suas fronteiras. A distância e os perigos da região tornavam difícil manter uma presença permanente, e muitos preferiam acreditar que as criaturas da Desolação permaneceriam onde estavam.

Estavam errados.

Novos relatos de horrores vindos da Extensão Norte começaram a chegar às cidades do Império. Uma facção militante do Culto do Novo Deus pressionou a Matriarca para que reunisse um exército e enfrentasse a ameaça antes que ela alcançasse novamente as terras imperiais.

Com o apoio do Império, o Reino Sagrado reuniu um grande exército e enviou suas forças através das montanhas.

Assim começaram as Cruzadas.

Os cruzados avançaram pela fronteira. Cidadelas foram construídas ao longo da orla da Desolação, servindo como fortalezas, pontos de abastecimento e bases para expedições contra as criaturas que habitavam aquelas terras.

A presença dos cruzados trouxe segurança para muitos dos que viviam na fronteira. Estradas foram reconstruídas, comunidades cresceram ao redor das fortalezas e a região tornou-se novamente habitável.

O envolvimento financeiro do Império aumentou com o passar dos anos. Tropas precisavam ser mantidas, fortalezas abastecidas e estradas protegidas.

Até que, em determinado momento, a distinção entre as terras do Reino Sagrado e as terras imperiais deixou de fazer sentido.

O Império simplesmente anexou a região.

Ela tornou-se sua oitava província, colocando toda aquela fronteira sob a autoridade do Trono de Alabastro.

As Cruzadas haviam começado para proteger o Império de uma ameaça.

No fim, também serviram para expandir suas fronteiras.

Talvez tenha sido esse o propósito desde o início.',
  'published',
  'manual',
  '2026-08-12T00:11:00-03:00',
  1,
  '2026-08-12T00:11:00-03:00',
  '2026-08-12T00:11:00-03:00'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `posts` (
  `id`, `campaign_id`, `author_user_id`, `title`, `body`, `status`, `source`,
  `published_at`, `version`, `created_at`, `updated_at`
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'Crônica IV — A Ascensão do Império',
  'O reinado do Rei-Bruxo terminou com a chegada dos Kalasans. Vindos de terras distantes, eles encontraram os povos que haviam sobrevivido ao domínio dos Gog e ajudaram a formar as forças que finalmente derrubaram o antigo império.

A queda do Rei-Bruxo não trouxe imediatamente paz às terras conquistadas. O fim de seu domínio deixou para trás cidades destruídas, estradas abandonadas e regiões inteiras sem autoridade.

Nos anos que se seguiram à fundação do Império, a chamada Extensão Norte foi pouco a pouco tomada pela natureza. Florestas avançaram sobre antigas estradas, ruínas desapareceram sob a vegetação e cidades inteiras foram abandonadas.

Ainda assim, aquelas terras nunca ficaram completamente vazias.

Mosteiros permaneceram de pé nas encostas das Montanhas do Escudo. Eremitas encontraram abrigo na Mata Nebulosa e no Pântano dos Ossos. Pequenos assentamentos aprenderam a sobreviver longe das grandes cidades.

Alguns fugiam da expansão do Império. Outros escapavam das guerras e dos Orcs que lutavam em nome do Imperador.

Havia ainda aqueles que simplesmente procuravam um lugar onde pudessem começar uma nova vida, longe dos reis e das guerras.

Essas migrações deram origem a novos assentamentos. Primeiro no leste, depois cada vez mais para o oeste, avançando em direção à Mata Nebulosa e às terras sob a sombra da temida Montanha do Medo.

Foi assim que as fronteiras começaram a avançar.

Não através de uma única grande conquista, mas pelas mãos de homens e mulheres que construíram suas casas onde antes existiam apenas ruínas e florestas.

É fácil olhar para um mapa e pensar que as fronteiras sempre estiveram onde estão.

Não estiveram.

Cada estrada foi aberta por alguém. Cada vila foi erguida sobre uma terra que antes pertencia a outra coisa.

E algumas dessas coisas ainda podem estar lá.',
  'published',
  'manual',
  '2026-08-11T23:53:00-03:00',
  1,
  '2026-08-11T23:53:00-03:00',
  '2026-08-11T23:53:00-03:00'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `posts` (
  `id`, `campaign_id`, `author_user_id`, `title`, `body`, `status`, `source`,
  `published_at`, `version`, `created_at`, `updated_at`
) VALUES (
  '33333333-3333-4333-8333-333333333334',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'Crônica III — Os Gog e o Rei-Bruxo',
  'Muito antes da ascensão do Império, a região que hoje conhecemos como Desolação era habitada pelos Gog, uma raça de humanos maculados que havia abandonado há muito tempo os costumes dos povos comuns.

Os Gog dedicavam-se às trevas e ao mal. Sua busca por conhecimento e poder levou-os a criar coisas que jamais deveriam ter existido.

Entre suas maiores criações esteve uma terrível praga, cuja origem e verdadeira natureza permanecem desconhecidas.

A praga acabou se voltando contra seus próprios criadores.

Com a Desolação consumida por aquilo que haviam criado, os Gog abandonaram suas terras e partiram para o sul em busca de um novo lugar onde pudessem estabelecer sua civilização.

Foi então que surgiu o homem que a história recordaria como o Rei-Bruxo.

Sob seu comando, os Gog não chegaram como refugiados.

Chegaram como conquistadores.

Fortalecidos por exércitos de mortos-vivos e demônios aprisionados, avançaram sobre os pequenos reinos que existiam ao sul da Desolação.

Reinos inteiros foram destruídos, seus povos escravizados e suas terras incorporadas ao domínio dos Gog.

Pouco a pouco, o território caiu sob o controle do Rei-Bruxo. Por algum tempo, parecia que nada poderia deter sua expansão.

Mas o domínio dos Gog não durou para sempre.

Os povos subjugados começaram a resistir, e forças vindas de terras distantes eventualmente se uniram contra o Rei-Bruxo.

Após uma longa guerra, seu império finalmente caiu.

Os Gog foram derrotados e dispersos. Muitos desapareceram. Outros retornaram para a Desolação.

Hoje, as ruínas de sua civilização permanecem espalhadas pela Desolação e pelas terras que um dia estiveram sob seu domínio.

A praga que destruiu sua terra natal permanece como um dos maiores mistérios da história.

A Ordem não possui provas de que ela ainda exista.

Mas também não possui provas de que tenha desaparecido.

E, quando se trata de uma praga criada pelos Gog, considero essa diferença importante demais para ser ignorada.',
  'published',
  'manual',
  '2026-08-11T23:49:00-03:00',
  1,
  '2026-08-11T23:49:00-03:00',
  '2026-08-11T23:49:00-03:00'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `posts` (
  `id`, `campaign_id`, `author_user_id`, `title`, `body`, `status`, `source`,
  `published_at`, `version`, `created_at`, `updated_at`
) VALUES (
  '33333333-3333-4333-8333-333333333335',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'Crônica II — O Calendário de Urth',
  'Um ano em Urth possui 336 dias, cada um dividido em vinte e quatro horas.

O calendário utilizado pelo Império divide esse período em doze meses, nomeados simplesmente de acordo com sua ordem. Assim temos o Primeiro-mês, o Segundo-mês, o Terceiro-mês e assim por diante.

Cada mês possui quatro semanas de sete dias. Os dias são identificados pela semana em que se encontram e pela posição que ocupam dentro dela.

O terceiro dia da segunda semana, por exemplo, é chamado oficialmente de Segundo-Terceiro Dia.

Na prática, porém, poucos têm paciência para tamanha formalidade, e nomes mais simples são utilizados no cotidiano.

O calendário imperial também estabelece a forma como os anos são contados.

O ano atual é o 888 DF — Depois da Fundação, tomando como ponto de partida a fundação do Império.

É fácil esquecer o significado disso quando se olha apenas para os números.

O calendário não serve apenas para marcar a passagem dos dias. Ele é uma das muitas formas pelas quais o Império deixou sua marca sobre Urth.

Os meses possuem seus nomes, os anos possuem sua contagem e até mesmo a maneira como os homens dizem que o tempo passa segue um padrão estabelecido há séculos.

Não sei se isso é importante.

Talvez seja apenas uma conveniência.

Mas aprendi que as coisas que parecem pequenas costumam revelar muito sobre aqueles que as criaram.',
  'published',
  'manual',
  '2026-08-11T23:30:00-03:00',
  1,
  '2026-08-11T23:30:00-03:00',
  '2026-08-11T23:30:00-03:00'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `posts` (
  `id`, `campaign_id`, `author_user_id`, `title`, `body`, `status`, `source`,
  `published_at`, `version`, `created_at`, `updated_at`
) VALUES (
  '33333333-3333-4333-8333-333333333336',
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-4000-8000-000000000000',
  'Crônica I — Cinco Verdades de Rûl',
  'I. Os Deuses são Poderes Distantes

A fé faz parte da vida em Rûl. Templos existem em todas as grandes cidades, e sacerdotes dedicam suas vidas aos deuses. Embora milagres sejam atribuídos à intervenção divina, ninguém pode afirmar ter visto um deus caminhar entre os mortais. Os deuses, se realmente observam o mundo, permanecem distantes.

II. A Magia é Real

A magia existe e molda o mundo desde tempos antigos. Alguns nascem com talento para manipulá-la, outros dedicam anos ao seu estudo ou a recebem por meio da devoção. Artefatos encantados, ruínas antigas e lugares marcados por estranhas energias são provas de que a magia está presente em toda parte.

III. A Civilização Avança

Apesar dos tempos difíceis, o conhecimento continua evoluindo. Armas de fogo, mecanismos de precisão, autômatos e outras invenções começam a transformar a sociedade. Ainda são tecnologias raras e caras, mas muitos acreditam que uma nova era está surgindo.

IV. Monstros Habitam as Terras Selvagens

As muralhas das cidades oferecem proteção, mas além delas o mundo continua perigoso. Dragões, trolls, gigantes, mortos-vivos e inúmeras outras criaturas ameaçam viajantes e aldeias. Poucos lugares permanecem verdadeiramente seguros, e sempre há alguém disposto a pagar por quem enfrente esses perigos.

V. O Império Está em Crise

A morte do imperador mergulhou o maior reino de Rûl em um período de instabilidade. Revoltas, guerras e disputas por poder espalham-se pelas províncias, enquanto refugiados abandonam seus lares em busca de segurança. Muitos acreditam que uma grande mudança está por vir, embora ninguém saiba qual será seu desfecho.',
  'published',
  'manual',
  '2026-08-11T23:27:00-03:00',
  1,
  '2026-08-11T23:27:00-03:00',
  '2026-08-11T23:27:00-03:00'
);
--> statement-breakpoint
PRAGMA optimize;
