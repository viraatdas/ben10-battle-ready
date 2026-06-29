# Ben 10: Battle Ready - HTML5 Edition

The original 2005 **Ben 10: Battle Ready** (Cartoon Network, Macromedia Director MX 2004) running in modern browsers via [DirPlayer](https://github.com/igorlira/dirplayer-rs) — a WebAssembly Shockwave Director emulator.

**[Play it live](https://ben10-battle-ready.viraat.dev)**

## What changed in this rewrite

The previous version of this repo was a **from-scratch JavaScript recreation** — programmatically drawn pixel-art sprites, synthesized audio, and approximated game mechanics. It looked Ben-10-ish but wasn't actually the game.

This version is the **actual original game**. Its levels, original characters,
animation frames, sound effects, and Lingo bytecode are the files Cartoon
Network shipped in 2005. The browser runs the original `game.dcr` and 24 `.cct`
cast libraries through a WASM emulator. A small, isolated browser layer adds
three Alien Force transformations to the normal Omnitrix rotation without
replacing the Director game.

## How it works

1. The original game files (`game.dcr`, 24 external `.cct` cast libraries, `gamewrapper.dir`) live in `game/` exactly as they shipped.
2. `dirplayer-polyfill.js` — DirPlayer v0.5.1 compiled to WASM — auto-detects the `<embed type="application/x-director">` element in `index.html` and replaces it with a real Shockwave player.
3. The WASM VM interprets the original Director chunks and Lingo bytecode, reuses the preloaded patched cast libraries, and renders to a `<canvas>` element.
4. `js/alien-force-extension.js` integrates Big Chill, Humungousaur, and Echo
   Echo into the normal Omnitrix rotation while reusing native character
   physics and combat. A second 600×400 canvas draws their new sprite art in
   the same responsive stage.

The expansion is deliberately additive: deleting its two scripts, stylesheet,
and assets leaves the original game intact.

## The one binary patch

The original `game.dcr` stores all 24 external cast filenames as the placeholder `C:\PROJECTS\Ben 10\_DEV\0.033\empty.cst`. The original Windows Shockwave projector relied on a startup Lingo handler to rewrite those paths at runtime — a flow DirPlayer's emulator doesn't currently re-trigger, so every cast would attempt to load from `empty.cct` and find nothing.

`tools/patch_dcr.py` fixes this with a single, minimal binary patch:

1. Parses the Director **afterburner** container format (`XFIR`/`MDGF` with zlib-compressed `Fcdr`/`ABMP`/`ILS` blocks).
2. Decompresses the `ILS` (initial load segment), locates the `MCsL` (Movie Cast List) chunk inside it.
3. Replaces each of the 24 `empty.cst` occurrences with a unique 9-character filename (`emp01.cst` through `emp24.cst`). Same byte length so the chunk's internal offset table stays valid.
4. Re-compresses ILS, updates the `ABMP` chunk index (offsets for trailing chunks shift by the new ILS-compression delta), re-compresses ABMP, fixes the RIFX header size, and rewrites the file.
5. The repository includes matching `emp01.cct` through `emp24.cct` copies so DirPlayer's `.cst`→`.cct` lookup resolves.

The Lingo bytecode and every cast member are untouched. The checked-in movie is
already patched, so `python3 tools/patch_dcr.py` validates all 24 cast names and
exits without rewriting it. To patch a clean source movie, run
`python3 tools/patch_dcr.py path/to/original.dcr --output game/game.dcr`.

### Patched-name mapping

| Patched index | Cast library | Cast members |
|---|---|---|
| `emp01.cct` | char_Ben | 29 |
| `emp02.cct` | char_FourArms | 24 |
| `emp03.cct` | char_Graymatter | 21 |
| `emp04.cct` | char_Diamondhead | 32 |
| `emp05.cct` | char_Ghostfreak | 33 |
| `emp06.cct` | char_Heatblast | 26 |
| `emp07.cct` | char_Ripjaw | 37 |
| `emp08.cct` | char_Stinkfly | 21 |
| `emp09.cct` | char_Upgrade | 22 |
| `emp10.cct` | char_XLR8 | 12 |
| `emp11.cct` | char_Wildmutt | 21 |
| `emp12.cct` | char_Bugbot | 8 |
| `emp13.cct` | char_Nosebot | 9 |
| `emp14.cct` | char_LargeBugbot | 8 |
| `emp15.cct` | char_Minion1 | 12 |
| `emp16.cct` | char_Minion2 | 12 |
| `emp17.cct` | char_Mechbot | 7 |
| `emp18.cct` | char_FlyingMechbot | 5 |
| `emp19.cct` | char_Boss | 33 |
| `emp20.cct` | game | 225 |
| `emp21.cct` | map_Factory | 202 |
| `emp22.cct` | map_Micro | 197 |
| `emp23.cct` | map_Rafters | 146 |
| `emp24.cct` | map_Sewer | 193 |

**1,342 original cast members across 24 libraries**, all loading successfully at runtime — verified via the WASM VM's load logs.

## File layout

```
ben10-battle-ready/
  index.html                  -- <embed data-src="game/game.dcr" type="application/x-director">
  dirplayer-polyfill.js       -- DirPlayer v0.5.1 WASM polyfill (12 MB)
  assets/aliens/              -- Three generated sprite sheets + frame/ability data
  js/alien-force-extension.js -- Omnitrix rotation bridge, native state bridge, attacks
  js/alien-force-renderer.js  -- Stage-aligned sprite and attack-effect canvas
  ruffle/                     -- Optional Ruffle payload; default startup disables Flash because the shipped SWF is not gameplay-critical
  css/style.css               -- Responsive page chrome
  css/alien-force.css         -- Omnitrix rotation and status UI
  vercel.json                 -- MIME types and cache headers for .dcr/.cct/.wasm
  game/                       -- Original Director files
    game.dcr                  -- Patched main movie (MCsL only)
    gamewrapper.dir           -- Original wrapper movie (unused at runtime, kept for reference)
    char_*.cct, map_*.cct     -- Original external cast libraries
    emp01.cct … emp24.cct     -- Same data, renamed for the patched MCsL
    empty.cct                 -- Original placeholder cast (kept for reference)
    tracker.swf               -- Original analytics SWF stub
    lingo.ini                 -- Original Lingo config (effectively empty)
  tools/
    patch_dcr.py              -- The .dcr patcher
```

## Controls

Reverse-engineered from the game's own bytecode (`class_Game.keyMgr_keyDown` is the authoritative key dispatcher; `class_KeyController` declares a `KEYCODE_TRANSFORM = KEYCODE_Z` field but nothing in the game ever reads it — it's dead code from a refactor):

| Key | Action |
|---|---|
| Arrow keys | Move Ben / navigate menus |
| Space | Attack / confirm menu button |
| **X** (hold) | Rotate through the Omnitrix roster, including Big Chill, Humungousaur, and Echo Echo. Release to transform. Press X again while transformed to revert to Ben. |
| Esc | Cancel / close popup |

Levels 2–11 are mission levels and lock you to one specific alien (`LEVEL_DEFAULT_CHARS[N]`), so X does nothing there.

## Alien Force expansion

Hold **X** in a playable Ben area to rotate through the full Omnitrix roster.
The three additional forms are inserted near their native carriers:

- **Big Chill** uses Ghostfreak's native phase/fly collision mask, so he can pass
  through phase walls. Space emits a line-of-sight-aware freeze wave that deals
  damage and freezes enemies for 45 game frames.
- **Humungousaur** uses Four Arms' large collision body and strength. Space
  performs a 120-unit, line-of-sight-aware ground slam.
- **Echo Echo** uses Gray Matter's small footprint. Space sends a forward sonic
  cone that damages, pushes, and briefly stuns enemies.

The extension reads the native player's position, facing, blend, action, and
game-frame clock through DirPlayer's serialized MCP bridge. Native collision,
camera, health, damage, mission, and pause logic remain authoritative. Custom
form sprites are drawn before their carrier morph begins, so Big Chill no
longer visibly becomes Ghostfreak during the transition. If an asset or the
extension fails to load, the Director game continues normally.

The designs and power behavior were checked against Dwayne McDuffie's
[Alien Force series bible](https://dwaynemcduffie.com/wp-content/uploads/2024/07/WEBSITE-B10Hero-Generation-SERIES-BIBLE-by-Dwayne.pdf).
The extension sprite sheets are newly generated raster assets based on those
turnarounds, rather than extracted TV or game artwork.

## How to play a mission

Level 1 is the **hub**, not a level. From level 1:

1. Walk Ben (arrow keys) onto one of the **mission holes** scattered on the map. Each hole corresponds to one alien.
2. A mission popup opens.
3. Use LEFT / RIGHT arrows to highlight **ACCEPT** (right) or **CANCEL** (left).
4. Press **Space** to confirm.
5. The chosen mission level loads.

After completing a mission, the game returns you to level 1, marks that mission as done, and unlocks the alien permanently in your Omnitrix. Beat all 10 missions to open the boss door (level 12).

You can also stay in the hub and hold X to rotate through the full Omnitrix roster directly.

## Running locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any modern browser; no plugin install needed.

## Credits

- Original game: **Cartoon Network** / **Powerhouse Animation Studios** (circa 2005).
- Original platform: **Macromedia Director MX 2004** (Shockwave) — EOL'd in 2019.
- Game files preserved by **[Flashpoint Archive](https://flashpointarchive.org/)** (entry `dbb21635-b0d5-78d9-a749-c4778a07e698`).
- WASM Shockwave emulator: **[dirplayer-rs](https://github.com/igorlira/dirplayer-rs)** by Igor Lira (MIT / Apache 2.0).
- Embedded Flash playback: **[Ruffle](https://ruffle.rs/)** (MIT / Apache 2.0).
- Alien Force character and power reference: **Dwayne McDuffie's 2007 series
  bible**.
