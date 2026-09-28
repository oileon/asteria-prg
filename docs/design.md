# Design técnico — Asteria (protótipo)

## Controles
| Ação | Teclas |
|---|---|
| Mover (8 direções, lane) | Setas / WASD |
| Ataque (combo x3) | J / Z |
| Esquiva | K / X |
| Reiniciar | R |

## Fórmulas (`src/systems/combat.ts`)
- **Dano** = `max(1, round(base * multiplicador - defesa))`
- **Acerto** = alvo à frente (`-8 ≤ dx*facing ≤ reach`) e `|dy| ≤ laneDepth` (26 px para o jogador, 18 para IA de aproximação)
- **Combo**: 3 passos em `player.json`; apertar ataque durante o golpe enfileira o próximo. O 3º é finalizador (knockback 200, stun 500, hitstop dobrado).
- **Janela de combo**: 600 ms após o fim do golpe para encadear o próximo (`comboWindow` em `player.json`); depois volta ao passo 1. (Era 220 ms; curto demais para o ritmo normal de teclado.)
- **Leitura visual do combo**: os golpes 1-2-3 usam sprites parecidos em movimento rápido, então cada um tinge o personagem com uma cor (`ATTACK_TINTS` em `entities/Player.ts`) e desenha um rastro de espada com cor/formato próprios no momento do acerto (`GameScene.spawnSlashFx`), pra ficar claro qual golpe é qual mesmo sem reparar no sprite.
- **Esquiva**: 260 ms, invulnerável durante, desacelera linearmente, cooldown 450 ms.
- **Dano recebido**: invulnerabilidade de 700 ms + stun de 300 ms.

## Inimigos (`enemies.json`)
Estados: perseguir → windup (telegrafado: laranja + "incha") → golpe → recuperação. Levar dano interrompe o windup (hurt).

## Feedback de impacto
Hitstop 60 ms (120 ms no finalizador), screen shake, números de dano, tint por estado.

## Próximos passos (ordem do GDD)
1. Validar o "feeling" do combate e ajustar `player.json`.
2. Substituir placeholders pelos sprites do PixelLab (personagem 8 direções + animações).
3. Ataque pesado, bloqueio, launcher/airborne.
4. Mini boss e boss (Alfa Corrompido).
5. Fase completa com scroll de câmera e arenas.
6. Só depois: progressão RPG, relíquias, escavação, multiplayer.
