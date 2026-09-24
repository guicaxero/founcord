import { redirect } from "next/navigation";

/**
 * Endereço antigo da ficha, ainda usado pelo comando /personagem do Discord.
 * Mantido como redirecionamento permanente para a área do jogador.
 */
export default function LegacyCharacterPage() {
  redirect("/eu?aba=personagem");
}
