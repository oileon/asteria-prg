# Mapa de assets

Assets do PixelLab (projeto **asteria**, id `64a6fd58-e24c-4cba-8dc1-605f9405fb13`) vivem em
`public/assets/`. `add_to_project` só vincula no workspace do Game Builder do PixelLab — os
arquivos usados pelo jogo são baixados manualmente para as pastas abaixo.

## Guerreiro (personagem jogável)

`public/assets/characters/guerreiro/` — personagem `Guerreiro Asteria v3`
(`48bc2faf-8c8e-470b-ae2c-3302d712744b`), estilo Ragnarok Online (Espadachim), chibi de
cabeça grande, 64x64, só direção **east** gerada (west é flip via `setFlipX`; combate é 2D
em lane, não usa N/S/diagonais).

| Pasta | Frames | Uso |
|---|---|---|
| `anim/idle/` | 8 | `guerreiro-idle` (loop) |
| `anim/run/` | 6 | `guerreiro-run` (loop) |
| `anim/attack1/` `attack2/` `attack3/` | 9 cada (frame 0 = pose de referência) | golpes 1-3 do combo |
| `anim/dodge/` | 6 | esquiva |
| `anim/hurt/` | 6 | dano recebido |
| `anim/death/` | 7 | morte (ainda não disparada pela `GameScene`) |
| `Idle/rotations/` | 8 direções, 1 frame cada | pose estática por direção (não usada ainda) |

Canvas cresce durante os golpes (92x92 vs 64x64 parado/correndo) porque a espada estende a
silhueta; a origem do sprite usa uma fração fixa (`SPRITE_ORIGIN_Y = 0.85` em
`entities/Player.ts`) medida na arte real para manter os pés no chão nos dois tamanhos.

**Pendente:** animações de N/S/diagonais (se o jogo ganhar mais liberdade de câmera),
ataque pesado, bloqueio, launcher aéreo (ver `docs/design.md`).

## Cenário — Lunaris (floresta/tutorial)

`public/assets/tiles/lunaris/grama_terra.png` (+ `.json` com os cortes) — tileset Wang
`02db1bbd-1fa9-45fd-a28c-af822a6f0d48`, grama vibrante → trilha de terra, 32x32, 16 tiles.
Só o tile "grama pura" está em uso (`GameScene.makeGroundTiles()`), tileado como fundo.

**Pendente:** autotiling completo com a trilha de terra, árvores/pedras/casas
(`create_tiles_pro`, `create_building_kit`), variação de mapa em vez de fundo plano.

## Cenário — Floresta de Lunaris

`public/assets/objects/` — 4 árvores (`tree-pine-a/b`, `tree-oak-a/b`, 112x112, `create_1_direction_object`
view sidescroller) formando a linha de árvores no horizonte (`GameScene.drawTreeline()`,
depth fixo -9000, sempre atrás da lane); 2 pedras + 2 arbustos (`rock-a/b`, `bush-a/b`, 48x48)
espalhados na faixa abaixo da lane jogável como decoração de primeiro plano
(`drawForegroundDecor()`, fora da área de movimento — nunca atrapalham nem ficam "atravessados").
Posições geradas com seed fixa (`Phaser.Math.RandomDataGenerator`), então o layout é sempre
o mesmo entre execuções.

## UI

`public/assets/ui/` — 2 painéis do PixelLab (`create_ui_asset`):
- `health-panel/panel.png` (384x192): só a barra (x:73-311 y:157-181) é recortada em
  `GameScene.makeUiTextures()` → textura `hp-bar-bg`; o preenchimento é um `Graphics` verde/
  amarelo/vermelho por cima, proporcional ao HP (`updateHpBar()`).
- `banner-panel/panel.png` (512x192): moldura atrás do texto de "ONDA X" / vitória / derrota
  (`bannerPanel`, alpha sincronizado com o texto do banner).

## Inimigos — Slime e Goblin

`public/assets/characters/slime/` e `.../goblin/` — personagens `Slime Asteria`
(`98558cb2-6a2a-4044-bd3b-b5b40cab34e6`) e `Goblin Asteria` (`2d9b7fb1-49f5-47a9-8dc2-bb3e96b6831d`),
mesmo estilo do Guerreiro. Só direção **east** (flip para oeste). 5 animações cada:
idle, walk, attack, hurt, death (contagens exatas em `ENEMY_ANIMATIONS` na `GameScene`).

- Slime: v3 mode (blob sem membros), custom em todas as animações.
- Goblin: idle/walk/hurt/death via templates (fight-stance-idle, walk, taking-punch,
  falling-back-death); attack é v3 custom (facada com adaga).

`originY` (fração dos pés) e `width`/`height` (para shadow/hp-bar/texto de dano) ficam em
`src/data/enemies.json`, medidos na arte real como no Guerreiro — canvas cresce durante o
ataque (ex. goblin 56x56 → 76x76 pela adaga estendida).

**Pendente:** demais inimigos do GDD (lobo etc.), mini boss, boss (Alfa Corrompido).

Pastas previstas para o resto: `public/assets/objects/`, `ui/`, `fx/`.
