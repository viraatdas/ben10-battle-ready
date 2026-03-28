// ============================================================
// Enemies - AI-controlled enemy characters
// ============================================================

const EnemyTypes = {
    minion1:        { name: 'Minion',        hp: 30,  damage: 8,  speed: 1.2, range: 35,  score: 100, scale: 4, sprite: 'minion1',  color: '#888' },
    minion2:        { name: 'Heavy Minion',  hp: 50,  damage: 12, speed: 1,   range: 40,  score: 150, scale: 4, sprite: 'minion2',  color: '#774444' },
    mechbot:        { name: 'Mechbot',       hp: 70,  damage: 15, speed: 0.8, range: 45,  score: 200, scale: 4, sprite: 'mechbot',  color: '#778899' },
    bugbot:         { name: 'Bugbot',        hp: 40,  damage: 10, speed: 1.5, range: 35,  score: 120, scale: 4, sprite: 'bugbot',   color: '#448844' },
    flyingMechbot:  { name: 'Flying Bot',    hp: 35,  damage: 10, speed: 1.3, range: 40,  score: 180, scale: 4, sprite: 'mechbot',  color: '#5577aa', flying: true },
    largeBugbot:    { name: 'Large Bugbot',  hp: 90,  damage: 18, speed: 0.7, range: 50,  score: 250, scale: 5, sprite: 'bugbot',   color: '#336633' },
    nosebot:        { name: 'Nosebot',       hp: 45,  damage: 11, speed: 1.1, range: 38,  score: 140, scale: 4, sprite: 'minion1',  color: '#666' },
    boss:           { name: 'Vilgax',        hp: 300, damage: 25, speed: 1,   range: 55,  score: 1000,scale: 5, sprite: 'boss',     color: '#882222', isBoss: true },
};

class Enemy extends CombatEntity {
    constructor(x, y, type) {
        const data = EnemyTypes[type];
        const sprite = EnemySprites[data.sprite];
        const w = sprite.w * data.scale;
        const h = sprite.idle.length * data.scale;
        super(x, y - h, w, h, data.hp);
        this.type = type;
        this.data = data;
        this.speed = data.speed;
        this.attackDamage = data.damage;
        this.attackRange = data.range;
        this.scale = data.scale;
        this.scoreValue = data.score;
        this.aiState = 'patrol';
        this.patrolDir = Math.random() > 0.5 ? 1 : -1;
        this.aiTimer = randInt(30, 90);
        this.spawnX = x;
        this.aggroRange = 250;
        this.deathTimer = 0;
        this.flying = data.flying || false;
        this.flyY = y - h;
    }

    update(player, levelWidth) {
        if (this.state === 'dead') {
            this.deathTimer++;
            return;
        }

        this.frame++;
        this.updateTimers();

        if (this.hitStun > 0) return;

        const dx = player.cx - this.cx;
        const distToPlayer = Math.abs(dx);
        const dirToPlayer = dx > 0 ? 1 : -1;

        // Flying enemies hover
        if (this.flying) {
            this.y = this.flyY + Math.sin(this.frame * 0.05) * 15;
            this.onGround = false;
        }

        // AI behavior
        this.aiTimer--;
        if (this.aiTimer <= 0) {
            this.aiTimer = randInt(20, 60);

            if (distToPlayer < this.aggroRange && player.alive && player.state !== 'dead') {
                this.aiState = 'chase';
            } else if (distToPlayer > this.aggroRange * 1.5) {
                this.aiState = 'patrol';
            }
        }

        switch (this.aiState) {
            case 'patrol':
                this.vx = this.patrolDir * this.speed * 0.5;
                this.facing = this.patrolDir;
                // Turn around at patrol bounds
                if (Math.abs(this.x - this.spawnX) > 150) {
                    this.patrolDir *= -1;
                }
                this.state = 'run';
                break;

            case 'chase':
                if (distToPlayer > this.attackRange) {
                    this.vx = dirToPlayer * this.speed;
                    this.facing = dirToPlayer;
                    this.state = 'run';
                } else {
                    this.vx = 0;
                    this.facing = dirToPlayer;
                    // Attack
                    if (this.attackCooldown <= 0 && player.alive && player.state !== 'dead') {
                        this.state = 'attack';
                        this.attackTimer = 15;
                        this.attackCooldown = this.data.isBoss ? 30 : randInt(40, 70);
                        SFX.punch();
                    } else {
                        this.state = 'idle';
                    }
                }
                break;
        }

        if (!this.flying) {
            this.applyGravity();
        }
        this.applyMovement(levelWidth);
    }

    die() {
        this.state = 'dead';
        this.alive = false;
        spawnExplosion(this.cx, this.cy);
        if (this.data.isBoss) {
            SFX.bossDeath();
        } else {
            SFX.explosion();
        }
    }

    draw(ctx, camX) {
        if (this.state === 'dead') {
            if (this.deathTimer < 20) {
                ctx.globalAlpha = 1 - this.deathTimer / 20;
                this._drawSprite(ctx, camX);
                ctx.globalAlpha = 1;
            }
            return;
        }

        if (this.flashTimer > 0 && Math.floor(this.flashTimer / 2) % 2) return;
        this._drawSprite(ctx, camX);

        // HP bar for bosses and strong enemies
        if (this.data.isBoss || this.data.hp >= 70) {
            const sx = this.x - camX;
            const barW = this.w;
            const barH = 4;
            const barY = this.y - 10;
            ctx.fillStyle = '#333';
            ctx.fillRect(sx, barY, barW, barH);
            ctx.fillStyle = this.hp > this.maxHp * 0.3 ? '#ff3333' : '#ff0000';
            ctx.fillRect(sx, barY, barW * (this.hp / this.maxHp), barH);
        }
    }

    _drawSprite(ctx, camX) {
        const spriteData = EnemySprites[this.data.sprite];
        const flipH = this.facing === -1;
        const { img, offsetY } = renderAnimFrame(spriteData, this.scale, this.frame, flipH);
        const sx = this.x - camX;
        const bobY = this.state === 'run' ? offsetY : 0;

        // Shadow
        if (!this.flying) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(sx + this.w/2, GROUND_Y, this.w/2, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Tint for specific enemy types
        ctx.drawImage(img, sx, this.y + bobY);

        // Attack effect
        if (this.state === 'attack' && this.attackTimer > 8) {
            const atkBox = this.getAttackHitbox();
            ctx.fillStyle = 'rgba(255,0,0,0.2)';
            ctx.fillRect(atkBox.x - camX, atkBox.y, atkBox.w, atkBox.h);
        }
    }
}
