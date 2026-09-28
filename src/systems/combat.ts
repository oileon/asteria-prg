// Fórmulas de combate puras (sem Phaser) para poderem ser testadas.

export type Facing = 1 | -1;

export interface ComboStep {
  damage: number;
  reach: number;
  /** duração total do golpe (ms) */
  duration: number;
  /** momento (0..1) da duração em que o dano é aplicado */
  hitAt: number;
  knockback: number;
  stun: number;
  /** impulso para frente do atacante durante o golpe */
  lunge: number;
}

export function calcDamage(base: number, defense: number, multiplier = 1): number {
  return Math.max(1, Math.round(base * multiplier - defense));
}

/**
 * Beat 'em up usa lanes: o alvo só é atingido se estiver à frente do atacante
 * (dentro do alcance) e na mesma faixa de profundidade (eixo y).
 */
export function inStrikeRange(
  attackerX: number,
  attackerY: number,
  facing: Facing,
  targetX: number,
  targetY: number,
  reach: number,
  laneDepth: number,
): boolean {
  const forward = (targetX - attackerX) * facing;
  return forward >= -8 && forward <= reach && Math.abs(targetY - attackerY) <= laneDepth;
}

/** Avança o passo do combo; volta a 0 depois do último golpe. */
export function nextComboStep(step: number, totalSteps: number): number {
  return (step + 1) % totalSteps;
}

/** O último golpe do combo é o finalizador (lança o inimigo mais longe). */
export function isFinisher(step: number, totalSteps: number): boolean {
  return step === totalSteps - 1;
}
