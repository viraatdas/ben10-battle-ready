# Ben 10: Battle Ready - HTML5 Edition

A faithful HTML5 recreation of the classic **Ben 10: Battle Ready** game, originally built as a Macromedia Director (Shockwave) game for Cartoon Network's website (circa 2005-2006).

**[Play it live](https://ben10-battle-ready.viraat.dev)**

## How the Conversion Was Done

### The Problem

The original Ben 10: Battle Ready was built with **Macromedia Director MX 2004** (Shockwave), a technology that has been completely discontinued. The Shockwave plugin was EOL'd in April 2019 and removed from all modern browsers. The original game exists only as a Windows projector executable (`.exe`) with Director cast files (`.cct`, `.dcr`) — completely unplayable on modern systems.

### Step 1: Safety Analysis of the Original Files

The source was an untrusted zip file downloaded from the internet. Before doing anything, we performed a thorough safety analysis:

- **File type verification**: Confirmed the zip contains a legitimate Director MX 2004 projector
- **Binary analysis**: All 70+ DLLs/x32 files are PE32 (32-bit Windows) executables — cannot run on macOS/Linux
- **Hash fingerprinting**: SHA-256 hash recorded for provenance tracking
- **Suspicious file flagging**: Identified `LeechProtectionRemovalHelp.x32` as a known Shockwave preservation community tool (not malware)
- **No execution risk**: Game data files (`.cct`, `.dcr`) are media containers, not executable code
- **INI inspection**: `Projector.ini` is the default Director template (all settings commented out); `lingo.ini` is effectively empty

**Verdict: Safe.** Standard Director MX 2004 package from the Shockwave preservation community.

### Step 2: Reverse Engineering the Game Architecture

Since Director files use a proprietary binary format, we used multiple approaches to extract the game's structure:

#### 2a. RIFX Container Parsing

Director files use the **RIFX** format (a variant of RIFF, in big-endian). We wrote a custom Python parser to:
- Identify the file format: `XFIR` (little-endian RIFX) with `CDGF` (compressed Director cast) and `MDGF` (compressed Director movie) subtypes
- Locate and decompress **zlib-compressed data streams** within the binary files
- Extract the internal chunk structure (KEY*, CAS*, BITD, Lscr, etc.)

#### 2b. Asset and Class Name Extraction

From the decompressed data streams, we extracted the complete game architecture:

**Game Classes Found:**
| Category | Classes |
|----------|---------|
| Player Characters | `class_Char_Ben`, `class_Char_FourArms`, `class_Char_Heatblast`, `class_Char_Diamondhead`, `class_Char_XLR8`, `class_Char_Wildmutt`, `class_Char_Ghostfreak`, `class_Char_Upgrade`, `class_Char_Stinkfly`, `class_Char_Ripjaw`, `class_Char_GraymatterZoom` |
| Enemies | `class_Char_Minion1`, `class_Char_Minion2`, `class_Char_Mechbot`, `class_Char_FlyingMechbot`, `class_Char_NoseBot`, `class_Char_Bugbot`, `class_Char_LargeBugbot` (Boss) |
| Actions (per character) | `_Ready`, `_Run`, `_Attack`, `_Hit`, `_Dead`, `_Transform` |
| Breakable Objects | `RustyMetalCrate`, `BrownBarrel`, `GreenBarrel`, `BlueBarrel`, `ExplosiveBarrel`, `StoneBlock`, `CardboardBox`, `CoffeeMug`, `ColaCan`, `SumoBox`, `FactoryMachine1/2`, `FactoryDesk1/2`, `FactoryCabinet1/2`, `FactorySumoDisplay1/2` |
| Pickups | `class_PickupItem_1up`, `class_PickupItem_SumoCard`, `class_PickupItem_Energy` |
| Game Systems | `class_Main`, `class_Screen`, `class_View`, `class_SpriteManager`, `class_AIController`, `class_Pathfinder`, `class_AudioManager`, `class_SaveManager`, `class_HUDOverlay`, `class_HUDOmnitrix` |

**Level Maps:** `map_Factory.cct`, `map_Sewer.cct`, `map_Rafters.cct`, `map_Micro.cct`

**12 Level Layouts:** `_level_layout_01` through `_level_layout_12` (discovered via path `C:\PROJECTS\Ben 10\_DEV\0.033`)

#### 2c. Lingo Script Analysis

The wrapper script (`gamewrapper.dir`) was successfully decompiled, revealing the game initialization flow:
```lingo
on exitFrame me
  disableGoToNetPage()
  bugfixShockwave3DBadDriverList()
  forceTheExitLock(0)
  setTheRunMode("Plugin")
  go(1, "game.dcr")
  -- renderer selection logic (DirectX9 > DirectX5 > OpenGL > Software)
end
```

The main game logic in `game.dcr`/`game.cct` uses **compiled Lingo bytecode** (not source), which cannot be trivially decompiled. The bytecode was analyzed for string constants and data structures.

#### 2d. Tools Used

| Tool | Purpose |
|------|---------|
| `file`, `xxd` | Binary format identification |
| `unzip -l` | Safe archive inspection without extraction |
| `shasum` | File integrity verification |
| Custom Python RIFX parser | Director file structure analysis |
| `zlib.decompress()` | Decompressing Director's compressed chunks |
| `drxtract` | Partial Director file extraction (MV93 format) |

### Step 3: HTML5 Reconstruction

Since the original assets (sprites, sounds) are embedded in Director's proprietary compressed format and the game logic is compiled bytecode, we **rebuilt the game from scratch** in HTML5:

- **Rendering**: HTML5 Canvas 2D API with programmatic pixel-art sprites
- **Audio**: Web Audio API with synthesized retro sound effects
- **Architecture**: Vanilla JavaScript with class-based entity system mirroring the original's `class_Actor` > `class_Character` > `class_PlayerCharacter` hierarchy
- **Game mechanics**: Side-scrolling beat-em-up with Omnitrix transformation system, matching the original's character state machine (Ready/Run/Attack/Hit/Dead/Transform)
- **Levels**: 12 procedurally generated levels across 4 themes (Factory, Sewer, Rafters, Micro) matching the original's map files
- **All 10 aliens**: Four Arms, Heatblast, Diamondhead, XLR8, Wildmutt, Ghostfreak, Upgrade, Stinkfly, Ripjaw, Gray Matter
- **All enemy types**: Minions, Mechbots, Flying Mechbots, Bugbots, Large Bugbots, Nosebots, plus Boss fights

### File Structure

```
ben10-battle-ready/
  index.html          -- Entry point
  vercel.json         -- Deployment config
  css/
    style.css         -- Styling and loading screen
  js/
    utils.js          -- Constants and helpers
    sprites.js        -- Pixel-art sprite definitions
    input.js          -- Keyboard input handling
    audio.js          -- Web Audio sound effects
    particles.js      -- Visual effects system
    entities.js       -- Base entity/combat classes
    player.js         -- Player + alien transformations
    enemies.js        -- Enemy types and AI
    objects.js         -- Breakable objects and pickups
    levels.js         -- Level generation and backgrounds
    hud.js            -- HUD and Omnitrix interface
    screens.js        -- Title, game over, win screens
    game.js           -- Main game loop and state management
```

## How to Play

| Control | Action |
|---------|--------|
| Arrow Keys / WASD | Move |
| Space / W / Up | Jump |
| Z / J / Enter | Attack |
| X / K | Transform / Untransform |
| Q / E | Select Alien (when human) |
| P / Escape | Pause |
| M | Toggle Sound |

## Running Locally

Just open `index.html` in any modern browser, or serve with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Tech Stack

- **Zero dependencies** - Pure vanilla HTML5/CSS/JavaScript
- **Canvas 2D** rendering with programmatic sprites
- **Web Audio API** for synthesized sound effects
- **No build step** - Works directly in the browser

## Credits

- Original game by **Cartoon Network** / **Powerhouse Animation Studios** (circa 2005-2006)
- Built with **Macromedia Director MX 2004** (Shockwave)
- HTML5 conversion and reverse engineering performed with Claude Code
