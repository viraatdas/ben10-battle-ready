// ============================================================
// HUD - heads-up display and Omnitrix interface
// ============================================================

class HUD {
    constructor() {
        this.missionPopup = null;
        this.missionTimer = 0;
        this.omnitrixAnim = 0;
        this.levelCompleteTimer = 0;
        this.shakeTimer = 0;
    }

    showMission(text) {
        this.missionPopup = text;
        this.missionTimer = 180;
    }

    showLevelComplete() {
        this.levelCompleteTimer = 180;
    }

    shake() {
        this.shakeTimer = 10;
    }

    update() {
        if (this.missionTimer > 0) this.missionTimer--;
        if (this.levelCompleteTimer > 0) this.levelCompleteTimer--;
        if (this.shakeTimer > 0) this.shakeTimer--;
        this.omnitrixAnim++;
    }

    getShakeOffset() {
        if (this.shakeTimer > 0) {
            return { x: rand(-3, 3), y: rand(-3, 3) };
        }
        return { x: 0, y: 0 };
    }

    draw(ctx, player, level, timeLeft, enemiesLeft) {
        // ---- Omnitrix band (top left) ----
        this._drawOmnitrix(ctx, player);

        // ---- Health bar ----
        const hpX = 80, hpY = 14, hpW = 120, hpH = 14;
        ctx.fillStyle = '#222';
        ctx.fillRect(hpX, hpY, hpW, hpH);
        const hpPct = player.hp / player.maxHp;
        const hpColor = hpPct > 0.5 ? '#00cc00' : (hpPct > 0.25 ? '#cccc00' : '#cc0000');
        ctx.fillStyle = hpColor;
        ctx.fillRect(hpX, hpY, hpW * hpPct, hpH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(hpX, hpY, hpW, hpH);
        drawText(ctx, 'HP', hpX + hpW / 2, hpY + hpH / 2, 10, '#fff', 'center');

        // ---- Lives ----
        drawText(ctx, `x${player.lives}`, 215, 21, 14, '#fff', 'left');

        // ---- Transform timer ----
        if (player.currentForm !== 'ben') {
            const tX = 80, tY = 32, tW = 120, tH = 8;
            ctx.fillStyle = '#222';
            ctx.fillRect(tX, tY, tW, tH);
            const tPct = player.transformTimer / player.transformMax;
            ctx.fillStyle = tPct > 0.3 ? '#00aaff' : '#ff4400';
            ctx.fillRect(tX, tY, tW * tPct, tH);
            ctx.strokeStyle = '#aaa';
            ctx.strokeRect(tX, tY, tW, tH);
        } else if (player.transformCooldown > 0) {
            const tX = 80, tY = 32, tW = 120, tH = 8;
            ctx.fillStyle = '#222';
            ctx.fillRect(tX, tY, tW, tH);
            ctx.fillStyle = '#663300';
            ctx.fillRect(tX, tY, tW * (1 - player.transformCooldown / 120), tH);
            ctx.strokeStyle = '#555';
            ctx.strokeRect(tX, tY, tW, tH);
        }

        // ---- Score (top right) ----
        drawText(ctx, `SCORE: ${Math.floor(player.score)}`, GAME_WIDTH - 20, 21, 16, '#fff', 'right', '#000');

        // ---- Level info ----
        drawText(ctx, level.theme.name, GAME_WIDTH / 2, 16, 14, '#aaa', 'center');
        drawText(ctx, `Level ${level.index + 1}`, GAME_WIDTH / 2, 34, 11, '#777', 'center');

        // ---- Timer ----
        const mins = Math.floor(timeLeft / 3600);
        const secs = Math.floor((timeLeft % 3600) / 60);
        const timeColor = timeLeft < 600 ? '#ff0000' : '#fff';
        drawText(ctx, `${mins}:${secs.toString().padStart(2, '0')}`, GAME_WIDTH - 20, 45, 13, timeColor, 'right');

        // ---- Enemies left ----
        drawText(ctx, `Enemies: ${enemiesLeft}`, GAME_WIDTH / 2, 52, 11, '#ff6666', 'center');

        // ---- Controls reminder (bottom) ----
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, GAME_HEIGHT - 28, GAME_WIDTH, 28);
        drawText(ctx, 'Arrow Keys: Move | Space: Jump | Z: Attack | X: Transform', GAME_WIDTH / 2, GAME_HEIGHT - 14, 11, '#888', 'center');

        // ---- Alien selector (bottom right) ----
        this._drawAlienSelector(ctx, player, level);

        // ---- Mission popup ----
        if (this.missionTimer > 0) {
            const alpha = this.missionTimer > 150 ? (180 - this.missionTimer) / 30 :
                          this.missionTimer < 30 ? this.missionTimer / 30 : 1;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(GAME_WIDTH/2 - 180, GAME_HEIGHT/2 - 30, 360, 60);
            ctx.strokeStyle = '#00d100';
            ctx.lineWidth = 2;
            ctx.strokeRect(GAME_WIDTH/2 - 180, GAME_HEIGHT/2 - 30, 360, 60);
            drawText(ctx, 'MISSION', GAME_WIDTH/2, GAME_HEIGHT/2 - 10, 14, '#00d100', 'center');
            drawText(ctx, this.missionPopup, GAME_WIDTH/2, GAME_HEIGHT/2 + 12, 18, '#fff', 'center');
            ctx.globalAlpha = 1;
        }

        // ---- Level complete ----
        if (this.levelCompleteTimer > 0) {
            const alpha = this.levelCompleteTimer > 150 ? (180 - this.levelCompleteTimer) / 30 :
                          this.levelCompleteTimer < 30 ? this.levelCompleteTimer / 30 : 1;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, GAME_HEIGHT/2 - 40, GAME_WIDTH, 80);
            drawText(ctx, 'LEVEL COMPLETE!', GAME_WIDTH/2, GAME_HEIGHT/2, 32, '#00ff00', 'center', '#000');
            ctx.globalAlpha = 1;
        }
    }

    _drawOmnitrix(ctx, player) {
        const ox = 10, oy = 8, size = 30;

        // Omnitrix dial background
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(ox + size/2, oy + size/2, size/2 + 4, 0, Math.PI * 2);
        ctx.fill();

        // Omnitrix face
        const isActive = player.currentForm !== 'ben';
        const glowColor = isActive ? AlienData[player.currentForm].color :
                          (player.transformCooldown > 0 ? '#ff0000' : '#00d100');
        ctx.fillStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(ox + size/2, oy + size/2, size/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Character icon in center
        const formName = isActive ? AlienData[player.currentForm].name[0] : 'B';
        drawText(ctx, formName, ox + size/2, oy + size/2, 14, '#fff', 'center', '#000');

        // Omnitrix prongs
        ctx.fillStyle = '#555';
        ctx.fillRect(ox - 4, oy + size/2 - 2, 6, 4);
        ctx.fillRect(ox + size - 2, oy + size/2 - 2, 6, 4);

        // Character name
        const name = isActive ? AlienData[player.currentForm].name : 'Ben';
        drawText(ctx, name, ox + size/2, oy + size + 8, 10, glowColor, 'center');
    }

    _drawAlienSelector(ctx, player, level) {
        const startX = GAME_WIDTH - 260;
        const y = GAME_HEIGHT - 64;
        const size = 22;
        const gap = 2;

        for (let i = 0; i < ALIEN_ORDER.length; i++) {
            const alien = ALIEN_ORDER[i];
            const data = AlienData[alien];
            const ax = startX + i * (size + gap);
            const unlocked = i < level.unlockedAliens;

            // Background
            ctx.fillStyle = unlocked ? (i === player.selectedAlien ? '#00d100' : '#333') : '#222';
            ctx.fillRect(ax, y, size, size);
            ctx.strokeStyle = unlocked ? '#555' : '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(ax, y, size, size);

            if (unlocked) {
                // Alien icon (first letter)
                drawText(ctx, data.name[0], ax + size/2, y + size/2, 10,
                    i === player.selectedAlien ? '#000' : data.color, 'center');
            } else {
                drawText(ctx, '?', ax + size/2, y + size/2, 10, '#444', 'center');
            }
        }

        // Selection arrows hint
        if (player.currentForm === 'ben') {
            drawText(ctx, '<Q  E>', startX + (ALIEN_ORDER.length * (size + gap)) / 2, y - 8, 9, '#666', 'center');
        }
    }
}
