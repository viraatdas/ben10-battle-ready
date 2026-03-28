// ============================================================
// Levels - level data and backgrounds
// ============================================================

const LevelThemes = {
    factory: {
        name: 'Vilgax\'s Factory',
        sky: '#1a1a2e',
        bgColor: '#2a2a3e',
        groundColor: '#3a3a4a',
        groundAccent: '#4a4a5a',
        platformColor: '#555566',
        details: 'industrial',
    },
    sewer: {
        name: 'Sewer System',
        sky: '#0a1a0a',
        bgColor: '#1a2a1a',
        groundColor: '#334433',
        groundAccent: '#445544',
        platformColor: '#556655',
        details: 'pipes',
    },
    rafters: {
        name: 'The Rafters',
        sky: '#1a1020',
        bgColor: '#2a2030',
        groundColor: '#4a3a3a',
        groundAccent: '#5a4a4a',
        platformColor: '#6a5a5a',
        details: 'beams',
    },
    micro: {
        name: 'Micro World',
        sky: '#001122',
        bgColor: '#002244',
        groundColor: '#003355',
        groundAccent: '#004466',
        platformColor: '#005577',
        details: 'circuits',
    },
};

function generateLevel(index) {
    const themes = ['factory', 'sewer', 'rafters', 'micro'];
    const theme = LevelThemes[themes[index % themes.length]];
    const levelWidth = 3000 + index * 500;
    const isBossLevel = (index + 1) % 3 === 0;

    const enemies = [];
    const objects = [];
    const pickups = [];

    // Enemy types get harder as levels progress
    const availableEnemies = ['minion1'];
    if (index >= 1) availableEnemies.push('minion2', 'bugbot');
    if (index >= 2) availableEnemies.push('mechbot', 'nosebot');
    if (index >= 3) availableEnemies.push('flyingMechbot', 'largeBugbot');

    const objectPool = ['crate', 'barrel_brown', 'barrel_green', 'barrel_blue',
                        'cardboard_box', 'stone_block', 'barrel_explosive'];
    if (themes[index % themes.length] === 'factory') {
        objectPool.push('machine');
    }

    // Place enemies
    const enemyCount = 8 + index * 3;
    for (let i = 0; i < enemyCount; i++) {
        const ex = 400 + (i / enemyCount) * (levelWidth - 600);
        const etype = availableEnemies[randInt(0, availableEnemies.length - 1)];
        const isFlying = etype === 'flyingMechbot';
        enemies.push({
            x: ex + rand(-50, 50),
            y: isFlying ? GROUND_Y - rand(80, 140) : GROUND_Y,
            type: etype
        });
    }

    // Boss at the end of boss levels
    if (isBossLevel) {
        enemies.push({
            x: levelWidth - 200,
            y: GROUND_Y,
            type: 'boss'
        });
    }

    // Place breakable objects
    const objCount = 12 + index * 2;
    for (let i = 0; i < objCount; i++) {
        const ox = 200 + (i / objCount) * (levelWidth - 400);
        objects.push({
            x: ox + rand(-30, 30),
            y: GROUND_Y,
            type: objectPool[randInt(0, objectPool.length - 1)]
        });
    }

    // Place pickups (some inside destructibles, some standalone)
    const pickupCount = 5 + index;
    for (let i = 0; i < pickupCount; i++) {
        const px = 300 + (i / pickupCount) * (levelWidth - 500);
        const ptype = Math.random() < 0.1 ? 'extraLife' : (Math.random() < 0.3 ? 'sumoCard' : 'energy');
        pickups.push({
            x: px + rand(-20, 20),
            y: GROUND_Y,
            type: ptype
        });
    }

    // Unlock an alien every 1-2 levels
    const unlockedAliens = Math.min(ALIEN_ORDER.length, Math.floor(index / 1) + 2);

    return {
        index,
        theme,
        themeKey: themes[index % themes.length],
        width: levelWidth,
        enemies,
        objects,
        pickups,
        isBossLevel,
        unlockedAliens,
        missionText: isBossLevel ? 'Defeat the Boss!' : 'Clear all enemies!',
    };
}

// Draw scrolling background
function drawBackground(ctx, theme, camX, levelWidth) {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    grad.addColorStop(0, theme.sky);
    grad.addColorStop(1, theme.bgColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Parallax background elements
    const parallax1 = camX * 0.2;
    const parallax2 = camX * 0.4;

    // Far background buildings/structures
    ctx.fillStyle = theme.bgColor;
    for (let i = 0; i < levelWidth / 200 + 2; i++) {
        const bx = i * 200 - (parallax1 % 200);
        const bh = 80 + Math.sin(i * 1.5) * 40;
        ctx.fillRect(bx, GROUND_Y - bh - 50, 120, bh + 50);
    }

    // Mid background
    ctx.fillStyle = theme.groundAccent + '88';
    for (let i = 0; i < levelWidth / 150 + 2; i++) {
        const bx = i * 150 - (parallax2 % 150);
        const bh = 40 + Math.sin(i * 2.3) * 20;
        ctx.fillRect(bx, GROUND_Y - bh, 80, bh);
    }

    // Theme-specific details
    if (theme.details === 'industrial') {
        // Pipes and gears in background
        ctx.strokeStyle = '#444455';
        ctx.lineWidth = 4;
        for (let i = 0; i < levelWidth / 300 + 2; i++) {
            const px = i * 300 - (parallax2 % 300);
            ctx.beginPath();
            ctx.moveTo(px, GROUND_Y - 100);
            ctx.lineTo(px, GROUND_Y - 200);
            ctx.lineTo(px + 100, GROUND_Y - 200);
            ctx.stroke();
        }
    } else if (theme.details === 'pipes') {
        // Sewer pipes
        ctx.fillStyle = '#2a3a2a';
        for (let i = 0; i < levelWidth / 400 + 2; i++) {
            const px = i * 400 - (parallax1 % 400);
            ctx.beginPath();
            ctx.arc(px, GROUND_Y - 150, 30, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (theme.details === 'circuits') {
        // Circuit board traces
        ctx.strokeStyle = '#006688';
        ctx.lineWidth = 2;
        for (let i = 0; i < levelWidth / 100 + 2; i++) {
            const px = i * 100 - (parallax2 % 100);
            ctx.beginPath();
            ctx.moveTo(px, GROUND_Y - 50 - (i % 3) * 30);
            ctx.lineTo(px + 50, GROUND_Y - 50 - (i % 3) * 30);
            ctx.lineTo(px + 50, GROUND_Y - 80 - (i % 2) * 40);
            ctx.stroke();
        }
    }

    // Ground
    ctx.fillStyle = theme.groundColor;
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);

    // Ground surface line
    ctx.fillStyle = theme.groundAccent;
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 3);

    // Ground texture
    ctx.fillStyle = theme.groundAccent + '44';
    for (let i = 0; i < levelWidth / 40 + 2; i++) {
        const gx = i * 40 - (camX % 40);
        ctx.fillRect(gx, GROUND_Y + 8 + (i % 3) * 12, 20, 2);
    }
}
