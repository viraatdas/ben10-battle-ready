// ============================================================
// Entities - base classes for game objects
// ============================================================

class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y;
        this.w = w; this.h = h;
        this.vx = 0; this.vy = 0;
        this.onGround = false;
        this.alive = true;
        this.facing = 1; // 1 = right, -1 = left
        this.frame = 0;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get bottom() { return this.y + this.h; }
    get hitbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

    applyGravity() {
        this.vy += GRAVITY;
        this.y += this.vy;
        if (this.y + this.h >= GROUND_Y) {
            this.y = GROUND_Y - this.h;
            this.vy = 0;
            this.onGround = true;
        }
    }

    applyMovement(levelWidth) {
        this.x += this.vx;
        if (levelWidth) {
            this.x = clamp(this.x, 0, levelWidth - this.w);
        }
    }
}

class CombatEntity extends Entity {
    constructor(x, y, w, h, hp) {
        super(x, y, w, h);
        this.hp = hp;
        this.maxHp = hp;
        this.invincible = 0;
        this.state = 'idle'; // idle, run, attack, hit, dead
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.hitStun = 0;
        this.flashTimer = 0;
        this.attackDamage = 10;
        this.attackRange = 40;
    }

    takeDamage(dmg, fromX) {
        if (this.invincible > 0 || this.state === 'dead') return false;
        this.hp -= dmg;
        this.flashTimer = 15;
        this.hitStun = 10;
        this.invincible = 20;
        this.state = 'hit';

        // Knockback
        this.vx = (this.cx > fromX ? 3 : -3);
        this.vy = -2;

        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
            return true;
        }
        return false;
    }

    die() {
        this.state = 'dead';
        this.alive = false;
    }

    updateTimers() {
        if (this.invincible > 0) this.invincible--;
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.flashTimer > 0) this.flashTimer--;
        if (this.hitStun > 0) {
            this.hitStun--;
            if (this.hitStun === 0 && this.state === 'hit') {
                this.state = 'idle';
            }
        }
        if (this.attackTimer > 0) {
            this.attackTimer--;
            if (this.attackTimer === 0) {
                this.state = 'idle';
            }
        }
    }

    getAttackHitbox() {
        const ax = this.facing === 1 ? this.x + this.w : this.x - this.attackRange;
        return { x: ax, y: this.y, w: this.attackRange, h: this.h };
    }
}
