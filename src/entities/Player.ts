import Phaser from "phaser";
import playerData from "../data/player.json";
import { nextComboStep, type ComboStep, type Facing } from "../systems/combat";

export interface PlayerInput {
  moveX: number;
  moveY: number;
  attackPressed: boolean;
  dodgePressed: boolean;
}

type State = "free" | "attack" | "dodge" | "hurt";

// Origem vertical do sprite: fração medida na arte real (guerreiro/anim/*) onde os pés
// ficam, ~0.83-0.875 dependendo da animação (golpes têm tela maior por causa da espada).
// Um valor único e intermediário mantém os pés no chão sem precisar de offset por animação.
const SPRITE_ORIGIN_Y = 0.85;
// Escala por tamanho de tela da textura. Cada animação foi gerada num canvas diferente
// (64px pro idle; 92px pra corrida/golpes/morte, porque a espada estica a silhueta durante
// a geração no PixelLab). A escala NÃO é simplesmente 64/92: o personagem em si não cresce
// na mesma proporção da tela, só ganha mais margem transparente ao redor. Os valores abaixo
// vêm da medição do conteúdo real (sem a margem) desses PNGs — usar a proporção da tela
// direto deixa o personagem pequeno demais nas animações de tela maior.
const SCALE_BY_CANVAS_SIZE: Record<number, number> = { 64: 1, 92: 0.873 };
export const PLAYER_SIZE = { width: 40, height: 56 };

// Cor por golpe do combo: os 3 golpes usam sprites parecidos em movimento rápido, então
// uma cor própria por golpe ajuda o jogador a "ler" a troca de animação (ver GameScene
// para o efeito de rastro da espada, que usa as mesmas cores).
export const ATTACK_TINTS = [0xd8f0ff, 0xffe066, 0xff7b3d] as const;

/**
 * Personagem jogável. (x, y) é o ponto no chão; o sprite fica ancorado nos pés.
 * O dano é resolvido pela cena via `onStrike`, mantendo a entidade desacoplada.
 */
export class Player {
  readonly body: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  x: number;
  y: number;
  facing: Facing = 1;
  hp = playerData.maxHp;
  comboStep = 0;
  comboCount = 0;

  onStrike: (step: ComboStep, stepIndex: number, isLast: boolean) => void = () => {};

  private state: State = "free";
  private stateTime = 0;
  private struckThisSwing = false;
  private bufferedAttack = false;
  private comboWindowLeft = 0;
  private dodgeCooldownLeft = 0;
  private dodgeDir = new Phaser.Math.Vector2(1, 0);
  private invulnLeft = 0;
  private moving = false;
  private deathAnimStarted = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bounds: Phaser.Geom.Rectangle,
  ) {
    this.x = x;
    this.y = y;
    this.shadow = scene.add.ellipse(x, y, 34, 10, 0x000000, 0.35);
    this.body = scene.add.sprite(x, y, "guerreiro-idle-0").setOrigin(0.5, SPRITE_ORIGIN_Y);
    this.sync();
  }

  get isInvulnerable(): boolean {
    return this.state === "dodge" || this.invulnLeft > 0;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  update(dt: number, input: PlayerInput): void {
    if (this.isDead) {
      this.sync();
      return;
    }
    this.invulnLeft = Math.max(0, this.invulnLeft - dt);
    this.dodgeCooldownLeft = Math.max(0, this.dodgeCooldownLeft - dt);
    this.comboWindowLeft = Math.max(0, this.comboWindowLeft - dt);
    if (this.comboWindowLeft === 0 && this.state === "free") this.comboStep = 0;
    if (this.comboWindowLeft === 0 && this.state === "free") this.comboCount = 0;

    this.stateTime += dt;

    switch (this.state) {
      case "free":
        this.updateFree(dt, input);
        break;
      case "attack":
        this.updateAttack(dt, input);
        break;
      case "dodge":
        this.updateDodge(dt);
        break;
      case "hurt":
        if (this.stateTime >= playerData.hurtStun) this.enter("free");
        break;
    }

    this.sync();
  }

  takeHit(damage: number, fromX: number): boolean {
    if (this.isInvulnerable || this.isDead) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.invulnLeft = playerData.invulnAfterHit;
    this.comboCount = 0;
    this.comboStep = 0;
    this.bufferedAttack = false;
    this.moving = false;
    this.moveBy(fromX < this.x ? 14 : -14, 0);
    this.enter("hurt");
    return true;
  }

  private updateFree(dt: number, input: PlayerInput): void {
    // segurar uma direção vira o personagem mesmo parado (ex.: encostado na borda),
    // para poder atacar/esquivar naquele sentido
    if (input.moveX !== 0) this.facing = input.moveX > 0 ? 1 : -1;
    if (input.dodgePressed && this.dodgeCooldownLeft === 0) {
      this.startDodge(input);
      return;
    }
    if (input.attackPressed) {
      this.startAttack();
      return;
    }
    const speed = (playerData.speed * dt) / 1000;
    const dir = new Phaser.Math.Vector2(input.moveX, input.moveY);
    this.moving = dir.lengthSq() > 0;
    if (this.moving) {
      dir.normalize();
      this.moveBy(dir.x * speed, dir.y * speed * playerData.laneSpeedFactor);
    }
  }

  private startAttack(): void {
    this.enter("attack");
    this.struckThisSwing = false;
    this.bufferedAttack = false;
    this.moving = false;
  }

  private updateAttack(dt: number, input: PlayerInput): void {
    const step = playerData.combo[this.comboStep];
    if (input.attackPressed) this.bufferedAttack = true;

    const progress = this.stateTime / step.duration;
    // avanço curto durante a primeira metade do golpe
    if (progress < 0.5) this.moveBy(this.facing * step.lunge * (dt / (step.duration * 0.5)), 0);

    if (!this.struckThisSwing && progress >= step.hitAt) {
      this.struckThisSwing = true;
      this.comboCount += 1;
      this.onStrike(step, this.comboStep, this.comboStep === playerData.combo.length - 1);
    }

    if (this.stateTime >= step.duration) {
      const wasLast = this.comboStep === playerData.combo.length - 1;
      this.comboStep = nextComboStep(this.comboStep, playerData.combo.length);
      if (this.bufferedAttack && !wasLast) {
        this.startAttack();
      } else {
        if (wasLast) this.comboStep = 0;
        this.comboWindowLeft = playerData.comboWindow;
        this.enter("free");
      }
    }
  }

  private startDodge(input: PlayerInput): void {
    const dir = new Phaser.Math.Vector2(input.moveX, input.moveY);
    if (dir.lengthSq() === 0) dir.set(this.facing, 0);
    this.dodgeDir = dir.normalize();
    this.dodgeCooldownLeft = playerData.dodge.cooldown;
    this.comboStep = 0;
    this.moving = false;
    this.enter("dodge");
  }

  private updateDodge(dt: number): void {
    const t = this.stateTime / playerData.dodge.duration;
    const ease = 1 - t; // desacelera ao longo da esquiva
    const dist = (playerData.dodge.speed * ease * dt) / 1000;
    this.moveBy(this.dodgeDir.x * dist, this.dodgeDir.y * dist * playerData.laneSpeedFactor);
    if (this.stateTime >= playerData.dodge.duration) this.enter("free");
  }

  private enter(state: State): void {
    this.state = state;
    this.stateTime = 0;
  }

  private moveBy(dx: number, dy: number): void {
    this.x = Phaser.Math.Clamp(this.x + dx, this.bounds.left, this.bounds.right);
    this.y = Phaser.Math.Clamp(this.y + dy, this.bounds.top, this.bounds.bottom);
  }

  private sync(): void {
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1).setVisible(!this.isDead);
    this.body.setPosition(this.x, this.y).setDepth(this.y).setFlipX(this.facing === -1);

    if (this.isDead) {
      if (!this.deathAnimStarted) {
        this.deathAnimStarted = true;
        this.body.play("guerreiro-death");
      }
      this.body.clearTint();
      this.normalizeScale();
      return;
    }

    if (this.state === "attack") {
      const step = playerData.combo[this.comboStep];
      this.body.play({ key: `guerreiro-attack${this.comboStep + 1}`, duration: step.duration }, true);
    } else if (this.state === "dodge") {
      this.body.play({ key: "guerreiro-dodge", duration: playerData.dodge.duration }, true);
    } else if (this.state === "hurt") {
      this.body.play({ key: "guerreiro-hurt", duration: playerData.hurtStun }, true);
    } else {
      this.body.play(this.moving ? "guerreiro-run" : "guerreiro-idle", true);
    }

    // flash de invulnerabilidade após tomar dano tem prioridade; senão, cor por golpe do combo
    const flashing = this.invulnLeft > 0 && Math.floor(this.invulnLeft / 80) % 2 === 0;
    if (flashing) this.body.setTint(0xff8888);
    else if (this.state === "attack") this.body.setTint(ATTACK_TINTS[this.comboStep]);
    else this.body.clearTint();
    this.body.setAlpha(this.state === "dodge" ? 0.75 : 1);
    this.normalizeScale();
  }

  /**
   * Cada animação foi gerada num canvas de tamanho diferente (64px ou 92px). Como o sprite
   * é desenhado no tamanho nativo do frame, sem isso o personagem muda de tamanho na tela
   * ao trocar de animação (ex.: idle 64px vs. corrida/golpes/morte a 92px).
   */
  private normalizeScale(): void {
    const canvasSize = this.body.frame.width;
    this.body.setScale(SCALE_BY_CANVAS_SIZE[canvasSize] ?? 1);
  }
}
