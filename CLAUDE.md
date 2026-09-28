# Asteria

Beat 'em up de fantasia com progressão de RPG (1–4 jogadores). Visão completa em `Asteria_GDD_v0.2_BeatEmUp.md`.
Regra central: **o combate precisa ser divertido no nível 1** antes de qualquer sistema de RPG, conteúdo ou multiplayer.

## Stack
Phaser 3 + TypeScript estrito + Vite + Vitest. Arte 100% PixelLab (ver `docs/assets.md`).

## Comandos
- `npm install` — dependências
- `npm run dev` — servidor de desenvolvimento
- `npm run build` — `tsc --noEmit` + build de produção (rodar antes de entregar)
- `npm test` — testes das fórmulas puras

## Estrutura
- `src/scenes/` — cenas Phaser (`GameScene` = fase de combate)
- `src/entities/` — Player, Enemy (estado + visual; não decidem dano entre si)
- `src/systems/` — lógica pura testável, sem Phaser (`combat.ts`)
- `src/data/` — balanceamento em JSON (`player.json`, `enemies.json`)
- `docs/` — `design.md` (fórmulas), `assets.md` (mapa de assets)
- `public/assets/` — sprites do PixelLab

## Convenções
- Combate em **lanes**: (x, y) é o ponto no chão; y também é a profundidade (`setDepth(y)`). Acerto exige mesma lane (`inStrikeRange`).
- Entidades avisam por callbacks (`onStrike`); a `GameScene` resolve dano. Não acoplar Player↔Enemy.
- Números de balanceamento ficam em `src/data/*.json`, nunca hardcoded na lógica.
- Visuais atuais são placeholders gerados por código (marcados `TODO(assets)`).
- Ataque/esquiva vêm de eventos `keydown` (não `JustDown`), para não perder toques rápidos e permitir buffer durante o hitstop.
- Segurar uma direção vira o personagem mesmo parado; inimigos sobrepostos são separados em `separateEnemies()`.
- Em dev, `window.__game` expõe o jogo no console (`__game.scene.getScene('GameScene')`) para QA/bots de teste.
- Textos e comentários em português.

## Estado atual
Protótipo da Fase 1 (Prototype): movimento em lane, combo de 3 golpes, esquiva com i-frames, hitstop,
inimigos com telegraph/stun/knockback, 3 ondas. Próximos passos em `docs/design.md`.

Guerreiro (jogador), Slime e Goblin já usam sprite e animações reais do PixelLab (projeto
**asteria**, ver `docs/assets.md`); chão usa o tileset de grama do PixelLab. Resto do
cenário (árvores, objetos, UI) ainda é placeholder gerado por código.
