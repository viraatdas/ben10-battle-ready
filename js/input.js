// ============================================================
// Input - keyboard and touch controls
// ============================================================
const Keys = {};
const KeysJustPressed = {};
let _prevKeys = {};

window.addEventListener('keydown', e => {
    Keys[e.code] = true;
    e.preventDefault();
});
window.addEventListener('keyup', e => {
    Keys[e.code] = false;
    e.preventDefault();
});

function updateInput() {
    for (const k in Keys) {
        KeysJustPressed[k] = Keys[k] && !_prevKeys[k];
    }
    _prevKeys = { ...Keys };
}

function isLeft() { return Keys['ArrowLeft'] || Keys['KeyA']; }
function isRight() { return Keys['ArrowRight'] || Keys['KeyD']; }
function isUp() { return Keys['ArrowUp'] || Keys['KeyW']; }
function isDown() { return Keys['ArrowDown'] || Keys['KeyS']; }
function isJump() { return KeysJustPressed['ArrowUp'] || KeysJustPressed['KeyW'] || KeysJustPressed['Space']; }
function isAttack() { return KeysJustPressed['KeyZ'] || KeysJustPressed['KeyJ'] || KeysJustPressed['Enter']; }
function isTransform() { return KeysJustPressed['KeyX'] || KeysJustPressed['KeyK']; }
function isAnyKey() {
    return KeysJustPressed['Space'] || KeysJustPressed['Enter'] || KeysJustPressed['KeyZ'];
}
