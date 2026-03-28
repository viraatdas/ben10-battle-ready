// ============================================================
// Player - Ben Tennyson and alien transformations
// ============================================================

const AlienData = {
    ben:         { name: 'Ben',         color: '#44aa44', speed: 3,   jumpForce: -11, damage: 8,  range: 35, hp: 100, scale: 4, sprite: 'ben' },
    fourarms:    { name: 'Four Arms',   color: '#cc2222', speed: 2.5, jumpForce: -10, damage: 25, range: 50, hp: 150, scale: 5, sprite: 'fourarms' },
    heatblast:   { name: 'Heatblast',   color: '#ff6600', speed: 3,   jumpForce: -11, damage: 18, range: 60, hp: 120, scale: 4, sprite: 'heatblast' },
    diamondhead: { name: 'Diamondhead', color: '#00ccaa', speed: 2.8, jumpForce: -10, damage: 20, range: 45, hp: 140, scale: 4, sprite: 'diamondhead' },
    xlr8:        { name: 'XLR8',        color: '#3366ff', speed: 5,   jumpForce: -12, damage: 12, range: 40, hp: 90,  scale: 4, sprite: 'xlr8' },
    wildmutt:    { name: 'Wildmutt',    color: '#cc6622', speed: 4,   jumpForce: -11, damage: 15, range: 45, hp: 110, scale: 4, sprite: 'wildmutt' },
    ghostfreak:  { name: 'Ghostfreak',  color: '#9933ff', speed: 3,   jumpForce: -13, damage: 14, range: 50, hp: 80,  scale: 4, sprite: 'ghostfreak' },
    upgrade:     { name: 'Upgrade',     color: '#00cc00', speed: 3,   jumpForce: -11, damage: 16, range: 55, hp: 110, scale: 4, sprite: 'upgrade' },
    stinkfly:    { name: 'Stinkfly',    color: '#338833', speed: 3.5, jumpForce: -14, damage: 13, range: 50, hp: 95,  scale: 4, sprite: 'stinkfly' },
    ripjaw:      { name: 'Ripjaw',      color: '#335577', speed: 3.2, jumpForce: -11, damage: 17, range: 45, hp: 120, scale: 4, sprite: 'ripjaw' },
    graymatter:  { name: 'Gray Matter', color: '#778899', speed: 3.5, jumpForce: -12, damage: 6,  range: 30, hp: 60,  scale: 3, sprite: 'graymatter' },
};

const ALIEN_ORDER = ['fourarms','heatblast','diamondhead','xlr8','wildmutt','ghostfreak','upgrade','stinkfly','ripjaw','graymatter'];

class Player extends CombatEntity {
    constructor(x, y) {
        super(x, y, 36, 52, 100);
        this.currentForm = 'ben';
        this.lives = 3;
        this.score = 0;
        this.transformTimer = 0;
        this.transformMax = 600; // 10 seconds at 60fps
        this.transformCooldown = 0;
        this.selectedAlien = 0; // index into ALIEN_ORDER
        this.omnitrixOpen = false;
        this.omnitrixCursor = 0;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.applyForm('ben');
        this.projectiles = [];
    }

    applyForm(form) {
        const data = AlienData[form];
        this.currentForm = form;
        this.maxHp = data.hp;
        this.hp = Math.min(this.hp, data.hp);
        this.attackDamage = data.damage;
        this.attackRange = data.range;
        this.speed = data.speed;
        this.jumpForce = data.jumpForce;
        this.w = CharSprites[data.sprite].w * data.scale;
        this.h = CharSprites[data.sprite].idle.length * data.scale;
    }

    transform(alienKey) {
        if (this.transformCooldown > 0 || this.state === 'dead') return;
        if (this.currentForm !== 'ben') {
            // Untransform back to Ben
            this.untransform();
            return;
        }
        this.currentForm = alienKey;
        const prevHpPct = this.hp / this.maxHp;
        this.applyForm(alienKey);
        this.hp = Math.ceil(this.maxHp * prevHpPct);
        this.transformTimer = this.transformMax;
        this.invincible = 30;
        this.state = 'idle';
        spawnTransformEffect(this.cx, this.cy, AlienData[alienKey].color);
        SFX.transform();
    }

    untransform() {
        if (this.currentForm === 'ben') return;
        const prevHpPct = this.hp / this.maxHp;
        spawnTransformEffect(this.cx, this.cy, '#44aa44');
        this.applyForm('ben');
        this.hp = Math.max(1, Math.ceil(this.maxHp * prevHpPct));
        this.transformTimer = 0;
        this.transformCooldown = 120; // 2 second cooldown
        SFX.untransform();
    }

    update(levelWidth) {
        if (this.state === 'dead') return;
        this.frame++;
        this.updateTimers();

        if (this.transformCooldown > 0) this.transformCooldown--;
        if (this.comboTimer > 0) { this.comboTimer--; if (this.comboTimer === 0) this.comboCount = 0; }

        // Transform timer
        if (this.currentForm !== 'ben') {
            this.transformTimer--;
            if (this.transformTimer <= 0) {
                this.untransform();
            }
        }

        // Movement
        if (this.hitStun <= 0 && this.state !== 'attack') {
            this.vx = 0;
            if (isLeft()) { this.vx = -this.speed; this.facing = -1; this.state = 'run'; }
            else if (isRight()) { this.vx = this.speed; this.facing = 1; this.state = 'run'; }
            else if (this.state === 'run') { this.state = 'idle'; }

            if (isJump() && this.onGround) {
                this.vy = this.jumpForce;
                this.onGround = false;
                SFX.jump();
            }

            if (isAttack() && this.attackCooldown <= 0) {
                this.state = 'attack';
                this.attackTimer = 12;
                this.attackCooldown = 18;
                SFX.punch();
                // Ranged attacks for some aliens
                if (['heatblast','upgrade','stinkfly'].includes(this.currentForm)) {
                    this.projectiles.push({
                        x: this.cx + this.facing * 20,
                        y: this.cy,
                        vx: this.facing * 7,
                        w: 12, h: 8,
                        damage: this.attackDamage,
                        life: 40,
                        color: AlienData[this.currentForm].color,
                        owner: this
                    });
                }
            }

            if (isTransform()) {
                if (this.currentForm !== 'ben') {
                    this.untransform();
                } else if (this.transformCooldown <= 0) {
                    this.transform(ALIEN_ORDER[this.selectedAlien]);
                }
            }
        }

        this.applyGravity();
        this.applyMovement(levelWidth);

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx;
            p.life--;
            if (p.life <= 0) this.projectiles.splice(i, 1);
        }
    }

    die() {
        this.state = 'dead';
        this.lives--;
        SFX.death();
        spawnExplosion(this.cx, this.cy);
    }

    respawn(x) {
        this.alive = true;
        this.state = 'idle';
        this.x = x;
        this.y = GROUND_Y - this.h;
        this.vx = 0; this.vy = 0;
        if (this.currentForm !== 'ben') this.untransform();
        this.hp = this.maxHp;
        this.invincible = 90;
    }

    addScore(pts) {
        this.score += pts * (1 + this.comboCount * 0.1);
        this.comboCount++;
        this.comboTimer = 60;
    }

    draw(ctx, camX) {
        if (this.state === 'dead') return;

        // Flash when invincible
        if (this.invincible > 0 && Math.floor(this.invincible / 3) % 2) return;

        const data = AlienData[this.currentForm];
        const spriteData = CharSprites[data.sprite];
        const scale = data.scale;
        const flipH = this.facing === -1;

        // Attack visual
        if (this.state === 'attack') {
            const atkBox = this.getAttackHitbox();
            ctx.fillStyle = data.color + '44';
            ctx.fillRect(atkBox.x - camX, atkBox.y, atkBox.w, atkBox.h);
        }

        // Draw sprite
        const sx = this.x - camX;
        const { img, offsetY } = renderAnimFrame(spriteData, scale, this.frame, flipH);
        const bobY = this.state === 'run' ? offsetY : 0;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(sx + this.w/2, GROUND_Y, this.w/2, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.drawImage(img, sx, this.y + bobY);

        // Omnitrix glow on wrist
        if (this.currentForm === 'ben') {
            ctx.fillStyle = this.transformCooldown > 0 ? '#ff0000' : '#00ff00';
            ctx.fillRect(sx + (flipH ? this.w - 12 : 4), this.y + this.h * 0.55, 8, 4);
        }

        // Draw projectiles
        for (const p of this.projectiles) {
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(p.x - camX, p.y, p.w, p.h);
            ctx.shadowBlur = 0;
        }

        // Combo counter
        if (this.comboCount > 1) {
            drawText(ctx, `${this.comboCount}x COMBO!`, sx + this.w/2, this.y - 20, 12, '#ff0', 'center', '#000');
        }
    }
}
