// ============================================================
// Objects - breakable objects and pickups
// ============================================================

const ObjectTypes = {
    crate:           { name: 'Crate',     w: 32, h: 32, hp: 20, color: '#8B6914', outline: '#5C4A0E', score: 10 },
    barrel_brown:    { name: 'Barrel',    w: 28, h: 36, hp: 15, color: '#8B4513', outline: '#5C2E0E', score: 10 },
    barrel_green:    { name: 'Barrel',    w: 28, h: 36, hp: 15, color: '#2E8B2E', outline: '#1E5C1E', score: 10 },
    barrel_blue:     { name: 'Barrel',    w: 28, h: 36, hp: 15, color: '#2E4E8B', outline: '#1E335C', score: 10 },
    barrel_explosive:{ name: 'TNT',       w: 28, h: 36, hp: 10, color: '#cc2222', outline: '#881111', score: 25, explosive: true },
    stone_block:     { name: 'Stone',     w: 36, h: 32, hp: 30, color: '#888', outline: '#555', score: 15 },
    cardboard_box:   { name: 'Box',       w: 30, h: 28, hp: 8,  color: '#c4a055', outline: '#8B7340', score: 5 },
    machine:         { name: 'Machine',   w: 40, h: 44, hp: 40, color: '#667', outline: '#445', score: 20 },
};

const PickupTypes = {
    energy:    { name: 'Health',   w: 20, h: 20, color: '#00ff00', effect: 'heal', value: 25 },
    extraLife: { name: '1-UP',     w: 20, h: 20, color: '#ffdd00', effect: 'life', value: 1 },
    sumoCard:  { name: 'Sumo Card',w: 18, h: 24, color: '#ff8800', effect: 'score', value: 500 },
};

class BreakableObject extends Entity {
    constructor(x, y, type) {
        const data = ObjectTypes[type];
        super(x, y - data.h, data.w, data.h);
        this.type = type;
        this.data = data;
        this.hp = data.hp;
        this.maxHp = data.hp;
        this.shakeTimer = 0;
    }

    takeDamage(dmg, fromX) {
        this.hp -= dmg;
        this.shakeTimer = 8;
        SFX.hit();

        if (this.hp <= 0) {
            this.alive = false;
            spawnParticles(this.cx, this.cy, 8, this.data.color, 3, 20);
            if (this.data.explosive) {
                spawnExplosion(this.cx, this.cy);
                SFX.explosion();
                return { explosive: true, x: this.cx, y: this.cy, radius: 80, damage: 30 };
            }
            return { score: this.data.score };
        }
        return null;
    }

    draw(ctx, camX) {
        if (!this.alive) return;
        const shakeX = this.shakeTimer > 0 ? rand(-2, 2) : 0;
        if (this.shakeTimer > 0) this.shakeTimer--;

        const sx = this.x - camX + shakeX;
        const sy = this.y;

        // Draw object
        ctx.fillStyle = this.data.color;
        ctx.fillRect(sx, sy, this.data.w, this.data.h);
        ctx.strokeStyle = this.data.outline;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, this.data.w, this.data.h);

        // Detail lines
        if (this.type === 'crate') {
            ctx.strokeStyle = this.data.outline;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + this.data.w, sy + this.data.h);
            ctx.moveTo(sx + this.data.w, sy);
            ctx.lineTo(sx, sy + this.data.h);
            ctx.stroke();
        } else if (this.type.startsWith('barrel')) {
            ctx.strokeStyle = this.data.outline;
            ctx.beginPath();
            ctx.moveTo(sx, sy + this.data.h * 0.33);
            ctx.lineTo(sx + this.data.w, sy + this.data.h * 0.33);
            ctx.moveTo(sx, sy + this.data.h * 0.66);
            ctx.lineTo(sx + this.data.w, sy + this.data.h * 0.66);
            ctx.stroke();
            if (this.data.explosive) {
                drawText(ctx, 'TNT', sx + this.data.w/2, sy + this.data.h/2, 10, '#fff', 'center');
            }
        } else if (this.type === 'machine') {
            // Lights
            ctx.fillStyle = '#0f0';
            ctx.fillRect(sx + 8, sy + 8, 4, 4);
            ctx.fillStyle = '#f00';
            ctx.fillRect(sx + 16, sy + 8, 4, 4);
            ctx.fillStyle = '#333';
            ctx.fillRect(sx + 6, sy + 18, 28, 16);
        }

        // HP indicator for damaged objects
        if (this.hp < this.maxHp) {
            const pct = this.hp / this.maxHp;
            // Crack lines
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (pct < 0.7) {
                ctx.moveTo(sx + this.w * 0.3, sy);
                ctx.lineTo(sx + this.w * 0.5, sy + this.h * 0.5);
            }
            if (pct < 0.4) {
                ctx.moveTo(sx + this.w * 0.7, sy + this.h);
                ctx.lineTo(sx + this.w * 0.4, sy + this.h * 0.3);
            }
            ctx.stroke();
        }
    }
}

class Pickup extends Entity {
    constructor(x, y, type) {
        const data = PickupTypes[type];
        super(x, y - data.h, data.w, data.h);
        this.type = type;
        this.data = data;
        this.bobFrame = rand(0, 100);
    }

    update() {
        this.bobFrame++;
    }

    apply(player) {
        switch (this.data.effect) {
            case 'heal':
                player.hp = Math.min(player.maxHp, player.hp + this.data.value);
                break;
            case 'life':
                player.lives += this.data.value;
                break;
            case 'score':
                player.score += this.data.value;
                break;
        }
        SFX.pickup();
        this.alive = false;
    }

    draw(ctx, camX) {
        if (!this.alive) return;
        const sx = this.x - camX;
        const bobY = Math.sin(this.bobFrame * 0.08) * 4;

        // Glow
        ctx.shadowColor = this.data.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.data.color;

        if (this.data.effect === 'heal') {
            // Green cross
            const cx = sx + this.w/2;
            const cy = this.y + this.h/2 + bobY;
            ctx.fillRect(cx - 3, cy - 8, 6, 16);
            ctx.fillRect(cx - 8, cy - 3, 16, 6);
        } else if (this.data.effect === 'life') {
            // Star shape
            const cx = sx + this.w/2;
            const cy = this.y + this.h/2 + bobY;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 72 - 90) * Math.PI / 180;
                const r = i % 2 === 0 ? 10 : 5;
                ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.fill();
        } else {
            // Card
            ctx.fillRect(sx, this.y + bobY, this.w, this.h);
            ctx.shadowBlur = 0;
            drawText(ctx, 'S', sx + this.w/2, this.y + this.h/2 + bobY, 12, '#fff', 'center');
        }
        ctx.shadowBlur = 0;
    }
}
