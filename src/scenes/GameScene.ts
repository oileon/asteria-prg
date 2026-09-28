import Phaser from "phaser";
import enemyData from "../data/enemies.json";
import lunarisTiles from "../data/lunaris-tiles.json";
import playerData from "../data/player.json";
import { Enemy, type EnemyDef } from "../entities/Enemy";
import { ATTACK_TINTS, Player, PLAYER_SIZE, type PlayerInput } from "../entities/Player";
import { calcDamage, inStrikeRange, isFinisher } from "../systems/combat";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

type Terrain = "upper" | "lower";

const LANE_TOP = 330;
const LANE_BOTTOM = 490;
const HIT_LANE_DEPTH = 26;
const HITSTOP_MS = 60;

const WAVES: Array<Array<keyof typeof enemyData>> = [
  ["slime", "slime", "slime"],
  ["goblin", "slime", "goblin"],
  ["goblin", "goblin", "slime", "slime", "goblin"],
];

/** Animações do Guerreiro geradas no PixelLab (público em assets/characters/guerreiro/anim/). */
const PLAYER_ANIMATIONS: Record<string, number> = {
  idle: 8,
  run: 7,
  dodge: 6,
  hurt: 6,
  death: 7,
  attack1: 9,
  attack2: 9,
  attack3: 9,
};

/** Animações dos inimigos geradas no PixelLab (público em assets/characters/<key>/anim/). */
const ENEMY_ANIMATIONS: Record<string, Record<string, number>> = {
  slime: { idle: 7, walk: 7, attack: 9, hurt: 7, death: 7 },
  goblin: { idle: 8, walk: 6, attack: 9, hurt: 6, death: 7 },
};

/**
 * TODO(assets): cenário (além do chão) ainda é placeholder gerado por código.
 * Ver docs/assets.md para o que falta gerar no PixelLab.
 */
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private wave = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private bannerPanel!: Phaser.GameObjects.Image;
  private comboText!: Phaser.GameObjects.Text;
  private hpBarBg!: Phaser.GameObjects.Image;
  private hpBarFill!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private hitstopLeft = 0;
  private pressed = { attack: false, dodge: false };
  private kills = 0;
  private gameOver = false;
  private deathSequenceStarted = false;
  private wavePending = false;
  private laneBounds = new Phaser.Geom.Rectangle(30, LANE_TOP, GAME_WIDTH - 60, LANE_BOTTOM - LANE_TOP);

  constructor() {
    super("GameScene");
  }

  preload(): void {
    this.load.image("tiles-lunaris", "assets/tiles/lunaris/grama_terra.png");
    this.load.image("tree-pine-a", "assets/objects/tree-pine-a/tree.png");
    this.load.image("tree-pine-b", "assets/objects/tree-pine-b/tree.png");
    this.load.image("tree-oak-a", "assets/objects/tree-oak-a/tree.png");
    this.load.image("tree-oak-b", "assets/objects/tree-oak-b/tree.png");
    this.load.image("rock-a", "assets/objects/rock-a/rock.png");
    this.load.image("rock-b", "assets/objects/rock-b/rock.png");
    this.load.image("bush-a", "assets/objects/bush-a/bush.png");
    this.load.image("bush-b", "assets/objects/bush-b/bush.png");
    this.load.image("ui-health-panel", "assets/ui/health-panel/panel.png");
    this.load.image("ui-banner-panel", "assets/ui/banner-panel/panel.png");
    for (const [name, count] of Object.entries(PLAYER_ANIMATIONS)) {
      for (let i = 0; i < count; i++) {
        const frame = String(i).padStart(2, "0");
        this.load.image(`guerreiro-${name}-${i}`, `assets/characters/guerreiro/anim/${name}/${frame}.png`);
      }
    }
    for (const [spriteKey, anims] of Object.entries(ENEMY_ANIMATIONS)) {
      for (const [name, count] of Object.entries(anims)) {
        for (let i = 0; i < count; i++) {
          const frame = String(i).padStart(2, "0");
          this.load.image(`${spriteKey}-${name}-${i}`, `assets/characters/${spriteKey}/anim/${name}/${frame}.png`);
        }
      }
    }
  }

  create(): void {
    this.enemies = [];
    this.wave = 0;
    this.kills = 0;
    this.gameOver = false;
    this.deathSequenceStarted = false;
    this.wavePending = false;
    this.hitstopLeft = 0;

    this.makeWangFrames();
    this.makeUiTextures();
    this.makePlayerAnimations();
    this.makeEnemyAnimations();
    this.drawBackground();

    this.player = new Player(this, 200, (LANE_TOP + LANE_BOTTOM) / 2, this.laneBounds);
    this.player.onStrike = (step, index, isLast) => this.resolvePlayerStrike(step, index, isLast);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT",
      w: "W", a: "A", s: "S", d: "D",
      restart: "R",
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    // Ataque/esquiva usam eventos de keydown (não JustDown) para nunca perder um toque
    // rápido e para bufferizar o input durante o hitstop.
    this.pressed = { attack: false, dodge: false };
    for (const k of ["J", "Z"]) kb.on(`keydown-${k}`, () => (this.pressed.attack = true));
    for (const k of ["K", "X"]) kb.on(`keydown-${k}`, () => (this.pressed.dodge = true));

    // Barra de vida: moldura do PixelLab (recortada em makeUiTextures) + preenchimento
    // desenhado por cima, proporcional ao HP. O número fica centralizado na barra.
    this.hpBarBg = this.add.image(18, 16, "hp-bar-bg").setOrigin(0, 0).setDepth(10000);
    this.hpBarFill = this.add.graphics().setDepth(10001);
    this.hpText = this.add
      .text(18 + this.hpBarBg.width / 2, 16 + this.hpBarBg.height / 2, "", {
        fontFamily: "monospace", fontSize: "13px", color: "#ffffff", stroke: "#000", strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10002);
    this.hud = this.add
      .text(18, 16 + this.hpBarBg.height + 4, "", { fontFamily: "monospace", fontSize: "14px", color: "#ffffff", stroke: "#000", strokeThickness: 3 })
      .setDepth(10000);
    this.comboText = this.add
      .text(GAME_WIDTH - 16, 12, "", { fontFamily: "monospace", fontSize: "28px", color: "#ffd84d", stroke: "#000", strokeThickness: 4 })
      .setOrigin(1, 0)
      .setDepth(10000);
    this.bannerPanel = this.add.image(GAME_WIDTH / 2, 120, "ui-banner-panel").setOrigin(0.5).setAlpha(0).setDepth(9999);
    this.banner = this.add
      .text(GAME_WIDTH / 2, 120, "", { fontFamily: "monospace", fontSize: "32px", color: "#3a2210", stroke: "#f6dfa8", strokeThickness: 4, align: "center" })
      .setOrigin(0.5)
      .setDepth(10000);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 14, "Setas/WASD mover   J/Z atacar (combo x3)   K/X esquivar   R reiniciar", {
        fontFamily: "monospace", fontSize: "13px", color: "#9aa4b8",
      })
      .setOrigin(0.5, 1)
      .setDepth(10000);

    this.startWave();
  }

  update(_time: number, deltaMs: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
      this.scene.restart();
      return;
    }

    // hitstop: congela a simulação por instantes para dar peso ao golpe
    if (this.hitstopLeft > 0) {
      this.hitstopLeft -= deltaMs;
      return;
    }
    const dt = Math.min(deltaMs, 50);

    if (!this.gameOver) this.player.update(dt, this.readInput());
    for (const e of this.enemies) e.update(dt, this.player.x, this.player.y, !this.player.isDead);
    this.enemies = this.enemies.filter((e) => !e.isDead);
    this.separateEnemies();

    // espera a animação de morte do jogador tocar antes de mostrar a tela de derrota
    if (!this.gameOver && !this.deathSequenceStarted && this.player.isDead) {
      this.deathSequenceStarted = true;
      this.time.delayedCall(900, () => this.endGame(false));
    }
    if (!this.gameOver && !this.wavePending && this.enemies.length === 0) this.nextWave();

    this.updateHpBar();
    this.hud.setText(`Onda ${Math.min(this.wave, WAVES.length)}/${WAVES.length}   Abates ${this.kills}`);
    this.comboText.setText(this.player.comboCount >= 2 ? `${this.player.comboCount} HITS` : "");
  }

  /** Preenche a barra de vida por cima da moldura, proporcional ao HP atual. */
  private updateHpBar(): void {
    const pct = Phaser.Math.Clamp(this.player.hp / playerData.maxHp, 0, 1);
    const color = pct > 0.5 ? 0x5fd45f : pct > 0.25 ? 0xe8c22e : 0xe0473f;
    const pad = 3; // margem pra não pintar por cima da borda da moldura recortada
    const w = this.hpBarBg.width - pad * 2;
    const h = this.hpBarBg.height - pad * 2;
    this.hpBarFill.clear();
    this.hpBarFill.fillStyle(color, 1).fillRect(this.hpBarBg.x + pad, this.hpBarBg.y + pad, w * pct, h);
    this.hpText.setText(`${this.player.hp}/${playerData.maxHp}`);
  }

  /** Afasta inimigos sobrepostos na lane para não virarem um só alvo empilhado. */
  private separateEnemies(): void {
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        if (Math.abs(a.x - b.x) < 26 && Math.abs(a.y - b.y) < 12) {
          const push = a.y <= b.y ? 1 : -1;
          a.nudge(0, -push);
          b.nudge(0, push);
        }
      }
    }
  }

  private readInput(): PlayerInput {
    const k = this.keys;
    const input: PlayerInput = {
      moveX: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      moveY: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
      attackPressed: this.pressed.attack,
      dodgePressed: this.pressed.dodge,
    };
    this.pressed = { attack: false, dodge: false };
    return input;
  }

  private resolvePlayerStrike(step: (typeof playerData.combo)[number], index: number, isLast: boolean): void {
    this.spawnSlashFx(index);
    let landed = false;
    for (const e of this.enemies) {
      if (e.isDead) continue;
      if (!inStrikeRange(this.player.x, this.player.y, this.player.facing, e.x, e.y, step.reach, HIT_LANE_DEPTH)) continue;
      landed = true;
      const finisher = isFinisher(index, playerData.combo.length);
      const dmg = calcDamage(step.damage, e.def.defense);
      const killed = e.takeHit(dmg, step.knockback, step.stun, this.player.facing);
      this.spawnDamageText(e.x, e.y - e.def.height, dmg, finisher);
      if (killed) this.kills += 1;
    }
    if (landed) {
      this.hitstopLeft = HITSTOP_MS * (isLast ? 2 : 1);
      this.cameras.main.shake(isLast ? 120 : 60, isLast ? 0.006 : 0.002);
    } else {
      // errou: zera a contagem do combo
      this.player.comboCount = Math.max(0, this.player.comboCount - 1);
    }
  }

  private resolveEnemyStrike(enemy: Enemy): void {
    if (enemy.isDead || this.player.isDead) return;
    const hit = inStrikeRange(enemy.x, enemy.y, enemy.facing, this.player.x, this.player.y, enemy.def.reach + 8, HIT_LANE_DEPTH);
    if (!hit) return;
    const dmg = calcDamage(enemy.def.damage, 0);
    if (this.player.takeHit(dmg, enemy.x)) {
      this.spawnDamageText(this.player.x, this.player.y - PLAYER_SIZE.height, dmg, false, "#ff6b6b");
      this.cameras.main.shake(90, 0.004);
    }
  }

  private startWave(): void {
    this.wave += 1;
    const defs = WAVES[this.wave - 1];
    this.banner.setText(`ONDA ${this.wave}`);
    this.bannerPanel.setAlpha(1);
    this.tweens.add({ targets: [this.banner, this.bannerPanel], alpha: { from: 1, to: 0 }, duration: 1400, delay: 400 });
    defs.forEach((name, i) => {
      const side = i % 2 === 0 ? GAME_WIDTH - 40 : 40;
      const y = Phaser.Math.Between(LANE_TOP + 10, LANE_BOTTOM - 10);
      const enemy = new Enemy(this, enemyData[name] as EnemyDef, side, y, this.laneBounds, name);
      enemy.onStrike = (en) => this.resolveEnemyStrike(en);
      this.enemies.push(enemy);
    });
  }

  private nextWave(): void {
    if (this.wave >= WAVES.length) {
      this.endGame(true);
      return;
    }
    this.wavePending = true;
    this.time.delayedCall(800, () => {
      this.wavePending = false;
      if (!this.gameOver) this.startWave();
    });
  }

  private endGame(won: boolean): void {
    this.gameOver = true;
    this.banner.setAlpha(1).setText(won ? "VITÓRIA!\nR para jogar de novo" : "DERROTA\nR para tentar de novo");
    this.bannerPanel.setAlpha(1);
  }

  /**
   * Rastro visual do golpe, no momento em que ele acerta (ver `onStrike`). Os 3 golpes usam
   * sprites parecidos em movimento rápido; um arco com cor e formato diferentes por golpe
   * ajuda o jogador a perceber a troca de animação mesmo sem prestar atenção no sprite.
   * golpe 1: corte horizontal | golpe 2: corte de baixo pra cima | golpe 3: golpe de cima pra baixo (maior).
   */
  private readonly SLASH_ARCS = [
    { startDeg: -18, endDeg: 18, radius: 40, thickness: 4 },
    { startDeg: 45, endDeg: -55, radius: 42, thickness: 4 },
    { startDeg: -85, endDeg: 35, radius: 50, thickness: 7 },
  ];

  private spawnSlashFx(index: number): void {
    const p = this.player;
    const dir = p.facing;
    const arc = this.SLASH_ARCS[index];
    const cx = p.x + dir * 22;
    const cy = p.y - 30;
    const toRad = (deg: number) => Phaser.Math.DegToRad(dir === 1 ? deg : 180 - deg);

    const g = this.add.graphics().setDepth(p.y + 1);
    g.lineStyle(arc.thickness, ATTACK_TINTS[index], 1);
    g.beginPath();
    g.arc(cx, cy, arc.radius, toRad(arc.startDeg), toRad(arc.endDeg), dir === -1);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  private spawnDamageText(x: number, y: number, amount: number, big: boolean, color = "#ffffff"): void {
    const t = this.add
      .text(x, y, String(amount), {
        fontFamily: "monospace", fontSize: big ? "26px" : "18px", color, stroke: "#000", strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(10000);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(-10000);
    g.fillGradientStyle(0x6cb8ff, 0x6cb8ff, 0xd9f0ff, 0xd9f0ff, 1).fillRect(0, 0, GAME_WIDTH, LANE_TOP);

    this.drawGroundTiles();
    this.drawTreeline();
    this.drawForegroundDecor();
  }

  /**
   * Chão com autotiling Wang (`src/data/lunaris-tiles.json`, gerado a partir do tileset
   * `grama_terra.png` do PixelLab): uma trilha de terra ondulando pela lane em meio à
   * grama, em vez de um piso liso repetido. Cada tile é escolhido pelos 4 vértices que o
   * cercam (padrão dual-grid), amostrados de `pathTerrainAt`.
   */
  private drawGroundTiles(): void {
    const TILE = lunarisTiles.tileSize;
    const cols = Math.ceil(GAME_WIDTH / TILE);
    const rows = Math.ceil((GAME_HEIGHT - LANE_TOP) / TILE);

    const vertices: Terrain[][] = [];
    for (let vy = 0; vy <= rows; vy++) {
      const row: Terrain[] = [];
      for (let vx = 0; vx <= cols; vx++) row.push(this.pathTerrainAt(vx, vy, rows));
      vertices.push(row);
    }

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const corners = {
          NW: vertices[cy][cx],
          NE: vertices[cy][cx + 1],
          SW: vertices[cy + 1][cx],
          SE: vertices[cy + 1][cx + 1],
        };
        const tile = lunarisTiles.tiles.find(
          (t) => t.corners.NE === corners.NE && t.corners.NW === corners.NW && t.corners.SE === corners.SE && t.corners.SW === corners.SW,
        )!;
        this.add
          .image(cx * TILE, LANE_TOP + cy * TILE, "tiles-lunaris", `wang-${tile.x}-${tile.y}`)
          .setOrigin(0, 0)
          .setDepth(-10000);
      }
    }
  }

  /** Terreno num vértice da grade: "lower" (terra) perto do centro de uma trilha ondulada, senão "upper" (grama). */
  private pathTerrainAt(vx: number, vy: number, rows: number): Terrain {
    const pathCenter = rows / 2 + Math.sin(vx * 0.35) * 1.1;
    return Math.abs(vy - pathCenter) <= 1.1 ? "lower" : "upper";
  }

  /**
   * Linha de árvores no horizonte, servindo de "parede" da floresta atrás da lane de
   * combate. Depth fixo (não por y) pra sempre ficar atrás dos personagens.
   */
  private drawTreeline(): void {
    const kinds = ["tree-pine-a", "tree-pine-b", "tree-oak-a", "tree-oak-b"];
    const rng = new Phaser.Math.RandomDataGenerator(["floresta-lunaris"]);
    let x = -20;
    while (x < GAME_WIDTH + 20) {
      const kind = rng.pick(kinds);
      const scale = rng.realInRange(0.85, 1.15);
      this.add
        .image(x, LANE_TOP + 6, kind)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setFlipX(rng.frac() < 0.5)
        .setDepth(-9000);
      x += rng.integerInRange(70, 100);
    }
  }

  /**
   * Pedras e arbustos decorativos na faixa abaixo da lane jogável (fora da área de
   * movimento do jogador/inimigos, então nunca atrapalham nem ficam "atravessados").
   */
  private drawForegroundDecor(): void {
    const kinds = ["rock-a", "rock-b", "bush-a", "bush-b"];
    const rng = new Phaser.Math.RandomDataGenerator(["decoracao-lunaris"]);
    let x = 20;
    while (x < GAME_WIDTH - 20) {
      const kind = rng.pick(kinds);
      const y = rng.integerInRange(LANE_BOTTOM + 14, GAME_HEIGHT - 12);
      this.add
        .image(x, y, kind)
        .setOrigin(0.5, 1)
        .setScale(rng.realInRange(0.8, 1.1))
        .setFlipX(rng.frac() < 0.5)
        .setDepth(y);
      x += rng.integerInRange(90, 150);
    }
  }

  /**
   * Registra os 16 tiles Wang do tileset `grama_terra.png` (128x128, 4x4 tiles de 32px)
   * como frames nomeados `wang-<x>-<y>`, pra recortar cada um sem duplicar a imagem.
   * Ver `src/data/lunaris-tiles.json` para os cantos (corners) de cada tile.
   */
  private makeWangFrames(): void {
    const tex = this.textures.get("tiles-lunaris");
    if (tex.has(`wang-${lunarisTiles.tiles[0].x}-${lunarisTiles.tiles[0].y}`)) return;
    for (const t of lunarisTiles.tiles) {
      tex.add(`wang-${t.x}-${t.y}`, 0, t.x, t.y, lunarisTiles.tileSize, lunarisTiles.tileSize);
    }
  }

  /**
   * Recorta só a barra (sem a moldura vazia ao redor) do painel de vida gerado no PixelLab
   * (`ui/health-panel/panel.png`, 384x192, a barra ocupa aprox. x:73-311 y:157-181).
   */
  private makeUiTextures(): void {
    if (this.textures.exists("hp-bar-bg")) return;
    const sheet = this.textures.get("ui-health-panel").getSourceImage() as HTMLImageElement;
    const sx = 73;
    const sy = 157;
    const sw = 238;
    const sh = 24;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext("2d")!.drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh);
    this.textures.addCanvas("hp-bar-bg", canvas);
  }

  /** Monta as animações do Guerreiro a partir dos frames soltos carregados no preload(). */
  private makePlayerAnimations(): void {
    if (this.anims.exists("guerreiro-idle")) return;
    const define = (name: string, count: number, opts: Phaser.Types.Animations.Animation): void => {
      const frames = Array.from({ length: count }, (_, i) => ({ key: `guerreiro-${name}-${i}` }));
      this.anims.create({ key: `guerreiro-${name}`, frames, ...opts });
    };
    // frameRate é o padrão; Player sobrescreve com `duration` para casar com as
    // janelas de tempo do combate (ver src/data/player.json).
    define("idle", PLAYER_ANIMATIONS.idle, { frameRate: 6, repeat: -1 });
    define("run", PLAYER_ANIMATIONS.run, { frameRate: 12, repeat: -1 });
    define("dodge", PLAYER_ANIMATIONS.dodge, { frameRate: 12, repeat: 0 });
    define("hurt", PLAYER_ANIMATIONS.hurt, { frameRate: 10, repeat: 0 });
    define("death", PLAYER_ANIMATIONS.death, { frameRate: 8, repeat: 0 });
    define("attack1", PLAYER_ANIMATIONS.attack1, { frameRate: 20, repeat: 0 });
    define("attack2", PLAYER_ANIMATIONS.attack2, { frameRate: 20, repeat: 0 });
    define("attack3", PLAYER_ANIMATIONS.attack3, { frameRate: 14, repeat: 0 });
  }

  /** Monta as animações dos inimigos a partir dos frames soltos carregados no preload(). */
  private makeEnemyAnimations(): void {
    if (this.anims.exists("slime-idle")) return;
    for (const [spriteKey, anims] of Object.entries(ENEMY_ANIMATIONS)) {
      for (const [name, count] of Object.entries(anims)) {
        const frames = Array.from({ length: count }, (_, i) => ({ key: `${spriteKey}-${name}-${i}` }));
        const looping = name === "idle" || name === "walk";
        // frameRate é o padrão; Enemy sobrescreve com `duration` para casar com windup/stun
        // definidos em src/data/enemies.json.
        this.anims.create({ key: `${spriteKey}-${name}`, frames, frameRate: 8, repeat: looping ? -1 : 0 });
      }
    }
  }
}
