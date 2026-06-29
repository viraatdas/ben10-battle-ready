(function (global) {
    "use strict";

    var CONFIG_URL = "assets/aliens/alien-force.json";
    var ROTATION_INTERVAL_MS = 340;
    var NATIVE_FORMS = [
        { id: "wildmutt", name: "Wildmutt", charId: 1, symbol: "#CHAR_WILDMUTT", color: "#f08b42" },
        { id: "four-arms", name: "Four Arms", charId: 2, symbol: "#CHAR_FOURARMS", color: "#ff584d" },
        { id: "heatblast", name: "Heatblast", charId: 3, symbol: "#CHAR_HEATBLAST", color: "#ff9b31" },
        { id: "xlr8", name: "XLR8", charId: 4, symbol: "#CHAR_XLR8", color: "#56c7ff" },
        { id: "ghostfreak", name: "Ghostfreak", charId: 5, symbol: "#CHAR_GHOSTFREAK", color: "#cfcfff" },
        { id: "ripjaws", name: "Ripjaws", charId: 6, symbol: "#CHAR_RIPJAW", color: "#5ecbff" },
        { id: "stinkfly", name: "Stinkfly", charId: 7, symbol: "#CHAR_STINKFLY", color: "#9fff47" },
        { id: "gray-matter", name: "Gray Matter", charId: 8, symbol: "#CHAR_GRAYMATTER", color: "#b8f7ff" },
        { id: "diamondhead", name: "Diamondhead", charId: 9, symbol: "#CHAR_DIAMONDHEAD", color: "#7fffea" },
        { id: "upgrade", name: "Upgrade", charId: 10, symbol: "#CHAR_UPGRADE", color: "#7fff4f" }
    ];
    var SNAPSHOT_EXPRESSION = [
        'string(game.player.visSprite.locH)',
        'string(game.player.visSprite.locV)',
        'string(game.player.visSprite.flipH)',
        'string(game.player.visSprite.blend)',
        'string(game.player.getCharID())',
        'string(game.player.getActionID())',
        'string(game.gameFrame)',
        'string(game.player.getPosX())',
        'string(game.player.getPosY())'
    ].join(' & "|" & ');

    var state = {
        definitions: [],
        roster: [],
        selectedIndex: 0,
        selectorOpen: false,
        activeAlien: null,
        activeNativeForm: null,
        pendingAlien: null,
        renderer: null,
        rendererHost: null,
        ui: null,
        ready: false,
        stopped: false,
        transitioning: false,
        generation: 0,
        pollInFlight: false,
        missedSnapshots: 0,
        lastPose: null,
        lastCharId: null,
        lastGameFrame: 0,
        lastNativeHideAt: 0,
        lastWatchActivateAt: 0,
        nativeWatchOpen: false,
        attackUntil: 0,
        attackCooldownUntil: 0,
        thaws: [],
        combatSerial: 0,
        swallowXUntilKeyUp: false,
        rotationTimer: null,
        timers: []
    };

    var evalTail = Promise.resolve();
    var audioContext = null;

    function delay(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function vmReady() {
        return global.__vm && typeof global.__vm.mcp_eval_lingo === "function";
    }

    function nativePopupOpen() {
        var vm = global.__vm;
        if (!vm || typeof vm.get_popup_char_id !== "function") return false;
        try { return Number(vm.get_popup_char_id()) > 0; } catch (_) { return false; }
    }

    function directorFrame() {
        var vm = global.__vm;
        if (!vm || typeof vm.mcp_get_context !== "function") return null;
        try {
            var frame = Number(JSON.parse(vm.mcp_get_context()).current_frame);
            return Number.isFinite(frame) ? frame : null;
        } catch (_) {
            return null;
        }
    }

    function directorGameplayOpen() {
        return directorFrame() === 285;
    }

    function canUseExpansion() {
        return state.ready && Boolean(state.lastPose) && !state.stopped &&
            !state.transitioning && !state.pendingAlien &&
            directorGameplayOpen() && !nativePopupOpen();
    }

    function parseMcpResult(text) {
        if (typeof text !== "string") return null;
        try {
            var result = JSON.parse(text);
            if (!result || result.success !== true) return null;
            var value = result.result_value;
            if (result.result_type === "string" && typeof value === "string") {
                try { value = JSON.parse(value); } catch (_) {}
            }
            return value;
        } catch (_) {
            return null;
        }
    }

    function evalLingo(expression) {
        var task = evalTail.then(async function () {
            if (!vmReady()) return null;
            try {
                var result = await global.__vm.mcp_eval_lingo(expression);
                return parseMcpResult(result);
            } catch (_) {
                return null;
            }
        });
        evalTail = task.catch(function () {});
        return task;
    }

    // Exposed so other small compatibility repairs can share a serialized,
    // non-reentrant path into the single WASM VM.
    global.__ben10EvalLingo = evalLingo;

    function setTimer(callback, ms) {
        var id = setTimeout(function () {
            state.timers = state.timers.filter(function (timer) { return timer !== id; });
            callback();
        }, ms);
        state.timers.push(id);
        return id;
    }

    function clearTimers() {
        state.timers.forEach(clearTimeout);
        state.timers.length = 0;
    }

    function normalizeToken(value) {
        return String(value == null ? "" : value).toUpperCase().replace(/[^A-Z0-9]/g, "");
    }

    function nativeFormMatches(actual, form) {
        if (!form || actual == null) return false;
        var normalized = normalizeToken(actual);
        if (!normalized) return false;
        var symbol = normalizeToken(form.symbol);
        var id = String(form.charId);
        return normalized === id || normalized.indexOf(symbol) !== -1 ||
            symbol.indexOf(normalized) !== -1;
    }

    function nativeFormForChar(actual) {
        for (var index = 0; index < NATIVE_FORMS.length; index += 1) {
            if (nativeFormMatches(actual, NATIVE_FORMS[index])) {
                return NATIVE_FORMS[index];
            }
        }
        return null;
    }

    function customById(id) {
        return state.definitions.find(function (definition) {
            return definition.id === id;
        }) || null;
    }

    function buildRoster(definitions) {
        var bigChill = customById("big-chill");
        var humungousaur = customById("humungousaur");
        var echoEcho = customById("echo-echo");
        var roster = [];

        NATIVE_FORMS.forEach(function (form) {
            roster.push(Object.assign({ custom: false }, form));
            if (form.id === "four-arms" && humungousaur) {
                roster.push(Object.assign({ custom: true }, humungousaur));
            } else if (form.id === "ghostfreak" && bigChill) {
                roster.push(Object.assign({ custom: true }, bigChill));
            } else if (form.id === "gray-matter" && echoEcho) {
                roster.push(Object.assign({ custom: true }, echoEcho));
            }
        });

        return roster.length ? roster : definitions.map(function (definition) {
            return Object.assign({ custom: true }, definition);
        });
    }

    function carrierMatches(actual, definition) {
        if (!definition || actual == null) return false;
        var normalized = normalizeToken(actual);
        var carrier = normalizeToken(definition.carrier);
        var carrierId = String(definition.carrierId || "");
        if (!normalized || !carrier) return false;
        return normalized === carrierId ||
            normalized.indexOf(carrier) !== -1 ||
            carrier.indexOf(normalized) !== -1;
    }

    function isBen(actual) {
        if (actual == null) return false;
        var normalized = normalizeToken(actual);
        return normalized === "CHARBEN" || normalized === "BEN" || normalized === "1";
    }

    function readCharId() {
        return evalLingo("string(game.player.getCharID())");
    }

    async function setNativeSpriteVisible(visible, confirm) {
        var expected = visible ? 1 : 0;
        await evalLingo("game.player.visSprite.visible = " + expected);
        if (confirm === false) return true;
        var actual = Number(await evalLingo("game.player.visSprite.visible"));
        return Number.isFinite(actual) && actual === expected;
    }

    function triggerNativeWatchActivation() {
        var now = Date.now();
        if (now - state.lastWatchActivateAt < 220) return false;
        state.lastWatchActivateAt = now;

        var vm = global.__vm;
        if (!vm || typeof vm.force_omnitrix_activate !== "function") return false;
        try {
            vm.force_omnitrix_activate();
            state.nativeWatchOpen = true;
            return true;
        } catch (_) {
            return false;
        }
    }

    async function retryNativeRestore(generation) {
        if (state.stopped || generation !== state.generation) return;
        var restored = await setNativeSpriteVisible(true);
        if (state.stopped || generation !== state.generation) return;
        if (!restored) {
            setTimer(function () { retryNativeRestore(generation); }, 200);
            return;
        }
        if (state.renderer) state.renderer.clear();
        state.transitioning = false;
        updateUi();
    }

    async function waitForCarrier(definition, generation, timeoutMs) {
        var deadline = Date.now() + timeoutMs;
        while (!state.stopped && generation === state.generation && Date.now() < deadline) {
            var current = await readCharId();
            if (carrierMatches(current, definition)) return true;
            await delay(90);
        }
        return false;
    }

    async function waitForNativeForm(form, generation, timeoutMs) {
        var deadline = Date.now() + timeoutMs;
        while (!state.stopped && generation === state.generation && Date.now() < deadline) {
            var current = await readCharId();
            if (nativeFormMatches(current, form)) return true;
            await delay(90);
        }
        return false;
    }

    async function fallbackMorph(definition, generation) {
        await evalLingo("game.transformPlayerToID = " + definition.carrier);
        return waitForCarrier(definition, generation, 900);
    }

    async function transformTo(definition) {
        var ownWatchPopup = state.nativeWatchOpen;
        if (!definition || !state.ready || !state.lastPose ||
                state.transitioning || state.pendingAlien || state.stopped ||
                !directorGameplayOpen() || (!ownWatchPopup && nativePopupOpen())) {
            if (ownWatchPopup) state.nativeWatchOpen = false;
            return false;
        }

        var shouldThaw = Boolean(state.activeAlien || state.thaws.length);
        var generation = ++state.generation;
        state.nativeWatchOpen = false;
        state.transitioning = true;
        state.pendingAlien = definition;
        state.activeAlien = null;
        state.activeNativeForm = null;
        state.attackUntil = 0;
        state.attackCooldownUntil = 0;
        closeSelector();
        updateUi();
        state.nativeWatchOpen = false;
        playTransformSound();

        if (shouldThaw) await thawEnemies();
        if (generation !== state.generation || state.stopped) return;
        await setNativeSpriteVisible(true);
        if (generation !== state.generation || state.stopped) return;

        ensureRenderer();
        var rendererReady = Boolean(
            state.renderer &&
            typeof state.renderer.readyFor === "function" &&
            await state.renderer.readyFor(definition.id)
        );
        if (generation !== state.generation || state.stopped) return;
        if (!rendererReady) {
            state.pendingAlien = null;
            state.transitioning = false;
            if (state.renderer) state.renderer.clear();
            await setNativeSpriteVisible(true);
            if (generation !== state.generation || state.stopped) return;
            showToast("SPRITE UNAVAILABLE", "#ff765f");
            updateUi();
            return false;
        }

        if (state.renderer) {
            state.renderer.clear();
            if (state.lastPose) {
                state.renderer.updatePose({
                    x: state.lastPose.x,
                    y: state.lastPose.y,
                    flipH: state.lastPose.flipH,
                    blend: state.lastPose.blend,
                    moving: false,
                    attacking: false,
                    alienId: definition.id,
                    phase: state.lastPose.blend < 0.85 ? 1 : 0
                });
                state.renderer.playEffect("transform", state.lastPose, state.lastPose.flipH ? -1 : 1);
            }
        }

        // Hide the native carrier before the Director morph starts. Otherwise
        // Big Chill visibly becomes Ghostfreak, Humungousaur becomes Four Arms,
        // and Echo Echo becomes Gray Matter during the transition.
        await delay(34);
        if (generation !== state.generation || state.stopped) return;
        await setNativeSpriteVisible(false, false);
        state.lastNativeHideAt = Date.now();
        if (generation !== state.generation || state.stopped) return;

        await evalLingo("game.transformPlayerToID = " + definition.carrier);
        if (generation !== state.generation || state.stopped) return;
        var transformed = await waitForCarrier(definition, generation, 1700);
        if (!transformed) transformed = await fallbackMorph(definition, generation);

        if (generation !== state.generation || state.stopped) return;
        if (!transformed) {
            state.pendingAlien = null;
            state.transitioning = false;
            await setNativeSpriteVisible(true);
            if (state.renderer) state.renderer.clear();
            if (generation !== state.generation || state.stopped) return;
            showToast("TRANSFORMATION UNAVAILABLE", "#ff765f");
            updateUi();
            return false;
        }

        // Let the native state settle while the replacement sprite stays visible.
        // Physics, damage, camera and mission state stay native.
        await delay(1350);
        if (generation !== state.generation || state.stopped) return;
        var currentCharacter = await readCharId();
        if (generation !== state.generation || state.stopped) return;
        if (!directorGameplayOpen() || !carrierMatches(currentCharacter, definition)) {
            state.pendingAlien = null;
            state.transitioning = false;
            if (state.renderer) state.renderer.clear();
            await setNativeSpriteVisible(true);
            if (generation !== state.generation || state.stopped) return;
            showToast("TRANSFORMATION INTERRUPTED", "#ff765f");
            updateUi();
            return false;
        }

        await setNativeSpriteVisible(false, false);
        state.lastNativeHideAt = Date.now();
        if (generation !== state.generation || state.stopped) return;
        if (state.renderer && state.lastPose) {
            state.renderer.updatePose({
                x: state.lastPose.x,
                y: state.lastPose.y,
                flipH: state.lastPose.flipH,
                blend: state.lastPose.blend,
                moving: false,
                attacking: false,
                alienId: definition.id,
                phase: state.lastPose.blend < 0.85 ? 1 : 0
            });
        }

        state.activeAlien = definition;
        state.pendingAlien = null;
        state.transitioning = false;
        state.missedSnapshots = 0;
        updateUi();
        return true;
    }

    async function enemyCount() {
        var count = Number(await evalLingo("count(game.getEnemies())"));
        return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }

    function enemyAt(index) {
        return "game.getEnemies()[" + index + "]";
    }

    async function thawTargets(targets) {
        for (var index = 0; index < targets.length; index += 1) {
            var reference = targets[index].reference;
            await evalLingo(reference + ".setFrozen(0)");
            await evalLingo(reference + " = VOID");
        }
    }

    async function thawEnemies() {
        // Only release targets frozen by this extension. Thawing the full
        // native enemy list would incorrectly cancel freezes from game logic.
        var targets = state.thaws.splice(0, state.thaws.length);
        await thawTargets(targets);
    }

    async function deactivateCustomForm(reason) {
        if (!state.activeAlien && !state.pendingAlien) return;

        var generation = ++state.generation;
        state.transitioning = true;
        state.activeAlien = null;
        state.activeNativeForm = null;
        state.pendingAlien = null;
        state.attackUntil = 0;
        state.attackCooldownUntil = 0;
        closeSelector();
        var restored = await setNativeSpriteVisible(true);
        if (restored && state.renderer) state.renderer.clear();
        await thawEnemies();
        if (reason) showToast(reason, "#aaff86");
        if (generation === state.generation && !state.stopped) {
            if (restored) {
                state.transitioning = false;
            } else {
                setTimer(function () { retryNativeRestore(generation); }, 200);
            }
        }
        updateUi();
        return generation;
    }

    async function revertToBen() {
        if (!state.activeAlien && !state.pendingAlien && !state.activeNativeForm) return;

        var generation;
        if (state.activeAlien || state.pendingAlien) {
            generation = await deactivateCustomForm("");
        } else {
            generation = ++state.generation;
            state.transitioning = true;
            state.activeNativeForm = null;
            state.attackUntil = 0;
            state.attackCooldownUntil = 0;
            closeSelector();
            await setNativeSpriteVisible(true);
            if (state.renderer) state.renderer.clear();
        }

        if (generation === state.generation && !state.stopped) {
            await evalLingo("game.transformPlayerToID = #CHAR_BEN");
            state.activeNativeForm = null;
            state.transitioning = false;
            updateUi();
        }
    }

    async function transformNative(form) {
        var ownWatchPopup = state.nativeWatchOpen;
        if (!form || !state.ready || !state.lastPose ||
                state.transitioning || state.pendingAlien || state.stopped ||
                !directorGameplayOpen() || (!ownWatchPopup && nativePopupOpen())) {
            if (ownWatchPopup) state.nativeWatchOpen = false;
            return false;
        }

        var generation = ++state.generation;
        state.nativeWatchOpen = false;
        state.transitioning = true;
        state.activeAlien = null;
        state.activeNativeForm = null;
        state.pendingAlien = null;
        state.attackUntil = 0;
        state.attackCooldownUntil = 0;
        closeSelector();
        updateUi();
        state.nativeWatchOpen = false;
        playTransformSound();

        await thawEnemies();
        if (generation !== state.generation || state.stopped) return false;
        await setNativeSpriteVisible(true);
        if (generation !== state.generation || state.stopped) return false;
        if (state.renderer) {
            state.renderer.clear();
            if (state.lastPose) {
                state.renderer.playEffect("transform", state.lastPose, state.lastPose.flipH ? -1 : 1);
            }
        }

        await evalLingo("game.transformPlayerToID = " + form.symbol);
        var transformed = await waitForNativeForm(form, generation, 1200);
        if (generation !== state.generation || state.stopped) return false;

        if (!transformed) {
            state.transitioning = false;
            showToast("TRANSFORMATION UNAVAILABLE", "#ff765f");
            updateUi();
            return false;
        }

        state.transitioning = false;
        state.activeNativeForm = form;
        updateUi();
        return transformed;
    }

    function transformRosterForm(form) {
        if (!form) return Promise.resolve(false);
        return form.custom ? transformTo(form) : transformNative(form);
    }

    async function readCombatTarget(target) {
        var expression = [
            "string(" + target + ".getPosX())",
            "string(" + target + ".getPosY())",
            "string(" + target + ".isAttackable())",
            "string(game.scene.lineOfSight(game.player.getPos(), " + target + ".getPos()))",
            "string(game.player.getPosX())",
            "string(game.player.getPosY())",
            "string(game.player.getDir())"
        ].join(' & "|" & ');
        var value = await evalLingo(expression);
        if (typeof value !== "string") return null;

        var parts = value.split("|").map(Number);
        if (parts.length !== 7 || !parts.every(Number.isFinite)) return null;
        return {
            x: parts[0],
            y: parts[1],
            attackable: parts[2] !== 0,
            lineOfSight: parts[3] !== 0,
            playerX: parts[4],
            playerY: parts[5],
            direction: Math.sign(parts[6]) || 1
        };
    }

    function inForwardWave(target, maxDistance, maxHeight) {
        if (!target || !target.attackable || !target.lineOfSight) return false;
        var dx = target.x - target.playerX;
        var dy = target.y - target.playerY;
        return Math.sign(dx) === target.direction &&
            dx * dx <= maxDistance * maxDistance &&
            Math.abs(dy) <= maxHeight;
    }

    function inSlamRadius(target, maxDistance, maxHeight) {
        if (!target || !target.attackable) return false;
        return Math.abs(target.x - target.playerX) <= maxDistance &&
            Math.abs(target.y - target.playerY) <= maxHeight;
    }

    async function applyAttack(definition) {
        var generation = state.generation;
        var count = await enemyCount();
        if (generation !== state.generation || state.stopped) return;

        // Lists in Director are one-based. Iterate backwards because damage
        // can remove an enemy from game.getEnemies() immediately.
        for (var index = count; index >= 1; index -= 1) {
            var reference = "afCombatTarget" + (++state.combatSerial);
            var pinned = await evalLingo(reference + " = " + enemyAt(index));
            if (pinned == null) continue;
            if (generation !== state.generation || state.stopped) {
                await evalLingo(reference + " = VOID");
                return;
            }

            var target = await readCombatTarget(reference);
            if (generation !== state.generation || state.stopped) {
                await evalLingo(reference + " = VOID");
                return;
            }
            var isHumungousaur = definition.id === "humungousaur";
            var isBigChill = definition.id === "big-chill";
            var isInRange = isHumungousaur
                ? inSlamRadius(target, 150, 90)
                : isBigChill
                ? inForwardWave(target, 250, 50)
                : inForwardWave(target, 220, 70);
            if (!isInRange) {
                await evalLingo(reference + " = VOID");
                continue;
            }

            var damageResult = Number(await evalLingo(
                reference + ".takeDamage(game.player, " +
                (isHumungousaur ? "35" : isBigChill ? "25" : "20") + ")"
            ));
            if (generation !== state.generation || state.stopped) {
                await evalLingo(reference + " = VOID");
                return;
            }
            if (!Number.isFinite(damageResult) || damageResult === 0) {
                await evalLingo(reference + " = VOID");
                continue;
            }

            if (isHumungousaur) {
                await evalLingo(
                    reference + ".moveBy(point(game.player.getDir() * 46.0, -5.0))"
                );
                await evalLingo(reference + " = VOID");
                if (generation !== state.generation || state.stopped) return;
                continue;
            }

            if (!isBigChill) {
                await evalLingo(
                    reference + ".moveBy(point(game.player.getDir() * 20.0, 0.0))"
                );
                if (generation !== state.generation || state.stopped) {
                    await evalLingo(reference + " = VOID");
                    return;
                }
            }
            await evalLingo(reference + ".setFrozen(1)");
            var thaw = { reference: reference, dueFrame: Infinity };
            state.thaws.push(thaw);
            if (generation !== state.generation || state.stopped) {
                var thawIndex = state.thaws.indexOf(thaw);
                if (thawIndex !== -1) {
                    state.thaws.splice(thawIndex, 1);
                    await thawTargets([thaw]);
                }
                return;
            }
            var frozenAt = Number(await evalLingo("game.gameFrame"));
            if (!Number.isFinite(frozenAt)) frozenAt = state.lastGameFrame;
            thaw.dueFrame = frozenAt + (isBigChill ? 45 : 8);
            if (generation !== state.generation || state.stopped) return;
        }
    }

    async function performAttack() {
        var definition = state.activeAlien;
        var now = Date.now();
        if (!definition || !canUseExpansion() || now < state.attackCooldownUntil) return;

        var attack = definition.attack || {};
        state.attackUntil = now + Number(attack.durationMs || 500);
        state.attackCooldownUntil = now + Number(attack.cooldownMs || 800);

        var pose = state.lastPose || { x: 300, y: 250, flipH: false };
        if (state.renderer) {
            var effectOrigin = attack.type === "slam" ? pose : { x: pose.x };
            state.renderer.playEffect(
                attack.type || definition.id,
                effectOrigin,
                pose.flipH ? -1 : 1
            );
        }
        playAttackSound(attack.type);

        await applyAttack(definition);
    }

    function getAudioContext() {
        if (!audioContext) {
            audioContext = typeof global.getAudioContext === "function"
                ? global.getAudioContext()
                : new (global.AudioContext || global.webkitAudioContext)();
        }
        if (audioContext && audioContext.state === "suspended") audioContext.resume();
        return audioContext;
    }

    function playTransformSound() {
        try {
            var context = getAudioContext();
            if (!context) return;

            var now = context.currentTime;
            var gain = context.createGain();
            var low = context.createOscillator();
            var high = context.createOscillator();

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.075, now + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

            low.type = "sawtooth";
            low.frequency.setValueAtTime(96, now);
            low.frequency.exponentialRampToValueAtTime(168, now + 0.48);

            high.type = "triangle";
            high.frequency.setValueAtTime(520, now + 0.04);
            high.frequency.exponentialRampToValueAtTime(940, now + 0.48);

            low.connect(gain);
            high.connect(gain);
            gain.connect(context.destination);

            low.start(now);
            high.start(now + 0.04);
            low.stop(now + 0.64);
            high.stop(now + 0.58);
        } catch (_) {}
    }

    function playAttackSound(type) {
        try {
            var context = getAudioContext();
            if (!context) return;

            var now = context.currentTime;
            var gain = context.createGain();
            var oscillator = context.createOscillator();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
            oscillator.connect(gain);
            gain.connect(context.destination);

            if (type === "sonic") {
                oscillator.type = "square";
                oscillator.frequency.setValueAtTime(180, now);
                oscillator.frequency.linearRampToValueAtTime(310, now + 0.35);
            } else if (type === "slam") {
                oscillator.type = "sine";
                oscillator.frequency.setValueAtTime(82, now);
                oscillator.frequency.exponentialRampToValueAtTime(34, now + 0.38);
            } else {
                oscillator.type = "triangle";
                oscillator.frequency.setValueAtTime(340, now);
                oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.4);
            }
            oscillator.start(now);
            oscillator.stop(now + 0.44);
        } catch (_) {}
    }

    function parseSnapshot(value) {
        if (typeof value !== "string") return null;
        var parts = value.split("|");
        if (parts.length < 9) return null;
        var x = Number(parts[0]);
        var y = Number(parts[1]);
        var nativeBlend = Number(parts[3]);
        var gameFrame = Number(parts[6]);
        var worldX = Number(parts[7]);
        var worldY = Number(parts[8]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return {
            x: x,
            y: y,
            flipH: Number(parts[2]) === 1,
            blend: Number.isFinite(nativeBlend)
                ? Math.max(0, Math.min(1, nativeBlend / 100))
                : 1,
            charId: parts[4],
            actionId: parts[5],
            gameFrame: Number.isFinite(gameFrame) ? gameFrame : state.lastGameFrame,
            worldX: Number.isFinite(worldX) ? worldX : x,
            worldY: Number.isFinite(worldY) ? worldY : y
        };
    }

    async function pollState() {
        if (state.stopped) return;
        ensureRenderer();

        if (state.pollInFlight || !vmReady()) {
            setTimer(pollState, state.activeAlien ? 80 : 500);
            return;
        }

        state.pollInFlight = true;
        var snapshot = parseSnapshot(await evalLingo(SNAPSHOT_EXPRESSION));
        state.pollInFlight = false;

        if (!snapshot) {
            state.missedSnapshots++;
            state.ready = false;
            var frame = directorFrame();
            if (state.activeAlien && frame != null && frame !== 285) {
                await deactivateCustomForm("");
            }
            // Keep the last known replacement frame while the VM bridge is
            // unavailable. Clearing it while the native carrier is hidden
            // would make a transient outage look like a permanent disappearance.
        } else {
            state.missedSnapshots = 0;
            state.ready = snapshot.x !== 0 || snapshot.y !== 0;
            state.lastCharId = snapshot.charId;
            state.lastGameFrame = snapshot.gameFrame;

            var previous = state.lastPose;
            var moving = Boolean(previous && (
                Math.abs(snapshot.worldX - previous.worldX) > 0.25 ||
                Math.abs(snapshot.worldY - previous.worldY) > 0.25
            ));
            state.lastPose = {
                x: snapshot.x,
                y: snapshot.y,
                flipH: snapshot.flipH,
                blend: snapshot.blend,
                moving: moving,
                worldX: snapshot.worldX,
                worldY: snapshot.worldY
            };

            if (state.activeAlien && !directorGameplayOpen()) {
                await deactivateCustomForm("");
            } else if (state.activeAlien && !carrierMatches(snapshot.charId, state.activeAlien)) {
                await deactivateCustomForm("");
            } else if (state.activeAlien && state.renderer) {
                if (Date.now() - state.lastNativeHideAt > 250) {
                    await setNativeSpriteVisible(false, false);
                    state.lastNativeHideAt = Date.now();
                    if (state.stopped) return;
                    if (!state.activeAlien) {
                        updateUi();
                        setTimer(pollState, 500);
                        return;
                    }
                }
                state.renderer.updatePose({
                    x: snapshot.x,
                    y: snapshot.y,
                    flipH: snapshot.flipH,
                    blend: snapshot.blend,
                    moving: moving,
                    attacking: Date.now() < state.attackUntil,
                    alienId: state.activeAlien.id,
                    phase: snapshot.blend < 0.85 ? 1 : 0
                });
            } else if (!state.pendingAlien && !state.transitioning) {
                state.activeNativeForm = isBen(snapshot.charId)
                    ? null
                    : nativeFormForChar(snapshot.charId);
            }

            if (state.thaws.length) {
                var due = state.thaws.filter(function (target) {
                    return snapshot.gameFrame >= target.dueFrame;
                });
                if (due.length) {
                    state.thaws = state.thaws.filter(function (target) {
                        return snapshot.gameFrame < target.dueFrame;
                    });
                    await thawTargets(due);
                }
            }
        }

        updateUi();
        setTimer(pollState, state.activeAlien ? 80 : 500);
    }

    function ensureRenderer() {
        var host = global.document && global.document.querySelector("#stage_canvas_container");
        if (!host) return;
        if (state.renderer && state.rendererHost === host && host.isConnected) return;

        if (state.renderer) state.renderer.destroy();
        state.rendererHost = host;
        state.renderer = typeof global.AlienForceRenderer === "function"
            ? new global.AlienForceRenderer(host, state.definitions)
            : null;
        if (state.renderer && state.activeAlien && state.lastPose) {
            recoverRendererSwap(
                state.renderer,
                state.activeAlien,
                state.lastPose,
                state.generation
            );
        }
    }

    async function recoverRendererSwap(renderer, definition, pose, generation) {
        await setNativeSpriteVisible(true);
        var ready = await renderer.readyFor(definition.id);
        if (!ready || state.stopped || generation !== state.generation ||
                renderer !== state.renderer || state.activeAlien !== definition) return;
        renderer.updatePose({
            x: pose.x,
            y: pose.y,
            flipH: pose.flipH,
            blend: pose.blend,
            moving: false,
            attacking: false,
            alienId: definition.id,
            phase: pose.blend < 0.85 ? 1 : 0
        });
        await delay(34);
        if (state.stopped || generation !== state.generation ||
                renderer !== state.renderer || state.activeAlien !== definition) return;
        await setNativeSpriteVisible(false, false);
    }

    function buildUi() {
        var container = global.document && global.document.querySelector("#game-container");
        if (!container || state.ui) return;

        var root = global.document.createElement("div");
        root.className = "alien-force-ui";
        root.setAttribute("data-alien-force-ui", "true");

        var selector = global.document.createElement("section");
        selector.id = "alien-force-selector";
        selector.className = "alien-force-selector";
        selector.setAttribute("role", "status");
        selector.setAttribute("aria-labelledby", "alien-force-title");
        selector.hidden = true;

        var title = global.document.createElement("h2");
        title.id = "alien-force-title";
        title.textContent = "OMNITRIX";
        selector.appendChild(title);

        var rotation = global.document.createElement("div");
        rotation.className = "alien-force-rotation";
        var slotElements = [];
        ["previous", "current", "next"].forEach(function (slotName) {
            var slot = global.document.createElement("div");
            slot.className = "alien-force-slot alien-force-slot--" + slotName;
            slot.setAttribute("aria-hidden", slotName === "current" ? "false" : "true");
            rotation.appendChild(slot);
            slotElements.push(slot);
        });
        selector.appendChild(rotation);

        var toast = global.document.createElement("div");
        toast.className = "alien-force-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.hidden = true;

        root.appendChild(selector);
        root.appendChild(toast);
        container.appendChild(root);

        state.ui = {
            root: root,
            selector: selector,
            slots: slotElements,
            toast: toast,
            toastTimer: null
        };
        updateUi();
    }

    function clearRotationTimer() {
        if (!state.rotationTimer) return;
        clearInterval(state.rotationTimer);
        state.rotationTimer = null;
    }

    function advanceSelection(direction) {
        if (!state.roster.length) return;
        state.selectedIndex = (
            state.selectedIndex + direction + state.roster.length
        ) % state.roster.length;
        updateUi();
    }

    function openSelector() {
        if (!state.ui || !state.roster.length || !canUseExpansion() ||
                state.activeAlien || state.pendingAlien || state.activeNativeForm ||
                !isBen(state.lastCharId)) {
            showToast(
                nativePopupOpen() ? "CLOSE THE MISSION PROMPT FIRST" : "ENTER A PLAYABLE AREA FIRST",
                "#ffdf66"
            );
            return;
        }
        state.selectorOpen = true;
        triggerNativeWatchActivation();
        clearRotationTimer();
        state.rotationTimer = setInterval(function () {
            advanceSelection(1);
        }, ROTATION_INTERVAL_MS);
        updateUi();
    }

    function focusStage() {
        var container = global.document && global.document.querySelector("#game-container");
        if (!container) return;
        var stage = container.querySelector('[tabindex="0"]');
        if (stage && typeof stage.focus === "function") {
            try { stage.focus({ preventScroll: true }); } catch (_) { stage.focus(); }
        }
    }

    function closeSelector(keepNativeWatch) {
        state.selectorOpen = false;
        if (!keepNativeWatch) state.nativeWatchOpen = false;
        clearRotationTimer();
        updateUi();
        focusStage();
    }

    function toggleSelector() {
        if (state.selectorOpen) closeSelector();
        else openSelector();
    }

    function commitSelection() {
        if (!state.selectorOpen) return;
        var selected = state.roster[state.selectedIndex];
        closeSelector(true);
        transformRosterForm(selected);
    }

    function updateUi() {
        if (!state.ui) return;
        state.ui.selector.hidden = true;
        if (!state.ui.slots || !state.roster.length) return;

        var length = state.roster.length;
        var previous = state.roster[(state.selectedIndex - 1 + length) % length];
        var current = state.roster[state.selectedIndex % length];
        var next = state.roster[(state.selectedIndex + 1) % length];
        [previous, current, next].forEach(function (form, index) {
            var slot = state.ui.slots[index];
            slot.textContent = form ? form.name.toUpperCase() : "";
            slot.style.setProperty("--alien-color", form && form.color ? form.color : "#7fff61");
        });
    }

    function showToast(message, color) {
        if (!state.ui || !message) return;
        var toast = state.ui.toast;
        toast.textContent = message;
        toast.style.setProperty("--alien-color", color || "#8cff72");
        toast.hidden = false;
        if (state.ui.toastTimer) clearTimeout(state.ui.toastTimer);
        state.ui.toastTimer = setTimeout(function () {
            toast.hidden = true;
            state.ui.toastTimer = null;
        }, 1500);
    }

    function consumeEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }
    }

    function onKeyDown(event) {
        if (event.code === "KeyX") {
            consumeEvent(event);
            state.swallowXUntilKeyUp = true;
            if (event.repeat) return;

            var nativeCurrent = state.activeNativeForm || nativeFormForChar(state.lastCharId);
            if (state.pendingAlien || state.transitioning) return;
            if (state.activeAlien || nativeCurrent) {
                revertToBen();
                return;
            }

            openSelector();
            return;
        }

        if (event.repeat && event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;

        if (state.selectorOpen) {
            if (event.code === "Escape") {
                consumeEvent(event);
                closeSelector();
                return;
            }
            if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
                consumeEvent(event);
                var direction = event.code === "ArrowLeft" ? -1 : 1;
                advanceSelection(direction);
                return;
            }
            if (event.code === "Space" || event.code === "Enter") {
                consumeEvent(event);
                commitSelection();
                return;
            }
            if (/^Arrow/.test(event.code)) consumeEvent(event);
            return;
        }

        if (state.activeAlien && event.code === "Space" && canUseExpansion()) {
            consumeEvent(event);
            performAttack();
            return;
        }
    }

    function onKeyUp(event) {
        if (state.swallowXUntilKeyUp && event.code === "KeyX") {
            consumeEvent(event);
            if (state.selectorOpen) commitSelection();
            state.swallowXUntilKeyUp = false;
        }
    }

    async function loadDefinitions() {
        var response = await fetch(CONFIG_URL, { credentials: "same-origin" });
        if (!response.ok) throw new Error("Alien configuration failed to load");
        var data = await response.json();
        if (!data || !Array.isArray(data.aliens) || data.aliens.length !== 3) {
            throw new Error("Alien configuration is invalid");
        }
        return data.aliens;
    }

    async function boot() {
        try {
            state.definitions = await loadDefinitions();
            state.roster = buildRoster(state.definitions);
            if (state.stopped) return;
            buildUi();
            global.addEventListener("keydown", onKeyDown, true);
            global.addEventListener("keyup", onKeyUp, true);
            while (!state.stopped && !vmReady()) await delay(100);
            if (state.stopped) return;
            ensureRenderer();
            pollState();
        } catch (error) {
            console.warn("[Alien Force] Extension disabled:", error);
        }
    }

    async function stop() {
        if (state.stopped) return;
        state.stopped = true;
        ++state.generation;
        state.transitioning = true;
        state.activeAlien = null;
        state.activeNativeForm = null;
        state.pendingAlien = null;
        state.selectorOpen = false;
        clearRotationTimer();
        clearTimers();
        global.removeEventListener("keydown", onKeyDown, true);
        global.removeEventListener("keyup", onKeyUp, true);
        if (state.ui && state.ui.toastTimer) clearTimeout(state.ui.toastTimer);
        var restored = await setNativeSpriteVisible(true);
        if (restored && state.renderer) state.renderer.destroy();
        if (state.ui && state.ui.root.parentNode) state.ui.root.parentNode.removeChild(state.ui.root);
        await thawEnemies();
    }

    global.Ben10AlienForce = {
        open: openSelector,
        close: closeSelector,
        select: function (id) {
            var definition = state.definitions.find(function (alien) { return alien.id === id; });
            return definition ? transformTo(definition) : Promise.resolve(false);
        },
        attack: performAttack,
        deactivate: revertToBen,
        getState: function () {
            return {
                ready: state.ready,
                selectorOpen: state.selectorOpen,
                selectedIndex: state.selectedIndex,
                activeAlien: state.activeAlien ? state.activeAlien.id : null,
                activeNativeForm: state.activeNativeForm ? state.activeNativeForm.id : null,
                pendingAlien: state.pendingAlien ? state.pendingAlien.id : null,
                pose: state.lastPose ? Object.assign({}, state.lastPose) : null
            };
        },
        stop: stop
    };

    if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})(window);
