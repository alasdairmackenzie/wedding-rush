# WeddingRush featuring Sean and Becky

A side-scrolling hurdle runner built with TypeScript, Vite, Phaser 3 / Arcade
Physics, Vitest and Playwright. This copy is independent of the original
Wedding Rush platformer. A small Node server serves the game and a guest
leaderboard stored in Postgres.

## Play locally

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5200 and select **I'm coming!**
The original game can continue running on port 5199.

To try the production build and leaderboard locally:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3000. Without `DATABASE_URL` the leaderboard is kept in
memory and resets when the server restarts. To use the admin page locally, set
a password when you start the server, for example
`ADMIN_TOKEN=yourpassword npm run dev` or `ADMIN_TOKEN=yourpassword npm start`.

## Live screen and admin

- `/live` is a display-only top list for a TV or projector at the venue. It
  shows the address to play at, has no buttons and refreshes every 15 seconds.
  Add `?url=seanandbeckywedding.run` to override the address it shows.
- `/admin` lets you upload faces for Becky and the mates, and rename or delete
  scores. Sign in with the `ADMIN_TOKEN` password; without it the admin page is
  turned off. Tick **Auto-remove background** to erase the background with
  in-browser AI, or **Crop to a circle** for a round vignette. Faces are stored
  with the scores (in Postgres on Railway) and appear the next time someone loads the game.
  The bucket-hat detective defaults to a background-free photo head; an uploaded
  face overrides it, and removing that upload restores the bundled photo.
  Admin previews show the bundled default photos for Becky, deal, ping-pong and
  the bucket-hat detective when no custom face is uploaded.

## Deploy to Railway

Connect the GitHub repository and deploy the `main` branch with the repository
root as the service's root directory. Railway runs `npm run build`, then
`npm start` (`node src/server/server.ts`), which serves `dist/`, the `/top`
top-list page and the `/api/scores` leaderboard API on Railway's `PORT`.
Remove any old `RAILPACK_SPA_OUTPUT_DIR` or static-site overrides.

For a leaderboard that survives restarts, add a **Postgres** database to the
project and set the game service variable
`DATABASE_URL=${{Postgres.DATABASE_URL}}`. The scores table is created
automatically on first use. Node.js 24 or newer is required, as specified in
`package.json`. Generate a public domain in the service networking settings.
Set `ADMIN_TOKEN` to a long, unguessable password to turn on `/admin`.

## How to play

Sean automatically runs along a continuous city street towards Becky.
Sean uses background-free photo cutouts displayed at 180 world pixels tall,
with the original gameplay hitbox. The poses alternate every five seconds of active play.
Pausing freezes the photo cycle; a fresh run starts with the first pose.
Time your jumps over **seven hurdles** and seven separate distraction characters. Speed increases smoothly
from 300 to 430 world pixels per second as you approach the altar.
The city starts at night with stars and a moon, brightens gradually across the
course, and reaches full daylight at Becky. Pausing freezes the lighting;
replay restores the night.
The first hurdle arrives about four seconds after the start. If Sean reaches
the first character while the roughly six-second intro is still playing, that
character's line waits until the intro finishes. Later encounter spacing stays unchanged.

- **Space / W / Up**: one press, one full jump. Holding does not auto-jump.
- **Tap the game** or the mobile **JUMP** button for the same jump.
- On phones, the game fills the available browser viewport in portrait or
  landscape, with no page title, footer, borders or scrolling. Compact stats,
  captions, pause and jump controls overlay the game and respect screen safe
  areas. Browser address bars remain under the browser's control.
- **Escape / How to play / pause**: pause, resume or start a fresh run.
- The menu keeps keyboard and touch control instructions and detailed rules
  hidden until you select **How to play**; select it again to collapse them.
- Each hurdle hit or side collision with a person costs **one of three chances**,
  once per obstacle. There is no timer because the run is paced automatically.
  You keep running after a hit; the third hit ends the run and the result says
  **Too many distractions!**
- Passing a hurdle without touching it counts as a clear. People are positioned
  separately between hurdles. Jump over them or land on their heads while falling
  to squash them and bounce without losing a chance. Each person can
  be squashed once; a side-hit person is no longer collidable for that run.
  Each squash awards **5 bonus points**, added to the HUD's total points.
  Results show sweet points and squash bonuses separately.
  There is no steering, platform climbing, gap jumping or checkpoint system.
- Optional dice sweets score their face value, from **1 to 6**.
  Only the first two are at street level. The others sit near jump peaks above
  hurdles and around people's heads, including a sweet after each person that
  can be caught on a squash-bounce. These need tighter jump timing.
- Reach the flower arch to win. The result shows remaining chances, cleared
  hurdles and points. A clean run takes roughly 27 seconds.
  Sean and Becky meet with floating hearts, then the victory result appears
  after 3.2 seconds. Reduced motion uses a static reunion and hearts.
- **Double jump**: press again in the air for a second, higher jump.
- **Duck**: hold Down / S (or the mobile duck button) to slide under swooping pigeons.
  Hop over rolling beer barrels.
- **Champagne corks** launch a super jump up to **spinning wedding rings**
  worth 25 points each.
- **Combo multiplier**: clears, squashes and dodges build a capped multiplier;
  any hit resets it.
- **Becky's texts** pop up during the run and get more frantic near the end.
- Squashes throw confetti and shake the screen (not with reduced motion), and
  hits vibrate supporting phones.
- Your **best score** and name are remembered on this device.
- The end screen shows a short summary and compact stat chips. Post your name
  to the guest **leaderboard** and it opens the top list with your row
  highlighted. Names are checked for rude words and posting is rate-limited.
  **Share my place on the top list** shares (or copies) a `/top?you=<id>` link
  that opens the top 10 with your row highlighted, plus your rank if you are
  outside the top 10. The top list can also be opened from the main menu.
- Leaving the app pauses the run and sound; tapping again on return restarts
  the audio.
- Replay resets the route, chances, hurdle and person states, lighting and score.
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
Menu and dialog buttons play `src/assets/sounds/click.mp3` unless sound is off, and
posting to the top list plays `tada.mp3`. In play, recorded effects mark hits
(`bash`), squashes (`splat`), champagne corks (`cork`), rings (`sparkle`),
incoming pigeons (`flap`) and Becky's texts (`notify`).
Loading or decoding errors are reported in the status strip.
The four MP3s in `src/assets/sounds/` supply quiet, looping background music
during the run, `splat` on hurdle hits, person side hits and squashes, `gameover` on loss and `level_end` when
the couple meet. Music pauses with the game, resumes from its previous position,
and restarts on a fresh run. It stops at the finish or game over. Sound off mutes
music, recordings and generated effects together.
Captions remain visible without audio. Backgrounding or leaving the window
pauses the run. Reduced motion disables Sean's running bob
and floating-text movement, and makes squashes immediate.

## Structure

- `src/shared/level.ts`: course, speed progression, dice values and run rules.
- `src/client/scene.ts`: auto-running, buffered jumps, hurdle collisions and finish.
- `src/client/art.ts`: original procedural characters and tiled city artwork.
- `src/client/input.ts`: focus-scoped keyboard, game taps and jump button input.
- `src/client/audio.ts`: local sound effects and bundled voice playback.
- `src/client/main.ts`: lifecycle, dialogs, HUD, Becky's texts, best score,
  leaderboard and top-list sharing.
- `src/shared/leaderboard.ts`: score validation, name filter and top-list links.
- `src/shared/faces.ts`: characters that can have uploaded faces, and image checks.
- `src/client/live.ts`, `src/client/admin.ts`: the `/live` screen and `/admin` page.
- `src/server/`: Node server, leaderboard, faces and admin API, and
  Postgres/in-memory stores.

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
