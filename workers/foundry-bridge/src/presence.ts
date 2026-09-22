/**
 * Presença do mundo Foundry. O mundo só fica online enquanto o mestre conector
 * está no Foundry; o módulo segue `nextHeartbeatSeconds` da resposta do
 * heartbeat. Com 60 s por heartbeat, um mestre conectado gera ~60 heartbeats
 * por hora, e o offline é derivado depois de dois heartbeats perdidos e meio.
 */
export const HEARTBEAT_SECONDS = 60;
export const ONLINE_WINDOW_SECONDS = 150;
