"use client";

import { MotionConfig, useReducedMotion, type Transition, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Movimento do portal: curto, discreto e sempre a serviço da causalidade.
 * Nada aqui anima cor, tamanho de fonte ou layout de página inteira, e todas as
 * durações caem para zero sob `prefers-reduced-motion`.
 */
export const softTransition: Transition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};

/** Entrada padrão de blocos: sobe um pouco e aparece. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: softTransition },
};

/** Container de lista: revela os filhos em cascata curta. */
export const staggerList: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

/** Item de lista ou de grade. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: softTransition },
};

/** Conteúdo de diálogo, que acompanha o fade da camada de fundo. */
export const dialogContent: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: softTransition },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } },
};

/**
 * Desliga o movimento quando a pessoa pede menos animação. Fica na raiz do
 * layout, de modo que nenhum componente precise repetir a verificação.
 */
export function MotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const reduced = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user" transition={reduced ? { duration: 0 } : softTransition}>
      {children}
    </MotionConfig>
  );
}
