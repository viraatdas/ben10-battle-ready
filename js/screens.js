// ============================================================
// Screens - title, game over, etc.
// ============================================================

const Screens = {
    drawTitle(ctx, frame) {
        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, '#0a0a1a');
        grad.addColorStop(0.5, '#1a2a1a');
        grad.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Animated background particles
        for (let i = 0; i < 30; i++) {
            const px = (i * 97 + frame * 0.3) % GAME_WIDTH;
            const py = (i * 67 + frame * 0.2) % GAME_HEIGHT;
            ctx.fillStyle = `rgba(0,209,0,${0.1 + Math.sin(frame * 0.02 + i) * 0.05})`;
            ctx.fillRect(px, py, 2, 2);
        }

        // Green circuit lines in background
        ctx.strokeStyle = 'rgba(0,209,0,0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            const y = 50 + i * 55;
            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x < GAME_WIDTH; x += 40) {
                ctx.lineTo(x + 20, y + Math.sin(x * 0.02 + frame * 0.01) * 10);
            }
            ctx.stroke();
        }

        // Omnitrix symbol
        const cx = GAME_WIDTH / 2;
        const omY = 140;
        const pulse = 1 + Math.sin(frame * 0.05) * 0.05;

        // Outer ring
        ctx.strokeStyle = '#00d100';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20 * pulse;
        ctx.beginPath();
        ctx.arc(cx, omY, 50 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Inner circle
        ctx.fillStyle = '#00d100';
        ctx.beginPath();
        ctx.arc(cx, omY, 30 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Hourglass shape
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(cx - 15, omY - 20);
        ctx.lineTo(cx + 15, omY - 20);
        ctx.lineTo(cx + 5, omY);
        ctx.lineTo(cx + 15, omY + 20);
        ctx.lineTo(cx - 15, omY + 20);
        ctx.lineTo(cx - 5, omY);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Title text
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 15;
        drawText(ctx, 'BEN 10', cx, 240, 56, '#00d100', 'center', '#003300');
        ctx.shadowBlur = 0;
        drawText(ctx, 'BATTLE READY', cx, 280, 28, '#ffffff', 'center', '#333');

        // Subtitle
        drawText(ctx, 'HTML5 Edition', cx, 310, 14, '#00aa00', 'center');

        // Start prompt (blinking)
        if (Math.floor(frame / 30) % 2 === 0) {
            drawText(ctx, 'PRESS ENTER OR SPACE TO START', cx, 380, 18, '#fff', 'center', '#000');
        }

        // Controls
        drawText(ctx, 'Arrow Keys / WASD: Move    Space: Jump    Z: Attack    X: Transform', cx, 430, 12, '#666', 'center');
        drawText(ctx, 'Q / E: Select Alien', cx, 448, 12, '#666', 'center');

        // Credit
        drawText(ctx, 'Converted from Shockwave Director to HTML5', cx, GAME_HEIGHT - 15, 10, '#444', 'center');
    },

    drawGameOver(ctx, frame, player) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        const cx = GAME_WIDTH / 2;

        // Red omnitrix
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(cx, 150, 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        drawText(ctx, 'GAME OVER', cx, 230, 48, '#ff3333', 'center', '#330000');
        drawText(ctx, `Final Score: ${Math.floor(player.score)}`, cx, 280, 22, '#fff', 'center');

        if (Math.floor(frame / 30) % 2 === 0) {
            drawText(ctx, 'PRESS ENTER TO CONTINUE', cx, 350, 18, '#aaa', 'center');
        }
    },

    drawPause(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        drawText(ctx, 'PAUSED', GAME_WIDTH/2, GAME_HEIGHT/2 - 10, 36, '#fff', 'center', '#000');
        drawText(ctx, 'Press P or Escape to Resume', GAME_WIDTH/2, GAME_HEIGHT/2 + 25, 16, '#aaa', 'center');
    },

    drawLevelIntro(ctx, frame, level) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        const cx = GAME_WIDTH / 2;
        const alpha = Math.min(1, frame / 30);
        ctx.globalAlpha = alpha;

        drawText(ctx, `LEVEL ${level.index + 1}`, cx, GAME_HEIGHT/2 - 40, 22, '#888', 'center');
        drawText(ctx, level.theme.name, cx, GAME_HEIGHT/2, 36, '#00d100', 'center', '#003300');
        drawText(ctx, level.missionText, cx, GAME_HEIGHT/2 + 40, 18, '#fff', 'center');

        if (level.isBossLevel) {
            drawText(ctx, '** BOSS BATTLE **', cx, GAME_HEIGHT/2 + 70, 16, '#ff4444', 'center');
        }

        ctx.globalAlpha = 1;
    },

    drawWin(ctx, frame, player) {
        // Victory background
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, '#001a00');
        grad.addColorStop(0.5, '#003300');
        grad.addColorStop(1, '#001a00');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Celebration particles
        for (let i = 0; i < 40; i++) {
            const px = (i * 73 + frame * 0.5) % GAME_WIDTH;
            const py = (i * 41 + frame * 0.3) % GAME_HEIGHT;
            const colors = ['#00ff00', '#ffdd00', '#ff8800', '#00aaff', '#ff44ff'];
            ctx.fillStyle = colors[i % colors.length];
            ctx.globalAlpha = 0.5 + Math.sin(frame * 0.05 + i) * 0.3;
            ctx.fillRect(px, py, 4, 4);
        }
        ctx.globalAlpha = 1;

        const cx = GAME_WIDTH / 2;
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20;
        drawText(ctx, 'CONGRATULATIONS!', cx, 120, 40, '#00ff00', 'center', '#003300');
        ctx.shadowBlur = 0;

        drawText(ctx, 'You defeated Vilgax and saved the world!', cx, 180, 18, '#fff', 'center');
        drawText(ctx, `Final Score: ${Math.floor(player.score)}`, cx, 230, 28, '#ffdd00', 'center', '#000');

        // Stats
        drawText(ctx, `Lives Remaining: ${player.lives}`, cx, 280, 16, '#aaa', 'center');

        if (Math.floor(frame / 30) % 2 === 0) {
            drawText(ctx, 'PRESS ENTER TO PLAY AGAIN', cx, 380, 18, '#fff', 'center');
        }

        drawText(ctx, 'Thanks for playing Ben 10: Battle Ready!', cx, GAME_HEIGHT - 30, 14, '#00aa00', 'center');
    }
};
