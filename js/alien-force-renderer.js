(function (global) {
    "use strict";

    var STAGE_WIDTH = 600;
    var STAGE_HEIGHT = 400;
    var TAU = Math.PI * 2;

    function isFiniteNumber(value) {
        return typeof value === "number" && Number.isFinite(value);
    }

    function finiteOr(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function positiveOr(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function canonicalId(value) {
        return String(value == null ? "" : value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }

    function normalizeRect(value) {
        if (!value) return null;

        var x;
        var y;
        var width;
        var height;

        if (Array.isArray(value)) {
            if (value.length < 4) return null;
            x = finiteOr(value[0], NaN);
            y = finiteOr(value[1], NaN);
            width = finiteOr(value[2], NaN);
            height = finiteOr(value[3], NaN);
        } else if (typeof value === "object") {
            x = finiteOr(value.x != null ? value.x : value.sx, NaN);
            y = finiteOr(value.y != null ? value.y : value.sy, NaN);
            width = finiteOr(
                value.w != null ? value.w :
                    value.width != null ? value.width : value.sw,
                NaN
            );
            height = finiteOr(
                value.h != null ? value.h :
                    value.height != null ? value.height : value.sh,
                NaN
            );

            if (!Number.isFinite(width) && Number.isFinite(Number(value.right))) {
                width = Number(value.right) - x;
            }
            if (!Number.isFinite(height) && Number.isFinite(Number(value.bottom))) {
                height = Number(value.bottom) - y;
            }
        }

        if (![x, y, width, height].every(Number.isFinite)) return null;
        if (width <= 0 || height <= 0) return null;

        return { x: x, y: y, w: width, h: height };
    }

    function normalizeFrameSet(value) {
        if (!value) return [];

        if (value.frames != null) return normalizeFrameSet(value.frames);

        if (Array.isArray(value)) {
            var singleRect = normalizeRect(value);
            if (singleRect && value.length === 4 && value.every(function (part) {
                return Number.isFinite(Number(part));
            })) {
                return [singleRect];
            }

            return value.map(normalizeRect).filter(Boolean);
        }

        var rect = normalizeRect(value);
        return rect ? [rect] : [];
    }

    function normalizeHover(value) {
        if (!value) return { lift: 0, amplitude: 0, speed: 0 };

        if (value === true) {
            return { lift: 4, amplitude: 2, speed: 0.0045 };
        }

        if (Number.isFinite(Number(value))) {
            var lift = Number(value);
            return {
                lift: lift,
                amplitude: Math.min(3, Math.abs(lift) * 0.25),
                speed: 0.0045
            };
        }

        if (typeof value === "object") {
            return {
                lift: finiteOr(value.lift != null ? value.lift : value.offset, 0),
                amplitude: Math.max(0, finiteOr(
                    value.amplitude != null ? value.amplitude : value.amount,
                    2
                )),
                speed: Math.max(0, finiteOr(value.speed, 0.0045))
            };
        }

        return { lift: 0, amplitude: 0, speed: 0 };
    }

    function definitionEntries(definitions) {
        if (!definitions) return [];

        if (definitions.aliens && Array.isArray(definitions.aliens)) {
            return definitionEntries(definitions.aliens);
        }

        if (typeof Map !== "undefined" && definitions instanceof Map) {
            return Array.from(definitions.entries());
        }

        if (Array.isArray(definitions)) {
            return definitions.map(function (definition, index) {
                var id = definition && (
                    definition.id != null ? definition.id : definition.alienId
                );
                return [id != null ? id : index, definition];
            });
        }

        if (typeof definitions === "object") {
            return Object.keys(definitions).map(function (key) {
                return [key, definitions[key]];
            });
        }

        return [];
    }

    function resolveHost(host, documentObject) {
        if (!host) return null;

        if (typeof host === "string") {
            try {
                return documentObject ? documentObject.querySelector(host) : null;
            } catch (_) {
                return null;
            }
        }

        if (host.nodeType === 1) {
            if (host.id === "stage_canvas_container") return host;

            if (typeof host.querySelector === "function") {
                var stage = host.querySelector("#stage_canvas_container");
                if (stage) return stage;
            }

            return host;
        }

        if (typeof host.querySelector === "function") {
            return host.querySelector("#stage_canvas_container");
        }

        return null;
    }

    function normalizeFacing(value, pose) {
        if (typeof value === "string") {
            var direction = value.toLowerCase();
            if (direction === "left" || direction === "west" || direction === "backward") {
                return -1;
            }
            if (direction === "right" || direction === "east" || direction === "forward") {
                return 1;
            }
        }

        if (Number.isFinite(Number(value)) && Number(value) !== 0) {
            return Number(value) < 0 ? -1 : 1;
        }

        return pose && pose.flipH ? -1 : 1;
    }

    class AlienForceRenderer {
        constructor(host, alienDefinitions) {
            this.canvas = null;
            this.context = null;
            this.host = null;
            this.pose = null;
            this.effects = [];
            this.destroyed = false;
            this._frameHandle = null;
            this._definitions = new Map();
            this._firstDefinition = null;
            this._tick = this._tick.bind(this);

            var fallbackDocument = global && global.document ? global.document : null;
            this.host = resolveHost(host, fallbackDocument);
            this._document = this.host && this.host.ownerDocument
                ? this.host.ownerDocument
                : fallbackDocument;
            this._window = this._document && this._document.defaultView
                ? this._document.defaultView
                : global;
            this._reducedMotion = Boolean(
                this._window &&
                typeof this._window.matchMedia === "function" &&
                this._window.matchMedia("(prefers-reduced-motion: reduce)").matches
            );

            this._installDefinitions(alienDefinitions);

            if (this.host && this._document && typeof this._document.createElement === "function") {
                try {
                    var canvas = this._document.createElement("canvas");
                    canvas.width = STAGE_WIDTH;
                    canvas.height = STAGE_HEIGHT;
                    canvas.setAttribute("width", String(STAGE_WIDTH));
                    canvas.setAttribute("height", String(STAGE_HEIGHT));
                    canvas.setAttribute("aria-hidden", "true");
                    canvas.setAttribute("data-alien-force-renderer", "true");
                    canvas.style.position = "absolute";
                    canvas.style.left = "0";
                    canvas.style.top = "0";
                    canvas.style.width = "100%";
                    canvas.style.height = "100%";
                    canvas.style.display = "block";
                    canvas.style.pointerEvents = "none";
                    canvas.style.imageRendering = "pixelated";
                    canvas.style.zIndex = "10";

                    this.host.appendChild(canvas);
                    this.canvas = canvas;
                    this.context = canvas.getContext("2d");
                    if (this.context) this.context.imageSmoothingEnabled = false;
                } catch (_) {
                    if (this.canvas && this.canvas.parentNode === this.host) {
                        this.host.removeChild(this.canvas);
                    }
                    this.canvas = null;
                    this.context = null;
                }
            }

            this.ready = this._preloadSprites();

            if (this.context) {
                this.draw(this._now());
                this._scheduleFrame();
            }
        }

        _installDefinitions(alienDefinitions) {
            var self = this;

            definitionEntries(alienDefinitions).forEach(function (entry) {
                var suppliedId = entry[0];
                var raw = entry[1];
                if (!raw || typeof raw !== "object") return;

                var id = raw.id != null ? raw.id :
                    raw.alienId != null ? raw.alienId : suppliedId;
                var key = canonicalId(id);
                if (!key) return;

                var frameSource = raw.frames || raw.frameRects || raw.rects || {};
                var idle = normalizeFrameSet(
                    frameSource.idle != null ? frameSource.idle : raw.idle
                );
                var walk = normalizeFrameSet(
                    frameSource.walk != null ? frameSource.walk : raw.walk
                );
                var attack = normalizeFrameSet(
                    frameSource.attack != null ? frameSource.attack : raw.attack
                );

                var spriteValue = raw.spriteUrl != null ? raw.spriteUrl :
                    raw.spriteURL != null ? raw.spriteURL :
                        raw.src != null ? raw.src :
                            raw.url != null ? raw.url :
                                raw.sheet != null ? raw.sheet : raw.sprite;
                var image = raw.image || null;
                var spriteUrl = null;

                if (typeof spriteValue === "string") {
                    spriteUrl = spriteValue;
                } else if (spriteValue && typeof spriteValue === "object") {
                    if (typeof spriteValue.url === "string") spriteUrl = spriteValue.url;
                    else if (typeof spriteValue.src === "string" && !spriteValue.tagName) {
                        spriteUrl = spriteValue.src;
                    } else {
                        image = image || spriteValue;
                    }
                }

                var definition = {
                    id: id,
                    key: key,
                    raw: raw,
                    spriteUrl: spriteUrl,
                    image: image,
                    loaded: Boolean(image && (image.complete !== false)),
                    failed: false,
                    frames: {
                        idle: idle,
                        walk: walk.length ? walk : idle,
                        attack: attack.length ? attack : idle
                    },
                    targetHeight: positiveOr(raw.targetHeight, 0),
                    hover: normalizeHover(raw.hover),
                    color: typeof raw.color === "string" ? raw.color : "#7dff61",
                    effect: raw.effect || raw.effectType ||
                        (raw.attack && raw.attack.type) || null,
                    crossOrigin: raw.crossOrigin
                };

                self._definitions.set(key, definition);
                self._definitions.set(String(id), definition);
                self._definitions.set(String(suppliedId), definition);
                if (!self._firstDefinition) self._firstDefinition = definition;
            });
        }

        _preloadSprites() {
            var self = this;
            var unique = [];
            var seen = new Set();

            this._definitions.forEach(function (definition) {
                if (!seen.has(definition)) {
                    seen.add(definition);
                    unique.push(definition);
                }
            });

            var jobs = unique.map(function (definition) {
                if (definition.image) {
                    definition.loaded = definition.image.complete !== false;
                    return Promise.resolve(definition.loaded);
                }

                if (!definition.spriteUrl || !self._window || !self._window.Image) {
                    definition.failed = true;
                    return Promise.resolve(false);
                }

                return new Promise(function (resolve) {
                    var image;
                    var settled = false;

                    function finish(ok) {
                        if (settled) return;
                        settled = true;
                        definition.loaded = ok;
                        definition.failed = !ok;
                        resolve(ok);
                    }

                    try {
                        image = new self._window.Image();
                        definition.image = image;
                        image.decoding = "async";
                        if (definition.crossOrigin != null) {
                            image.crossOrigin = definition.crossOrigin;
                        }
                        image.onload = function () { finish(true); };
                        image.onerror = function () { finish(false); };
                        image.src = definition.spriteUrl;

                        if (image.complete) {
                            finish(Boolean(image.naturalWidth || image.width));
                        }
                    } catch (_) {
                        finish(false);
                    }
                });
            });

            return Promise.all(jobs).then(function () { return self; });
        }

        _now() {
            var performanceObject = this._window && this._window.performance;
            return performanceObject && typeof performanceObject.now === "function"
                ? performanceObject.now()
                : Date.now();
        }

        _scheduleFrame() {
            if (this.destroyed || !this.context || this._frameHandle != null) return;

            var request = this._window && this._window.requestAnimationFrame;
            if (typeof request !== "function") return;

            this._frameHandle = request.call(this._window, this._tick);
        }

        _tick(timestamp) {
            this._frameHandle = null;
            if (this.destroyed) return;

            try {
                this.draw(isFiniteNumber(timestamp) ? timestamp : this._now());
            } catch (_) {
                // A bad or partially loaded image must not stop later frames.
            }

            this._scheduleFrame();
        }

        _definitionFor(id) {
            if (id != null) {
                return this._definitions.get(id) ||
                    this._definitions.get(String(id)) ||
                    this._definitions.get(canonicalId(id)) || null;
            }
            return this._firstDefinition;
        }

        isReady(id) {
            var definition = this._definitionFor(id);
            if (this.destroyed || !this.canvas || !this.context || !definition) return false;
            if (definition.failed || !definition.loaded || !definition.image) return false;
            var image = definition.image;
            return image.complete !== false && Boolean(image.naturalWidth || image.width);
        }

        readyFor(id) {
            var self = this;
            return Promise.resolve(this.ready).then(function () {
                return self.isReady(id);
            }, function () {
                return false;
            });
        }

        updatePose(nextPose) {
            if (this.destroyed || !nextPose || typeof nextPose !== "object") return;

            var previous = this.pose || {};
            var next = Object.assign({}, previous, nextPose);

            next.x = finiteOr(next.x, finiteOr(previous.x, STAGE_WIDTH / 2));
            next.y = finiteOr(next.y, finiteOr(previous.y, STAGE_HEIGHT));
            next.flipH = Boolean(next.flipH);
            next.blend = clamp(finiteOr(next.blend, 1), 0, 1);
            next.moving = Boolean(next.moving);
            next.attacking = Boolean(next.attacking);
            next.phase = finiteOr(next.phase, 0);

            this.pose = next;
        }

        _effectKind(type) {
            var requested = canonicalId(type);
            var definition = this._definitionFor(type);

            if (definition && definition.effect && canonicalId(definition.effect) !== requested) {
                requested = canonicalId(definition.effect);
            }

            if (requested === "attack" || requested === "primary" || !requested) {
                var current = this.pose && this._definitionFor(this.pose.alienId);
                requested = canonicalId(
                    current && current.effect ? current.effect :
                        this.pose ? this.pose.alienId : requested
                );
            }

            if (/bigchill|freeze|frost|ice|cold/.test(requested)) return "freeze";
            if (/humung|humong|groundshock|shockwave|stomp|quake|smash|slam/.test(requested)) {
                return "shock";
            }
            if (/echoecho|sonic|sound|echo|resonance/.test(requested)) return "sonic";
            if (/transform|morph|omnitrix/.test(requested)) return "transform";
            return null;
        }

        _effectOrigin(origin, kind) {
            var x = NaN;
            var y = NaN;

            if (Array.isArray(origin)) {
                x = finiteOr(origin[0], NaN);
                y = finiteOr(origin[1], NaN);
            } else if (origin && typeof origin === "object") {
                x = finiteOr(origin.x != null ? origin.x : origin.left, NaN);
                y = finiteOr(origin.y != null ? origin.y : origin.top, NaN);
            }

            var pose = this.pose;
            if (!Number.isFinite(x)) x = pose ? pose.x : STAGE_WIDTH / 2;
            if (!Number.isFinite(y)) {
                y = pose ? pose.y : STAGE_HEIGHT / 2;
                if (pose && kind !== "shock") {
                    var definition = this._definitionFor(pose.alienId);
                    var height = definition && definition.targetHeight
                        ? definition.targetHeight
                        : 100;
                    y -= height * 0.58;
                }
            }

            return { x: x, y: y };
        }

        playEffect(type, origin, facing) {
            if (this.destroyed) return false;

            var kind = this._effectKind(type);
            if (!kind) return false;

            var currentDefinition = this.pose
                ? this._definitionFor(this.pose.alienId)
                : null;
            var effect = {
                kind: kind,
                start: this._now(),
                duration: kind === "freeze" ? 720 :
                    kind === "shock" ? 680 : kind === "sonic" ? 940 : 520,
                origin: this._effectOrigin(origin, kind),
                facing: normalizeFacing(facing, this.pose),
                color: currentDefinition ? currentDefinition.color : "#71ff58",
                seed: Math.random() * TAU,
                particles: []
            };

            if (kind === "freeze") {
                for (var i = 0; i < 26; i += 1) {
                    effect.particles.push({
                        delay: Math.random() * 0.22,
                        distance: 45 + Math.random() * 105,
                        lift: (Math.random() - 0.5) * 70,
                        arc: 12 + Math.random() * 28,
                        size: 2 + Math.random() * 5,
                        spin: (Math.random() - 0.5) * 2.5
                    });
                }
            }

            this.effects.push(effect);
            if (this.effects.length > 20) this.effects.splice(0, this.effects.length - 20);
            return true;
        }

        _frameFor(definition, state, phase) {
            var frames = definition.frames[state];
            if (!frames || !frames.length) frames = definition.frames.idle;
            if (!frames || !frames.length) return null;
            if (frames.length === 1) return frames[0];

            var numericPhase = finiteOr(phase, 0);
            var index;
            if (Number.isInteger(numericPhase) && Math.abs(numericPhase) >= 1) {
                index = Math.abs(numericPhase) % frames.length;
            } else {
                var wrapped = ((numericPhase % 1) + 1) % 1;
                index = Math.floor(wrapped * frames.length);
            }
            return frames[index];
        }

        _drawSprite(context, now) {
            if (!this.pose || this.pose.blend <= 0) return;

            var definition = this._definitionFor(this.pose.alienId);
            if (!definition || definition.failed || !definition.image) return;

            var image = definition.image;
            if (image.complete === false || (!definition.loaded && !image.naturalWidth && !image.width)) {
                return;
            }

            var state = this.pose.attacking ? "attack" : this.pose.moving ? "walk" : "idle";
            var frame = this._frameFor(definition, state, this.pose.phase);
            if (!frame) return;

            var referenceFrame = definition.frames.idle && definition.frames.idle[0]
                ? definition.frames.idle[0]
                : frame;
            var spriteScale = definition.targetHeight
                ? definition.targetHeight / referenceFrame.h
                : 1;
            var height = frame.h * spriteScale;
            var width = frame.w * spriteScale;
            var hover = definition.hover;
            var bob = hover.amplitude
                ? Math.sin(now * hover.speed + this.pose.phase * TAU) * hover.amplitude
                : 0;
            var bottom = this.pose.y - hover.lift - bob;

            context.save();
            try {
                context.globalAlpha = this.pose.blend;
                context.translate(this.pose.x, bottom);
                if (this.pose.flipH) context.scale(-1, 1);
                context.drawImage(
                    image,
                    frame.x,
                    frame.y,
                    frame.w,
                    frame.h,
                    -width / 2,
                    -height,
                    width,
                    height
                );
            } finally {
                context.restore();
            }
        }

        _effectProgress(effect, now) {
            return clamp((now - effect.start) / effect.duration, 0, 1);
        }

        _shakeAt(now) {
            if (this._reducedMotion) return { x: 0, y: 0 };
            var x = 0;
            var y = 0;

            for (var i = 0; i < this.effects.length; i += 1) {
                var effect = this.effects[i];
                var progress = this._effectProgress(effect, now);
                var strength;

                if (effect.kind === "shock" && progress < 0.72) {
                    strength = 5.5 * (1 - progress / 0.72);
                    x += Math.sin(now * 0.16 + effect.seed) * strength;
                    y += Math.cos(now * 0.21 + effect.seed) * strength * 0.42;
                } else if (effect.kind === "sonic" && progress < 0.86) {
                    strength = 1.15 * (1 - progress / 0.86);
                    x += Math.sin(now * 0.31 + effect.seed) * strength;
                    y += Math.cos(now * 0.27 + effect.seed) * strength * 0.28;
                }
            }

            return {
                x: clamp(x, -7, 7),
                y: clamp(y, -4, 4)
            };
        }

        _drawShock(context, effect, now) {
            var progress = this._effectProgress(effect, now);
            var eased = 1 - Math.pow(1 - progress, 3);
            var radius = 10 + eased * 105;
            var alpha = 1 - progress;
            var origin = effect.origin;

            context.save();
            try {
                context.globalAlpha = alpha * 0.85;
                context.strokeStyle = effect.color || "#d5a35c";
                context.lineWidth = 5 - progress * 3;
                context.beginPath();
                context.arc(origin.x, origin.y, radius, 0, TAU);
                context.stroke();

                context.globalAlpha = alpha * 0.45;
                context.strokeStyle = "#fff1c7";
                context.lineWidth = 2;
                context.beginPath();
                context.arc(origin.x, origin.y, radius * 0.68, 0, TAU);
                context.stroke();

                context.globalAlpha = alpha * 0.65;
                context.strokeStyle = "#8b6138";
                context.lineWidth = 2;
                for (var i = -3; i <= 3; i += 1) {
                    if (i === 0) continue;
                    var angle = -Math.PI / 2 + i * 0.17;
                    var inner = radius * 0.25;
                    var outer = radius * (0.52 + Math.abs(i) * 0.065);
                    context.beginPath();
                    context.moveTo(
                        origin.x + Math.cos(angle) * inner,
                        origin.y + Math.sin(angle) * inner * 0.32
                    );
                    context.lineTo(
                        origin.x + Math.cos(angle) * outer,
                        origin.y + Math.sin(angle) * outer * 0.32
                    );
                    context.stroke();
                }
            } finally {
                context.restore();
            }
        }

        _drawFreeze(context, effect, now) {
            var progress = this._effectProgress(effect, now);
            var origin = effect.origin;
            var direction = effect.facing;

            context.save();
            try {
                context.globalAlpha = (1 - progress) * 0.62;
                context.strokeStyle = "#bff7ff";
                context.lineWidth = 3.5 - progress * 2;
                context.beginPath();
                context.moveTo(origin.x, origin.y);
                context.quadraticCurveTo(
                    origin.x + direction * 60 * progress,
                    origin.y - 18,
                    origin.x + direction * (35 + 145 * progress),
                    origin.y + Math.sin(progress * Math.PI) * 7
                );
                context.stroke();

                for (var i = 0; i < effect.particles.length; i += 1) {
                    var particle = effect.particles[i];
                    var local = clamp(
                        (progress - particle.delay) / (1 - particle.delay),
                        0,
                        1
                    );
                    if (local <= 0 || local >= 1) continue;

                    var fade = Math.sin(local * Math.PI);
                    var x = origin.x + direction * particle.distance * local;
                    var y = origin.y + particle.lift * local -
                        Math.sin(local * Math.PI) * particle.arc;
                    var size = particle.size * (0.55 + fade);

                    context.save();
                    context.translate(x, y);
                    context.rotate(particle.spin * local);
                    context.globalAlpha = fade * 0.9;
                    context.fillStyle = i % 3 === 0 ? "#ffffff" : "#79dfff";
                    context.beginPath();
                    context.moveTo(direction * size * 1.8, 0);
                    context.lineTo(0, -size * 0.58);
                    context.lineTo(-direction * size, 0);
                    context.lineTo(0, size * 0.58);
                    context.closePath();
                    context.fill();
                    context.restore();
                }
            } finally {
                context.restore();
            }
        }

        _drawSonic(context, effect, now) {
            var progress = this._effectProgress(effect, now);
            var origin = effect.origin;
            var direction = effect.facing;

            for (var ringIndex = 0; ringIndex < 3; ringIndex += 1) {
                var delay = ringIndex * 0.14;
                var local = clamp((progress - delay) / (1 - delay), 0, 1);
                if (local <= 0 || local >= 1) continue;

                var eased = 1 - Math.pow(1 - local, 2);
                var radius = 8 + eased * 70;
                var centerX = origin.x + direction * (8 + eased * 52);
                var alpha = Math.sin(local * Math.PI) * 0.92;

                context.save();
                try {
                    context.translate(centerX, origin.y);
                    context.scale(0.45, 1);
                    context.globalAlpha = alpha;
                    context.strokeStyle = ringIndex % 2 === 0
                        ? (effect.color || "#79ff55")
                        : "#ffffff";
                    context.lineWidth = (4 - local * 2.1) / 0.45;
                    context.beginPath();
                    context.arc(0, 0, radius, 0, TAU);
                    context.stroke();
                } finally {
                    context.restore();
                }
            }
        }

        _drawTransform(context, effect, now) {
            var progress = this._effectProgress(effect, now);
            var pulse = Math.sin(progress * Math.PI);
            var radius = 12 + progress * 54;

            context.save();
            try {
                context.translate(effect.origin.x, effect.origin.y);
                context.globalAlpha = pulse * 0.9;
                context.strokeStyle = effect.color || "#79ff55";
                context.lineWidth = 4 - progress * 2;
                context.beginPath();
                context.arc(0, 0, radius, 0, TAU);
                context.stroke();

                context.globalAlpha = pulse * 0.55;
                context.strokeStyle = "#ffffff";
                context.lineWidth = 2;
                for (var i = 0; i < 8; i += 1) {
                    var angle = i * TAU / 8 + progress * 0.7;
                    context.beginPath();
                    context.moveTo(
                        Math.cos(angle) * radius * 0.58,
                        Math.sin(angle) * radius * 0.58
                    );
                    context.lineTo(
                        Math.cos(angle) * radius * 1.15,
                        Math.sin(angle) * radius * 1.15
                    );
                    context.stroke();
                }
            } finally {
                context.restore();
            }
        }

        draw(timestamp) {
            if (this.destroyed || !this.context || !this.canvas) return;

            var now = isFiniteNumber(timestamp) ? timestamp : this._now();
            var context = this.context;

            this.effects = this.effects.filter(function (effect) {
                return now - effect.start < effect.duration;
            });

            context.save();
            try {
                if (typeof context.setTransform === "function") {
                    context.setTransform(1, 0, 0, 1, 0, 0);
                }
                context.globalAlpha = 1;
                context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
                context.imageSmoothingEnabled = false;

                var shake = this._shakeAt(now);
                context.translate(shake.x, shake.y);

                for (var i = 0; i < this.effects.length; i += 1) {
                    if (this.effects[i].kind === "shock") {
                        this._drawShock(context, this.effects[i], now);
                    }
                }

                this._drawSprite(context, now);

                for (var j = 0; j < this.effects.length; j += 1) {
                    var effect = this.effects[j];
                    if (effect.kind === "freeze") this._drawFreeze(context, effect, now);
                    else if (effect.kind === "sonic") this._drawSonic(context, effect, now);
                    else if (effect.kind === "transform") {
                        this._drawTransform(context, effect, now);
                    }
                }
            } finally {
                context.restore();
            }
        }

        clear() {
            this.pose = null;
            this.effects.length = 0;

            if (!this.context) return;
            this.context.save();
            try {
                if (typeof this.context.setTransform === "function") {
                    this.context.setTransform(1, 0, 0, 1, 0, 0);
                }
                this.context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
            } finally {
                this.context.restore();
            }
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;

            var cancel = this._window && this._window.cancelAnimationFrame;
            if (this._frameHandle != null && typeof cancel === "function") {
                cancel.call(this._window, this._frameHandle);
            }
            this._frameHandle = null;
            this.pose = null;
            this.effects.length = 0;

            if (this.canvas && this.canvas.parentNode) {
                this.canvas.parentNode.removeChild(this.canvas);
            }

            this.context = null;
            this.canvas = null;
            this.host = null;
        }
    }

    AlienForceRenderer.WIDTH = STAGE_WIDTH;
    AlienForceRenderer.HEIGHT = STAGE_HEIGHT;
    global.AlienForceRenderer = AlienForceRenderer;
})(typeof window !== "undefined" ? window : globalThis);
