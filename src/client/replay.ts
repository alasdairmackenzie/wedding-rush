import { BRIDE, BUCKET_HAT, concentrates, corks, hurdles, movers, people, rings, sweets, WORLD } from '../shared/level';
import { isReplay, type Replay } from '../shared/replay';

type Texture = (key: string) => HTMLImageElement | HTMLCanvasElement;

export function createReplayViewer(texture: Texture) {
  const dialog = document.querySelector<HTMLDialogElement>('#replay-dialog')!;
  const canvas = document.querySelector<HTMLCanvasElement>('#replay-canvas')!;
  const status = document.querySelector<HTMLElement>('#replay-status')!;
  const title = document.querySelector<HTMLElement>('#replay-title')!;
  const play = document.querySelector<HTMLButtonElement>('#replay-play')!;
  const restart = document.querySelector<HTMLButtonElement>('#replay-restart')!;
  const seek = document.querySelector<HTMLInputElement>('#replay-seek')!;
  const close = document.querySelector<HTMLButtonElement>('#replay-close')!;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the replay canvas.');
  const ctx = context;
  let recording: Replay | undefined;
  let time = 0;
  let lastTime = 0;
  let animation = 0;
  let request = 0;
  let opener: HTMLElement | undefined;
  let playing = false;
  const duration = () => recording?.frames.at(-1)?.[0] ?? 0;
  const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

  function pause(): void {
    playing = false;
    cancelAnimationFrame(animation);
    play.textContent = 'Play replay';
  }
  function draw(): void {
    if (!recording) return;
    const frames = recording.frames;
    let index = frames.findIndex(frame => frame[0] > time);
    if (index < 0) index = frames.length;
    const frame = frames[Math.max(0, index - 1)];
    const next = frames[Math.min(index, frames.length - 1)];
    const fraction = next[0] === frame[0] ? 0 : (time - frame[0]) / (next[0] - frame[0]);
    const interpolate = (column: number) => frame[column] + (next[column] - frame[column]) * fraction;
    const x = interpolate(1);
    const y = interpolate(2);
    const camera = Math.max(0, Math.min(WORLD.width - 1280, x - 530));
    const has = (column: number, id: number) => Boolean(frame[column] & 1 << id);
    const sprite = (key: string, px: number, py: number, width?: number, height?: number, bottom = false) => {
      if (px < camera - 200 || px > camera + 1480) return;
      const image = texture(key);
      const w = width ?? image.width;
      const h = height ?? image.height;
      ctx.drawImage(image, px - w / 2, py - (bottom ? h : h / 2), w, h);
    };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(canvas.width / 1280, canvas.height / 720);
    const daylight = Math.max(0, Math.min(1, x / BRIDE.x));
    ctx.fillStyle = `rgb(${40 + daylight * 204}, ${40 + daylight * 172}, ${75 + daylight * 113})`;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.translate(-camera, 0);
    for (let tile = Math.floor(camera / 1024) * 1024; tile < camera + 1280; tile += 1024) {
      ctx.drawImage(texture(`city-${tile}`), tile, 0);
    }
    ctx.fillStyle = `rgba(25, 30, 65, ${(1 - daylight) * .35})`;
    ctx.fillRect(camera, 0, 1280, 720);
    sweets.forEach((sweet, id) => {
      if (!has(7, id)) sprite(`sweet-${recording!.dice[id]}`, sweet.x, sweet.y);
    });
    hurdles.forEach((hurdle, id) => {
      ctx.globalAlpha = has(9, id) ? .35 : 1;
      ctx.fillStyle = '#302825';
      ctx.fillRect(hurdle.x - 28, 610 - hurdle.height, 8, hurdle.height);
      ctx.fillRect(hurdle.x + 20, 610 - hurdle.height, 8, hurdle.height);
      ctx.fillStyle = ['#b84b64', '#578878', '#795777'][id % 3];
      ctx.fillRect(hurdle.x - 36, 610 - hurdle.height, 72, 24);
      ctx.fillStyle = '#fff8e8';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('JUMP', hurdle.x, 627 - hurdle.height);
    });
    ctx.globalAlpha = 1;
    people.forEach((person, id) => {
      const squashed = has(8, id);
      ctx.globalAlpha = has(11, id) ? .5 : 1;
      const image = texture(person.temptation.kind);
      sprite(person.temptation.kind, person.x, 610, image.width * 1.1, image.height * (squashed ? .25 : 1.1), true);
    });
    ctx.globalAlpha = 1;
    movers.forEach((mover, id) => sprite(mover.kind, interpolate(15 + id), mover.y));
    corks.forEach((cork, id) => { if (!has(13, id)) sprite('champagne', cork.x, cork.y); });
    rings.forEach((ring, id) => { if (!has(12, id)) sprite('ring', ring.x, ring.y); });
    concentrates.forEach((bottle, id) => { if (!has(14, id)) sprite('concentrate', bottle.x, bottle.y); });
    if (!(frame[6] & 2)) sprite('bucket-hat', BUCKET_HAT.x, BUCKET_HAT.y, 72, 80);
    sprite('bride', BRIDE.x, 624, 125, 146, true);
    const photo = frame[6] & 4 ? 'groom-photo-alt' : 'groom-photo';
    const image = texture(photo);
    const height = frame[6] & 1 ? 135 * .55 : 135;
    if (frame[6] & 8) {
      ctx.fillStyle = '#ff8c2455';
      ctx.beginPath(); ctx.ellipse(x, y - 20, 55, 85, 0, 0, Math.PI * 2); ctx.fill();
    }
    sprite(photo, x, y + 40, 135 * image.width / image.height, height, true);
    if (frame[6] & 2) sprite('bucket-hat', x, y + 40 - height * .945, 36, 32);
    ctx.restore();
    seek.value = String(Math.round(time));
    seek.setAttribute('aria-valuetext', `${clock(time)} of ${clock(duration())}`);
    const finished = time >= duration();
    const summary = `${clock(time)} / ${clock(duration())} · ${frame[3]} points · ${frame[4]}/3 lives · ×${frame[5]} combo${finished ? recording.won ? ' · Made it to Becky!' : ' · Out of chances' : ''}`;
    if (status.textContent !== summary) status.textContent = summary;
    const description = `Recorded run at ${clock(time)}: ${frame[3]} points, ${frame[4]} lives remaining.`;
    if (canvas.getAttribute('aria-label') !== description) canvas.setAttribute('aria-label', description);
  }
  function tick(now: number): void {
    if (!playing) return;
    time = Math.min(duration(), time + now - lastTime);
    lastTime = now;
    try { draw(); } catch (error) { fail(error); return; }
    if (time >= duration()) pause();
    else animation = requestAnimationFrame(tick);
  }
  function fail(error: unknown): void {
    console.error('Replay could not be shown.', error);
    pause();
    recording = undefined;
    play.disabled = restart.disabled = seek.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    status.textContent = error instanceof Error ? error.message : 'Replay unavailable. Close and try again.';
  }
  play.addEventListener('click', () => {
    if (playing) { pause(); return; }
    if (!recording) return;
    if (time >= duration()) time = 0;
    playing = true;
    play.textContent = 'Pause replay';
    lastTime = performance.now();
    animation = requestAnimationFrame(tick);
  });
  restart.addEventListener('click', () => { pause(); time = 0; draw(); });
  seek.addEventListener('input', () => { pause(); time = Number(seek.value); draw(); });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { ++request; pause(); recording = undefined; opener?.focus(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);

  return {
    get open() { return dialog.open; },
    async show(source: Replay | string, label: string): Promise<void> {
      const current = ++request;
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      pause();
      recording = undefined;
      title.textContent = label;
      status.textContent = 'Loading replay…';
      play.disabled = restart.disabled = seek.disabled = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!dialog.open) dialog.showModal();
      try {
        let data: unknown = source;
        if (typeof source === 'string') {
          const response = await fetch(`/api/replays/${encodeURIComponent(source)}`, { signal: AbortSignal.timeout(15_000) });
          if (!response.ok) throw new Error(response.status === 404 ? 'No replay is available for that score.' : 'Replay could not be loaded. Close and try again.');
          data = (await response.json() as { replay?: unknown }).replay;
        }
        if (!dialog.open || current !== request) return;
        if (!isReplay(data)) throw new Error('This replay is invalid or uses an unsupported game version.');
        recording = data;
        time = 0;
        seek.max = String(duration());
        play.disabled = restart.disabled = seek.disabled = false;
        draw();
      } catch (error) {
        if (dialog.open && current === request) fail(error);
      }
    },
  };
}
