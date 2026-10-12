# WeddingRush featuring Sean and Becky

A side-scrolling hurdle runner built with TypeScript, Vite, Phaser 3 / Arcade
Physics, Vitest and Playwright. This copy is independent of the original
Wedding Rush platformer. No backend or external artwork/voice service is needed.

## Play locally

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5200 and select **I'm coming!**
The original game can continue running on port 5199.

## How to play

Sean automatically runs along a continuous city street towards Becky.
Time your jumps over **seven hurdles** and seven separate distraction characters. Speed increases smoothly
from 300 to 430 world pixels per second as you approach the altar.
The city starts at night with stars and a moon, brightens gradually across the
course, and reaches full daylight at Becky. Pausing freezes the lighting;
replay restores the night.
The opening has an extra 1,750 pixels of clear street before the encounters,
giving the roughly six-second intro recording time to finish before the first
character speaks. Later encounter spacing stays unchanged.

- **Space / W / Up**: one press, one full jump. Holding does not auto-jump.
- **Tap the game** or the mobile **JUMP** button for the same jump.
- On phones, the game fills the available browser viewport in portrait or
  landscape, with no page title, footer, borders or scrolling. Compact stats,
  captions, pause and jump controls overlay the game and respect screen safe
  areas. Browser address bars remain under the browser's control.
- **Escape / How to play / pause**: pause, resume or start a fresh run.
- Each hurdle hit or side collision with a person costs **one of three chances**
  and **8 seconds**, once per obstacle.
  You keep running after a hit; the third hit ends the run, even with time left.
  The result says **Too many distractions!** when chances run out and
  **Fashionably... too late.** when the timer expires.
- Passing a hurdle without touching it counts as a clear. People are positioned
  separately between hurdles. Jump over them or land on their heads while falling
  to squash them and bounce without losing time or a chance. Each person can
  be squashed once; a side-hit person is no longer collidable for that run.
  Each squash awards **5 bonus points**, added to the HUD's total points.
  Results show sweet points and squash bonuses separately.
  There is no steering, platform climbing, gap jumping or checkpoint system.
- Optional dice sweets score their face value, from **1 to 6**.
  Only the first two are at street level. The others sit near jump peaks above
  hurdles and around people's heads, including a sweet after each person that
  can be caught on a squash-bounce. These need tighter jump timing.
- Reach the flower arch within **two minutes** to win. The result shows cleared
  hurdles and sweet points. A clean run takes roughly 31 seconds.
  Sean and Becky meet with floating hearts, then the victory result appears
  after 3.2 seconds. Reduced motion uses a static reunion and hearts.
- Replay resets the route, chances, hurdle and person states, lighting, score and countdown.
  The sound preference is preserved.

All seven original distractions appear exactly once between the hurdles with their existing
outfits, props and dialogue. They invite you to football, deal, ping-pong,
hat hunting, the pub, karaoke and kebabs; jump over them or squash them to ignore them.

The supplied Sean photo and Becky/deal/ping-pong head cutouts are retained
and bundled locally. Sean keeps the original 34 x 56 physics hitbox.
The wedding sign and victory banner sit above Becky; her caption sits
to her left, keeping her head and face unobstructed.
Artwork loading failures show an error rather than replacing the character.
Generated sound effects and bundled ElevenLabs voice recordings can be muted.
The eight MP3s in `src/shared/sounds/` play the intro on a fresh run and each
distraction's matching clip when the person approaches. Clips load on demand,
are decoded and cached locally, and ship with the production build. No API
key, ElevenLabs connection or browser speech synthesis is used during play.
Only one voice plays at a time; a new clip replaces the previous one.
Pause, mute, ending a run and leaving the page stop voice playback and cancel
pending playback. Resuming does not repeat the intro; replay does.
Loading or decoding errors are reported in the status strip.
The four MP3s in `src/assets/sounds/` supply quiet, looping background music
during the run, `splat` on hurdle hits, person side hits and squashes, `gameover` on loss and `level_end` when
the couple meet. Music pauses with the game, resumes from its previous position,
and restarts on a fresh run. It stops at the finish or game over. Sound off mutes
music, recordings and generated effects together.
Captions remain visible without audio. Backgrounding or leaving the window
pauses the run and countdown. Reduced motion disables Sean's running bob
and floating-text movement, and makes squashes immediate.

## Structure

- `src/shared/level.ts`: course, speed progression, dice values and run rules.
- `src/client/scene.ts`: auto-running, buffered jumps, hurdle collisions and finish.
- `src/client/art.ts`: original procedural characters and tiled city artwork.
- `src/client/input.ts`: focus-scoped keyboard, game taps and jump button input.
- `src/client/audio.ts`: local sound effects and bundled voice playback.
- `src/client/main.ts`: lifecycle, dialogs, HUD and accessibility text.

Instructions, status, progress and buttons are HTML outside the Phaser canvas.
Large, screen-fixed event callouts celebrate sweets, squashes, cleared hurdles
and the finish, and flag costly hits. They pop and tilt briefly without camera
shaking or flashing; reduced motion uses static callouts. Pause freezes them
and replay clears them.

## Validate and build

```sh
npm test
npm run build
npm run test:e2e
```

If Chromium is missing: `npx playwright install chromium`.
The browser tests run their own server on port 5300 and cover a complete
seven-hurdle run using real keyboard jumps. Production output is in `dist/`.
# wedding-rush
