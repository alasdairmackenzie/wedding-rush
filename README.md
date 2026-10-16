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

The main-menu badge counts down to 17 October 2026 using Europe/London dates,
shows **HAPPY WEDDING DAY!** on the day, then disappears. It updates automatically
across midnight and when returning to the page.

Click **faster** five times in **How to play** to enable a 75%-speed cheat for
the current page session. Sean's horizontal running speed is reduced by 25%
throughout the route; jumps and obstacles are unchanged. The instruction changes
to **Sean runs slowly as ever.** Cheat runs can be rewatched but cannot be posted
to the top list. Reloading turns the cheat off.
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

## Run replays

The results screen offers **Rewatch run** for the latest completed run (including
losses). Posting a score from the game also publishes its gameplay recording:
A **Replay** column with a **Watch** button appears in the top 10 and full results. The TV
leaderboard links to the score's watch button. Older scores have no replay.

Replays start paused, with play/pause, restart and a keyboard-accessible seek bar.
They are silent visual recordings using sampled positions, dice faces, score,
lives and collected-object state, not a physics re-simulation or video. Watching
does not submit scores, change personal bests, award badges or start another game.
The current artwork is reused, so later face uploads may change replay appearance.

Recordings exclude menu/pause time, sample at most every 50 ms, and are capped at
three minutes of active play and 1 MB per score upload. A run beyond that cap
reports replay unavailable and cannot be posted from the current game client.
Normal runs take under a minute. Replay version 1 is tied to this course layout;
future incompatible course changes must increment the format version.

`GET /api/replays/:scoreId` is public and returns `{ replay }`, or 404 for missing
recordings. Leaderboard responses include only `hasReplay`, not recording data.
PostgreSQL stores the recording transactionally with its score in `score_replays`;
deleting the score removes its replay. Memory mode retains recordings only for
its retained 500 scores and loses them on restart. Legacy API clients may still
submit scores without recordings. Upload validation bounds the format and checks
the final score/result/squash count; it is not authoritative anti-cheat verification.

## Live screen and admin

- `/live` is a top list for a TV or projector at the venue. It
  shows the address to play at, has a **Back to game** link and refreshes every 15 seconds.
  Add `?url=seanandbeckywedding.run` to override the address it shows.
  The home menu footer groups **Share with friends**, **Live scores** and the **How to play** instructions toggle.
  Its **Live scores** link opens an auto-refreshing list
  in the game, so returning to the menu preserves a paused run or completed result.
- `/admin` opens `/admin/stats` for usage analytics. Admin navigation links to
  `/admin/photos` for face uploads and `/admin/scores` to rename or delete
  scores. On mobile, score details and actions wrap below a wide name field.
  Sign in with the `ADMIN_TOKEN` password; without it the admin page is
  turned off. Tick **Auto-remove background** to erase the background with
  in-browser AI, or **Crop to a circle** for a round vignette. Faces are stored
  with the scores (in Postgres on Railway) and appear the next time someone loads the game.
  The bucket-hat detective defaults to a background-free photo head; an uploaded
  face overrides it, and removing that upload restores the bundled photo.
  Its in-game photo head is 60% taller than the usual height; the body and hitbox stay unchanged.
  The Karaoke King, tube mate, pub regular and football fan also default to background-free photo heads.
  Admin previews show the bundled default photos for Becky, deal, ping-pong,
  the bucket-hat detective, Karaoke King, tube mate, pub regular and football fan when no custom face is uploaded.

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
Sean uses background-free photo cutouts displayed at 135 world pixels tall,
with the original gameplay hitbox. The second pose appears when Sean jumps
or bounces, returning to the first pose when he lands. Pausing preserves the
current pose; a fresh run starts with the first pose. There is no timed cycling.
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
  Each fresh run rolls new faces with a uniformly chosen combined base total
  of **90–162 points** across the 27 dice. Pausing/resuming keeps the same faces;
  restarting or replaying rolls again. Combo multipliers still apply, so leaderboard
  scores now reflect luck as well as skill. Results show that run's available sweet total.
  Three extra dice sit in selected gaps between characters at normal jump height,
  with 350 pixels before the next hurdle. They award face-value points with the normal combo multiplier.
  An extra 400 pixels before the dealer's hurdle gives roughly 1.2 seconds more
  breathing room, with one more jump-height die worth 3 points in that stretch.
  Later obstacles and the finish shift together, preserving their spacing.
  Only the first two are at street level. The others sit near jump peaks above
  hurdles and around people's heads, including a sweet after each person that
  can be caught on a squash-bounce. These need tighter jump timing.
- Reach the flower arch to win. The result shows remaining chances, cleared
  hurdles and points. A clean run takes roughly 41 seconds, including the dealer lead-in and extended final stretch.
  The hat-to-Becky stretch is 800 pixels, giving roughly half a second more running time than before.
  Sean and Becky meet with floating hearts, then the victory result appears
  after 3.2 seconds. Reduced motion uses a static reunion and hearts.
- **Double jump**: press again in the air for a second, higher jump.
- **Duck**: hold Down / S (or the mobile duck button) to slide under swooping pigeons.
  Hop over rolling beer barrels.
- **Champagne corks** launch a super jump up to **spinning wedding rings**
  worth 25 points each.
- Two orange **4× concentrate** bottles appear before the mid-run and final
  hurdle stretches, with a larger orange-fruit bottle and a **4× ORANGE SQUASH**
  sign explaining the effect before collection. Each gives **four seconds of invincibility** with an orange
  glow and a countdown. Run through hurdles, mates, barrels and pigeons without
  losing a chance or breaking a combo; jumping and champagne still work.
  Passing through a mate earns no squash bonus; landing on their head still does.
  There is no extra score multiplier. Pausing freezes the effect and replay
  restores both bottles.
- **Combo multiplier**: clears, squashes and dodges build a capped multiplier;
  any hit resets it.
- **Close shaves**: overlap a barrel horizontally while passing 0–18 world
  pixels above it, or duck 0–18 pixels below a pigeon, then pass it without a hit.
  Each obstacle awards a flat **5 points** once, without a combo multiplier.
  Squash invincibility and disco-mode passes are excluded.
- **My Achievements**: full-width main-menu and results-screen buttons show a medal icon and an earned/total count (for example, **My Achievements (2/4)**), and open progress for all seven mates squashed, all three
  rings collected, bucket hat found, and finishing without a hit. Badges add no
  points; earned badges persist on this device, with newly earned badges
  highlighted and current-run progress shown. Storage failures are reported.
  Opening achievements from the menu returns to the menu without resuming a paused run.
  Viewing in-progress achievements does not save badges before the run ends.
  Winning results show a compact lives-left stat instead of the arrival sentence.
- **Final bucket hat**: the background-free photo of Sean's actual hat appears
  at 72×80 world pixels in the final stretch before Becky, with a jump prompt
  and a forgiving 90×100 collection area. A normal jump collects
  it once for a flat **50 points**, unaffected by combo multipliers. It is
  optional for winning, shown separately in results, and restored on replay.
  Sean wears the collected hat over his photo through jumps, ducks and the
  wedding reunion. A fresh run removes the worn hat.
- **Becky's texts** pop up during the run, stay visible for four seconds and get more frantic near the end.
- Squashes throw confetti and shake the screen (not with reduced motion), and
  hits vibrate supporting phones.
- Your **best score** and name are remembered on this device.
- The end screen shows a short summary and compact stat chips. Post your name
  to the guest **leaderboard** and it opens the top list with your row
  highlighted. Names are checked for rude words and posting is rate-limited.
  **Share my place on the top list** shares (or copies) a `/top?you=<id>` link
  that opens the top 10 with your row highlighted, plus your rank if you are
  outside the top 10. The top list can also be opened from the main menu.
  **Full results — top 100** below the table opens a separate results screen with up to 100 ranked guests.
  Both lists share a **Hide duplicate names** switch (off by default). When on,
  each name appears once, ignoring capitalisation, with its best score retained
  before the top 10/100 limit is applied. Ranks reflect the filtered list;
  shared links to a lower duplicate show that name's best entry instead.
  The switch lasts for the current page session and does not change `/live` or admin.
  Returning to the top list preserves the current score and navigation context.
  **Back to results** and **Back to menu** sit side by side when both are available.
  **Back to results** returns from the top list or **My Achievements** without losing
  your score, name or posting status. The menu also offers **Back to results**
  until you start another run. Closing Share returns to the menu without resuming
  a paused game.
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
Sound effects and bundled ElevenLabs voice recordings can be turned off independently from the main music.
The eight MP3s in `src/shared/sounds/` play the intro on a fresh run and each
distraction's matching clip when the person approaches. Clips load on demand,
are decoded and cached locally, and ship with the production build. No API
key, ElevenLabs connection or browser speech synthesis is used during play.
Voice recordings play at 70% gain. Only one voice plays at a time; a new clip replaces the previous one.
Pause, turning sound effects off, ending a run and leaving the page stop voice playback and cancel
pending playback. Resuming does not repeat the intro; replay does.
Menu and dialog buttons play `src/assets/sounds/click.mp3` unless sound effects are off, and
posting to the top list plays `tada.mp3`. In play, recorded effects mark hits
(`bash`), squashes (`splat`), champagne corks (`cork`), rings (`sparkle`),
incoming pigeons (`flap`) and Becky's texts (`notify`).
Collecting any dice sweet plays both `dice.mp3` and the original generated pickup tone,
once per collected die, and respects Sound effects On/Off.
Loading or decoding errors are reported in the status strip.
Music has a single On/Off toggle. When enabled, the original Classic track plays on the main menu
(including the pause menu) at 20% gain, and `dnbloop.mp3` plays during the run at 50% gain.
Menu music starts once browser audio is unlocked by a tap or key press and stops when the menu closes
or the page is backgrounded. DnB resumes from its previous position when returning to a paused run.
`bash` plays on hurdle and person side hits; `splat` plays on head squashes.
Character side hits and head squashes also randomly choose `ourch.mp3`, `oi.mp3` or `hey.mp3` alongside the impact sound,
with a fresh random pitch between three semitones lower and higher. Both respect Sound effects On/Off.
On the "Too many distractions!" loss screen, `lose_horn.mp3` and `lose_you_lose.mp3`
start together, replacing the old `gameover` effect.
Both respect Sound effects On/Off and stop when leaving the results or restarting.
`level_end` plays when the couple meet. Music pauses with the game, resumes from its previous position,
and restarts on a fresh run. Main music stops at the finish or game over. The music setting only controls
the main loop; the wedding music after the couple meet plays at 60% gain. Sound effects independently
control recordings, generated effects and menu sounds.
Captions remain visible without audio. Backgrounding or leaving the window
pauses the run. Reduced motion disables Sean's running bob
and floating-text movement, and makes squashes immediate.

## Usage analytics

The `/admin` page includes anonymous usage analytics with 24-hour, 7-day,
30-day and 90-day filters. It shows unique browsers and tab sessions, games
started, fresh restarts, play-again runs, resumes, wins/losses, score attempts
and saved scores, successful sharing and live-page visits. Screen and action
tables include unique browsers; daily UTC activity, input-device and entry-source
breakdowns help explain usage. The input-device table also shows game starts and
the average games played per unique browser that started a game, grouped by
touch or desktop input. These anonymous browser IDs are not a count of people or
physical devices. Refresh manually to update the dashboard.

The **Player journey** diagram connects game opens and play sessions to runs,
menu/pause and resume, win/loss, unfinished runs and server-confirmed score posts.
Opens and play conversion use correlated tab sessions; later stages use distinct
started runs. Menu visits can overlap outcomes. Arrows show stage relationships,
not a chronological clickstream or traffic volume. Only events received within
the selected period are included. Expand **View journey counts** for the text
alternative, including score-post attempts.

The hourly chart shows 12 UTC hourly buckets, independently of the selected
reporting period. **Hourly measure** switches between **Devices** (each browser
starting a game counts once per hour, even across tabs or replays) and **Plays**
(every recorded game start, including repeats). Devices are browsers, not physical
devices or identifiable people. Empty hours show zero.
**Previous** and **Next** browse adjacent 12-hour windows within the
90-day retention period; **Latest** returns to the current partial hour and
previous 11. The UTC date range is shown above the chart. Refreshing or changing
the report period preserves the hourly page and measure. Expand **View hourly
counts** for exact dates and values; it follows the selected measure.

The public live scores page also shows **Active in the last 15 minutes**:
unique anonymous browsers with a visible game page during that rolling window.
Visible game pages send a heartbeat on entry/return and once a minute; hidden
tabs and the live scores display do not send presence heartbeats. The count
refreshes every 15 seconds, independently of leaderboard failures. It respects
analytics opt-out, Do Not Track and Global Privacy Control, so it can undercount.
Presence stores only a browser UUID and its latest server receipt time, separate
from analytics events. PostgreSQL shares presence across app instances and removes
expired records at startup and at most hourly on use; memory mode resets on restart.

Tracking uses a random UUID in localStorage and a tab-session UUID in
sessionStorage, plus a fresh run UUID for each new game. It does **not** fingerprint
devices or record IP addresses, player names, full URLs, referrers or user-agent
strings in analytics. Browser IDs count browsers, not people: clearing storage,
private browsing and switching devices change identity. If browser storage is
unavailable, page-local IDs are used with a console warning.

The menu is unchanged. Do Not Track and Global Privacy Control disable collection
automatically. Visiting `/?analytics=off` saves an opt-out for this browser and
clears its IDs; visiting `/?analytics=on` re-enables collection unless a browser
privacy signal forbids it. This preference also applies to the same-origin live
screen. Opt-out does not retract already-delivered events.
Check applicable consent/privacy requirements before deploying; this technical
opt-out is not a legal compliance guarantee.

Events are batched to the first-party `/api/analytics` endpoint every two seconds,
with keepalive delivery when hidden/leaving, bounded retries and event-ID
deduplication. No external analytics service is used. The ingestion endpoint
validates an allowlist, limits payload/batch sizes, rejects cross-site browser
requests and rate-limits using IPs transiently in memory (never in analytics).
Delivery is best-effort: blocked requests, offline browsers and abrupt exits
can undercount. Client events are not fraud-proof or a source of billing truth.

Score conversions are written by the server **only after a valid score is saved**,
in the same PostgreSQL transaction as the score. The dashboard distinguishes
attempts, validation errors and failures from saved conversions. The run funnel
counts distinct starts and outcomes within the selected period, including
finish-and-save and loss-and-save; unfinished includes active runs and missing
telemetry, not just abandonment. Results are counted once per run, while
returning to a dialog counts another screen impression. Pauses/resumes do not
start another game. Gameplay progress records 25/50/75/100% once per run.

Share successes mean clipboard writes or a resolved native share dialog, not
message delivery or recipient counts. Game share links and QR codes carry
`from=share`; live QR links carry `from=live`; incoming `/top?you=...` links are
classified as shared scores. No QR scans are inferred without a page visit.
Live visits are page loads, not 15-second automatic refreshes. Admin page views
are not tracked.

PostgreSQL creates `analytics_events` automatically at server startup and retains
events for 90 days. Expired rows are removed at startup and at most hourly on
ingestion/reporting; no pruning occurs while the server is idle. Development and
servers without `DATABASE_URL` use an in-memory store, clearly labelled in admin,
which resets on restart. Analytics start at deployment; historical games cannot
be reconstructed. Reporting requires the existing `ADMIN_TOKEN` authentication
and returns aggregates only, never individual browser IDs.

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
