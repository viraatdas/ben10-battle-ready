// ============================================================
// Audio - Web Audio API sound effects
// ============================================================
const AudioCtx = (function() {
    try { return new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { return null; }
})();

let audioEnabled = true;

function playTone(freq, duration, type, volume) {
    if (!AudioCtx || !audioEnabled) return;
    try {
        if (AudioCtx.state === 'suspended') AudioCtx.resume();
        const osc = AudioCtx.createOscillator();
        const gain = AudioCtx.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.value = volume || 0.1;
        gain.gain.exponentialRampToValueAtTime(0.001, AudioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(AudioCtx.destination);
        osc.start();
        osc.stop(AudioCtx.currentTime + duration);
    } catch(e) {}
}

function playNoise(duration, volume) {
    if (!AudioCtx || !audioEnabled) return;
    try {
        if (AudioCtx.state === 'suspended') AudioCtx.resume();
        const bufferSize = AudioCtx.sampleRate * duration;
        const buffer = AudioCtx.createBuffer(1, bufferSize, AudioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const src = AudioCtx.createBufferSource();
        const gain = AudioCtx.createGain();
        src.buffer = buffer;
        gain.gain.value = volume || 0.05;
        gain.gain.exponentialRampToValueAtTime(0.001, AudioCtx.currentTime + duration);
        src.connect(gain);
        gain.connect(AudioCtx.destination);
        src.start();
    } catch(e) {}
}

const SFX = {
    hit()       { playTone(200, 0.1, 'square', 0.12); playNoise(0.08, 0.08); },
    punch()     { playTone(150, 0.08, 'sawtooth', 0.1); playNoise(0.05, 0.1); },
    jump()      { playTone(400, 0.15, 'square', 0.08); setTimeout(() => playTone(600, 0.1, 'square', 0.06), 50); },
    transform() {
        playTone(300, 0.1, 'sine', 0.1);
        setTimeout(() => playTone(500, 0.1, 'sine', 0.1), 100);
        setTimeout(() => playTone(800, 0.2, 'sine', 0.12), 200);
    },
    untransform() {
        playTone(800, 0.1, 'sine', 0.1);
        setTimeout(() => playTone(500, 0.1, 'sine', 0.08), 100);
        setTimeout(() => playTone(300, 0.2, 'sine', 0.06), 200);
    },
    pickup()    { playTone(600, 0.08, 'square', 0.08); setTimeout(() => playTone(900, 0.12, 'square', 0.08), 80); },
    explosion() { playNoise(0.3, 0.15); playTone(80, 0.3, 'sawtooth', 0.1); },
    death()     { playTone(400, 0.15, 'sawtooth', 0.1); setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.08), 150); },
    select()    { playTone(500, 0.08, 'square', 0.06); },
    levelUp()   {
        [440,554,659,880].forEach((f,i) => setTimeout(() => playTone(f, 0.15, 'square', 0.08), i*100));
    },
    bossDeath() {
        playNoise(0.5, 0.2);
        [200,150,100,80].forEach((f,i) => setTimeout(() => playTone(f, 0.3, 'sawtooth', 0.12), i*150));
    }
};
