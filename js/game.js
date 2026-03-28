// ============================================================
// Game - main game loop and state management
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GameState = {
    LOADING: 'loading',
    TITLE: 'title',
    LEVEL_INTRO: 'level_intro',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over',
    WIN: 'win',
};

const Game = {
    state: GameState.LOADING,
    frame: 0,
    player: null,
    enemies: [],
    objects: [],
    pickups: [],
    level: null,
    levelIndex: 0,
    camX: 0,
    timeLeft: 0,
    introTimer: 0,
    deathTimer: 0,
    hud: null,
    maxLevels: 12,
    _levelCompleting: false,

    init() {
        this.hud = new HUD();
        this.player = new Player(100, GROUND_Y - 52);
        this.state = GameState.TITLE;

        // Hide loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.classList.add('hidden');

        // Alien selector keys
        window.addEventListener('keydown', e => {
            if (e.code === 'KeyQ' && this.player.currentForm === 'ben') {
                const max = (this.level?.unlockedAliens) || 2;
                this.player.selectedAlien = (this.player.selectedAlien - 1 + max) % max;
                SFX.select();
            }
            if (e.code === 'KeyE' && this.player.currentForm === 'ben') {
                const max = (this.level?.unlockedAliens) || 2;
                this.player.selectedAlien = (this.player.selectedAlien + 1) % max;
                SFX.select();
            }
            if ((e.code === 'KeyP' || e.code === 'Escape') && this.state === GameState.PLAYING) {
                this.state = GameState.PAUSED;
            } else if ((e.code === 'KeyP' || e.code === 'Escape') && this.state === GameState.PAUSED) {
                this.state = GameState.PLAYING;
            }
            if (e.code === 'KeyM') {
                audioEnabled = !audioEnabled;
            }
        });

        this.loop();
    },

    startLevel(index) {
        this.levelIndex = index;
        this.level = generateLevel(index);
        this.camX = 0;
        this.timeLeft = 5400; // 90 seconds

        // Spawn enemies
        this.enemies = this.level.enemies.map(e =>
            new Enemy(e.x, e.y, e.type)
        );

        // Spawn objects
        this.objects = this.level.objects.map(o =>
            new BreakableObject(o.x, o.y, o.type)
        );

        // Spawn pickups
        this.pickups = this.level.pickups.map(p =>
            new Pickup(p.x, p.y, p.type)
        );

        // Reset player position
        this.player.x = 60;
        this.player.y = GROUND_Y - this.player.h;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.projectiles = [];

        // Show level intro
        this.state = GameState.LEVEL_INTRO;
        this.introTimer = 120;
    },

    update() {
        this.frame++;
        updateInput();

        switch (this.state) {
            case GameState.TITLE:
                if (isAnyKey()) {
                    this.player = new Player(100, GROUND_Y - 52);
                    this.startLevel(0);
                    // Resume audio context on first interaction
                    if (AudioCtx?.state === 'suspended') AudioCtx.resume();
                }
                break;

            case GameState.LEVEL_INTRO:
                this.introTimer--;
                if (this.introTimer <= 0 || isAnyKey()) {
                    this.state = GameState.PLAYING;
                    this.hud.showMission(this.level.missionText);
                }
                break;

            case GameState.PLAYING:
                this._updatePlaying();
                break;

            case GameState.PAUSED:
                // Wait for unpause
                break;

            case GameState.GAME_OVER:
                if (isAnyKey() && this.frame > 60) {
                    this.state = GameState.TITLE;
                    this.frame = 0;
                }
                break;

            case GameState.WIN:
                if (isAnyKey() && this.frame > 60) {
                    this.state = GameState.TITLE;
                    this.frame = 0;
                }
                break;
        }
    },

    _updatePlaying() {
        const player = this.player;
        const level = this.level;

        // Timer
        this.timeLeft--;
        if (this.timeLeft <= 0 && player.state !== 'dead') {
            player.hp = 0;
            player.die();
        }

        // Player
        player.update(level.width);

        // Handle player death
        if (player.state === 'dead') {
            this.deathTimer++;
            if (this.deathTimer > 90) {
                if (player.lives > 0) {
                    player.respawn(Math.max(60, this.camX + 100));
                    this.deathTimer = 0;
                } else {
                    this.state = GameState.GAME_OVER;
                    this.frame = 0;
                }
            }
            // Still update particles during death
            updateParticles();
            return;
        }

        // Camera follow player
        const targetCam = player.cx - GAME_WIDTH / 3;
        this.camX = lerp(this.camX, clamp(targetCam, 0, level.width - GAME_WIDTH), 0.08);

        // Enemies
        const aliveEnemies = [];
        for (const enemy of this.enemies) {
            enemy.update(player, level.width);

            if (enemy.alive) {
                aliveEnemies.push(enemy);

                // Enemy attacks player
                if (enemy.state === 'attack' && enemy.attackTimer === 10) {
                    const atkBox = enemy.getAttackHitbox();
                    if (rectOverlap(atkBox, player.hitbox)) {
                        player.takeDamage(enemy.attackDamage, enemy.cx);
                        this.hud.shake();
                        SFX.hit();
                        if (player.hp <= 0) {
                            player.die();
                        }
                    }
                }

                // Player attacks enemy (melee)
                if (player.state === 'attack' && player.attackTimer === 8) {
                    const atkBox = player.getAttackHitbox();
                    if (rectOverlap(atkBox, enemy.hitbox)) {
                        const killed = enemy.takeDamage(player.attackDamage, player.cx);
                        spawnHitSparks(enemy.cx, enemy.cy);
                        if (killed) {
                            player.addScore(enemy.scoreValue);
                        }
                    }
                }

                // Player projectiles hit enemy
                for (let i = player.projectiles.length - 1; i >= 0; i--) {
                    const proj = player.projectiles[i];
                    const projBox = { x: proj.x, y: proj.y, w: proj.w, h: proj.h };
                    if (rectOverlap(projBox, enemy.hitbox)) {
                        const killed = enemy.takeDamage(proj.damage, proj.x);
                        spawnHitSparks(enemy.cx, enemy.cy);
                        player.projectiles.splice(i, 1);
                        if (killed) {
                            player.addScore(enemy.scoreValue);
                        }
                    }
                }

                // Contact damage
                if (rectOverlap(player.hitbox, enemy.hitbox) && player.invincible <= 0) {
                    player.takeDamage(Math.floor(enemy.attackDamage * 0.5), enemy.cx);
                    this.hud.shake();
                    if (player.hp <= 0) {
                        player.die();
                    }
                }
            }
        }

        // Breakable objects
        for (const obj of this.objects) {
            if (!obj.alive) continue;

            // Player attacks objects
            if (player.state === 'attack' && player.attackTimer === 8) {
                const atkBox = player.getAttackHitbox();
                if (rectOverlap(atkBox, obj.hitbox)) {
                    const result = obj.takeDamage(player.attackDamage, player.cx);
                    if (result) {
                        if (result.score) player.addScore(result.score);
                        if (result.explosive) {
                            // Explosive barrel damages nearby enemies
                            for (const enemy of this.enemies) {
                                if (enemy.alive && dist({ x: result.x, y: result.y }, enemy) < result.radius) {
                                    enemy.takeDamage(result.damage, result.x);
                                }
                            }
                            this.hud.shake();
                        }
                        // Chance to spawn pickup from broken objects
                        if (Math.random() < 0.25) {
                            const ptype = Math.random() < 0.15 ? 'extraLife' : 'energy';
                            this.pickups.push(new Pickup(obj.cx, GROUND_Y, ptype));
                        }
                    }
                }
            }

            // Projectiles hit objects
            for (let i = player.projectiles.length - 1; i >= 0; i--) {
                const proj = player.projectiles[i];
                const projBox = { x: proj.x, y: proj.y, w: proj.w, h: proj.h };
                if (rectOverlap(projBox, obj.hitbox)) {
                    obj.takeDamage(proj.damage, proj.x);
                    player.projectiles.splice(i, 1);
                }
            }
        }

        // Pickups
        for (const pickup of this.pickups) {
            if (!pickup.alive) continue;
            pickup.update();
            if (rectOverlap(player.hitbox, pickup.hitbox)) {
                pickup.apply(player);
            }
        }

        // Update particles
        updateParticles();
        this.hud.update();

        // Check level completion
        const enemiesLeft = this.enemies.filter(e => e.alive).length;
        if (enemiesLeft === 0 && !this._levelCompleting) {
            this._levelCompleting = true;
            this.hud.showLevelComplete();
            SFX.levelUp();
            if (this.levelIndex >= this.maxLevels - 1) {
                setTimeout(() => {
                    this.state = GameState.WIN;
                    this.frame = 0;
                    this._levelCompleting = false;
                }, 3000);
            } else {
                setTimeout(() => {
                    this._levelCompleting = false;
                    this.startLevel(this.levelIndex + 1);
                }, 3000);
            }
        }
    },

    draw() {
        ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        switch (this.state) {
            case GameState.TITLE:
                Screens.drawTitle(ctx, this.frame);
                break;

            case GameState.LEVEL_INTRO:
                // Draw the level background behind the intro
                if (this.level) {
                    drawBackground(ctx, this.level.theme, 0, this.level.width);
                }
                Screens.drawLevelIntro(ctx, 120 - this.introTimer, this.level);
                break;

            case GameState.PLAYING:
            case GameState.PAUSED:
                this._drawPlaying();
                if (this.state === GameState.PAUSED) {
                    Screens.drawPause(ctx);
                }
                break;

            case GameState.GAME_OVER:
                Screens.drawGameOver(ctx, this.frame, this.player);
                break;

            case GameState.WIN:
                Screens.drawWin(ctx, this.frame, this.player);
                break;
        }
    },

    _drawPlaying() {
        const shake = this.hud.getShakeOffset();
        ctx.save();
        ctx.translate(shake.x, shake.y);

        // Background
        drawBackground(ctx, this.level.theme, this.camX, this.level.width);

        // Breakable objects
        for (const obj of this.objects) {
            if (obj.alive) obj.draw(ctx, this.camX);
        }

        // Pickups
        for (const pickup of this.pickups) {
            if (pickup.alive) pickup.draw(ctx, this.camX);
        }

        // Enemies (sorted by y for depth)
        const sortedEnemies = [...this.enemies].sort((a, b) => a.y - b.y);
        for (const enemy of sortedEnemies) {
            enemy.draw(ctx, this.camX);
        }

        // Player
        this.player.draw(ctx, this.camX);

        // Particles
        drawParticles(ctx, this.camX);

        ctx.restore();

        // HUD (not affected by shake)
        const enemiesLeft = this.enemies.filter(e => e.alive).length;
        this.hud.draw(ctx, this.player, this.level, this.timeLeft, enemiesLeft);
    },

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
};

// Loading animation
let loadProgress = 0;
const loadInterval = setInterval(() => {
    loadProgress += 5;
    const bar = document.getElementById('loading-bar');
    const text = document.getElementById('loading-text');
    if (bar) bar.style.width = loadProgress + '%';

    const messages = ['Loading sprites...', 'Building levels...', 'Initializing Omnitrix...',
                      'Calibrating aliens...', 'Ready!'];
    if (text) text.textContent = messages[Math.min(Math.floor(loadProgress / 25), messages.length - 1)];

    if (loadProgress >= 100) {
        clearInterval(loadInterval);
        setTimeout(() => Game.init(), 300);
    }
}, 50);
