// ============================================================
// Particles - visual effects
// ============================================================
const particles = [];

function spawnParticles(x, y, count, color, speed, life) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: rand(-speed, speed),
            vy: rand(-speed, speed * 0.5),
            life: life || rand(15, 30),
            maxLife: life || 30,
            color: color || '#ff0',
            size: rand(2, 5)
        });
    }
}

function spawnTransformEffect(x, y, color) {
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        particles.push({
            x, y,
            vx: Math.cos(angle) * rand(3, 6),
            vy: Math.sin(angle) * rand(3, 6),
            life: rand(20, 40),
            maxLife: 40,
            color: color,
            size: rand(3, 7)
        });
    }
}

function spawnHitSparks(x, y) {
    spawnParticles(x, y, 6, '#fff', 4, 10);
    spawnParticles(x, y, 4, '#ff0', 3, 15);
}

function spawnExplosion(x, y) {
    spawnParticles(x, y, 15, '#ff6600', 5, 20);
    spawnParticles(x, y, 10, '#ffaa00', 4, 25);
    spawnParticles(x, y, 5, '#ff0000', 3, 30);
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles(ctx, camX) {
    for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - camX - p.size/2, p.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}
