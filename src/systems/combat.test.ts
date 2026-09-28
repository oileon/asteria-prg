import { describe, expect, it } from "vitest";
import { calcDamage, inStrikeRange, isFinisher, nextComboStep } from "./combat";

describe("calcDamage", () => {
  it("nunca causa menos de 1 de dano", () => {
    expect(calcDamage(5, 100)).toBe(1);
  });
  it("aplica multiplicador e defesa", () => {
    expect(calcDamage(10, 2, 1.5)).toBe(13);
  });
});

describe("inStrikeRange", () => {
  it("acerta alvo à frente e na mesma lane", () => {
    expect(inStrikeRange(0, 0, 1, 40, 5, 50, 20)).toBe(true);
  });
  it("erra alvo atrás do atacante", () => {
    expect(inStrikeRange(0, 0, 1, -40, 0, 50, 20)).toBe(false);
  });
  it("erra alvo em outra lane", () => {
    expect(inStrikeRange(0, 0, 1, 40, 60, 50, 20)).toBe(false);
  });
  it("respeita a direção para a esquerda", () => {
    expect(inStrikeRange(100, 0, -1, 60, 0, 50, 20)).toBe(true);
  });
});

describe("combo", () => {
  it("cicla e identifica o finalizador", () => {
    expect(nextComboStep(2, 3)).toBe(0);
    expect(isFinisher(2, 3)).toBe(true);
    expect(isFinisher(0, 3)).toBe(false);
  });
});
