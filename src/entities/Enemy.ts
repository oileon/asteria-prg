import Phaser from "phaser";
import type { Facing } from "../systems/combat";

export interface EnemyDef {
  name: string;
  maxHp: number;
  defense: number;
  speed: number;
  damage: number;
  reach: number;
  windup: number;
  recovery: number;
  hurtResist: number;
  color: string;
  width: number;
  height: number;
  /** fração vertical (0-1) onde ficam os pés na arte real, para a origem do sprite. */
  originY: number;
}

type State = "chase" | "windup" | "recover" | "hurt" | "dead";

const LANE_DEPTH = 18;
// Escala por tamanho de tela da textura (ver mesmo problema/comentário em entities/Player.ts).
// O ataque do goblin usa uma tela maior (76px, a arma estica a silhueta) que o resto (56px);
// a escala usa o conteúdo real medido, não a proporção crua da tela (56/76), que deixaria o
// inimigo pequeno demais durante o ataque. O slime usa 56px em todas as animações.
const SCALE_BY_CANVAS_SIZE: Record<number, number> = { 56: 1, 76: 0.925 };

export class Enemy {
  readonly body: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly hpBar: Phaser.GameObjects.Graphics;

  hp: number;
  facing: Facing = -1;

  /** chamado no momento do golpe; a cena decide se acerta o jogador */
  onStrike: (enemy: Enemy) => void = () => {};

  private state: State = "chase";
  private stateTime = 0;
  private stateDuration = 0;
  private knockVx = 0;

  constructor(
    scene: Phaser.Scene,
    readonly def: EnemyDef,
    public x: number,
    public y: number,
    private readonly bounds: Phaser.Geom.Rectangle,
    /** prefixo das animações geradas no PixelLab, ex. "slime" / "goblin". */
    private readonly spriteKey: string,
  ) {
    this.hp = def.maxHp;
    this.shadow = scene.add.ellipse(x, y, def.width + 8, 8, 0x000000, 0.35);
    this.body = scene.add.sprite(x, y, `${spriteKey}-idle-0`).setOrigin(0.5, def.originY);
    this.hpBar = scene.add.graphics();
    this.sync();
  }

  get isDead(): boolean {
    return this.state === "dead";
  }

  /** inimigo em windup é "telegrafado": o jogador pode reagir/esquivar */
  get isWindingUp(): boolean {
    return this.state === "windup";
  }

  update(dt: number, targetX: number, targetY: number, targetAlive: boolean): void {
    if (this.state === "dead") return;
    this.stateTime += dt;

    switch (this.state) {
      case "chase":
        this.updateChase(dt, targetX, targetY, targetAlive);
        break;
      case "windup":
        if (this.stateTime >= this.def.windup) {
          this.onStrike(this);
          this.enter("recover", this.def.recovery);
        }
        break;
      case "recover":
        if (this.stateTime >= this.stateDuration) this.enter("chase");
        break;
      case "hurt":
        this.applyKnock(dt);
        if (this.stateTime >= this.stateDuration) this.enter("chase");
        break;
    }
    this.sync();
  }

  /** Retorna true se o golpe matou o inimigo. */
  takeHit(damage: number, knockback: number, stun: number, dir: Facing): boolean {
    if (this.state === "dead") return false;
    this.hp = Math.max(0, this.hp - damage);
    if (this.hp === 0) {
      this.state = "dead";
      this.stateTime = 0;
      this.shadow.setVisible(false);
      this.hpBar.clear();
      // a animação é disparada aqui (não em sync()) porque a GameScene tira o inimigo
      // da lista logo após este retorno, então ele nunca mais passaria por update()/sync().
      this.body.play(`${this.spriteKey}-death`);
      this.body.setScale(SCALE_BY_CANVAS_SIZE[this.body.frame.width] ?? 1);
      this.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.destroyVisuals());
      return true;
    }
    this.knockVx = dir * knockback * 4;
    this.enter("hurt", stun);
    return false;
  }

  nudge(dx: number, dy: number): void {
    this.moveBy(dx, dy);
  }

  destroyVisuals(): void {
    this.body.scene.tweens.add({
      targets: this.body,
      alpha: 0,
      duration: 250,
      onComplete: () => this.body.destroy(),
    });
    this.shadow.destroy();
    this.hpBar.destroy();
  }

  private updateChase(dt: number, tx: number, ty: number, targetAlive: boolean): void {
    if (!targetAlive) return;
    const dx = tx - this.x;
    const dy = ty - this.y;
    this.facing = dx >= 0 ? 1 : -1;

    const inReach = Math.abs(dx) <= this.def.reach && Math.abs(dy) <= LANE_DEPTH;
    if (inReach) {
      this.enter("windup");
      return;
    }
    const step = (this.def.speed * dt) / 1000;
    // alinha na lane primeiro sem deixar de se aproximar
    const wantX = Math.abs(dx) > this.def.reach * 0.8 ? Math.sign(dx) * step : 0;
    const wantY = Math.abs(dy) > LANE_DEPTH * 0.5 ? Math.sign(dy) * step * 0.7 : 0;
    this.moveBy(wantX, wantY);
  }

  private applyKnock(dt: number): void {
    this.moveBy((this.knockVx * dt) / 1000, 0);
    this.knockVx *= 0.9;
  }

  private enter(state: State, duration = 0): void {
    this.state = state;
    this.stateTime = 0;
    this.stateDuration = duration;
  }

  private moveBy(dx: number, dy: number): void {
    this.x = Phaser.Math.Clamp(this.x + dx, this.bounds.left, this.bounds.right);
    this.y = Phaser.Math.Clamp(this.y + dy, this.bounds.top, this.bounds.bottom);
  }

  private sync(): void {
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1);
    this.body.setPosition(this.x, this.y).setDepth(this.y).setFlipX(this.facing === -1);

    if (this.state === "windup") {
      // a animação de ataque cobre o golpe inteiro; casar sua duração com o windup faz
      // o impacto acontecer visualmente perto do momento em que onStrike() dispara.
      this.body.play({ key: `${this.spriteKey}-attack`, duration: this.def.windup }, true);
    } else if (this.state === "hurt") {
      this.body.play({ key: `${this.spriteKey}-hurt`, duration: this.stateDuration }, true);
    } else if (this.state === "chase") {
      this.body.play(`${this.spriteKey}-walk`, true);
    } else {
      this.body.play(`${this.spriteKey}-idle`, true);
    }
    // telegrafa o ataque com uma cor de aviso, além da própria animação
    this.body.setTint(this.state === "windup" ? 0xffb066 : 0xffffff);
    this.body.setScale(SCALE_BY_CANVAS_SIZE[this.body.frame.width] ?? 1);

    this.hpBar.clear();
    if (this.hp < this.def.maxHp) {
      const w = 32;
      const top = this.y - this.def.height - 10;
      this.hpBar.setDepth(9999);
      this.hpBar.fillStyle(0x000000, 0.7).fillRect(this.x - w / 2 - 1, top - 1, w + 2, 6);
      this.hpBar.fillStyle(0xd94b4b, 1).fillRect(this.x - w / 2, top, (w * this.hp) / this.def.maxHp, 4);
    }
  }
}
