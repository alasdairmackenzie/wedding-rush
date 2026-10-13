import Phaser from 'phaser';
import { BRIDE, platforms, temptations, WORLD, type TemptationKind } from '../shared/level';

const INK = '#352b3c';
function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const image = document.createElement('canvas');
  image.width = width; image.height = height;
  const context = image.getContext('2d');
  if (!context) throw new Error('Your browser could not create the drawing canvas.');
  context.strokeStyle = INK;
  context.lineWidth = 2.5;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  return [image, context];
}
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.stroke();
}
function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath(); c.roundRect(x, y, w, h, 2); c.fill(); c.stroke();
}
function line(c: CanvasRenderingContext2D, points: number[]): void {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.stroke();
}

function person(scene: Phaser.Scene, kind: TemptationKind | 'groom' | 'bride'): void {
  const [image, c] = canvas(kind === 'hat' ? 148 : 96, kind === 'hat' ? 162 : 112);
  if (kind === 'hat') c.translate(26, 50);
  const bride = kind === 'bride';
  const colours = { groom: '#39475f', bride: '#fffcf4', football: '#d36577', deal: '#a68ad0',
    pingpong: '#62b8ae', hat: '#dabf74', pub: '#799bd4', karaoke: '#c980ac', kebab: '#ce995e' };
  const skin = kind === 'pingpong' || kind === 'karaoke' ? '#a87352' : '#f2c5a0';
  oval(c, 48, 106, 28, 3, '#352b3c22');
  box(c, 32, 78, 11, 24, bride ? '#fffcf4' : '#36405a');
  box(c, 51, 78, 11, 24, bride ? '#fffcf4' : '#36405a');
  oval(c, 37, 102, 10, 4, '#34303b');
  oval(c, 58, 102, 10, 4, '#34303b');
  if (bride) {
    c.fillStyle = '#fffcf4';
    c.beginPath(); c.moveTo(34, 51); c.lineTo(59, 51); c.lineTo(79, 100); c.lineTo(19, 100); c.closePath(); c.fill(); c.stroke();
    line(c, [38, 60, 32, 92]); line(c, [57, 60, 65, 92]);
    oval(c, 49, 33, 25, 29, '#ffffffaa');
  } else box(c, 29, 47, 36, 35, colours[kind]);
  const uploaded = scene.textures.exists(`${kind}-face`);
  if (uploaded || bride || kind === 'pingpong' || kind === 'deal' || kind === 'hat') {
    const headKey = uploaded ? `${kind}-face` : `${kind}-head`;
    const head = scene.textures.get(headKey).getSourceImage();
    if (!(head instanceof HTMLImageElement)) throw new Error(`Head photo is not loaded: ${headKey}`);
    const height = kind === 'hat' ? 100 : 50, width = head.width / head.height * height;
    c.drawImage(head, 48 - width / 2, 52 - height, width, height);
  } else {
    oval(c, 48, 29, 17, 20, skin);
    c.fillStyle = '#503c35';
    c.beginPath(); c.arc(47, 23, 17, Math.PI, 2 * Math.PI); c.fill();
    line(c, [34, 23, 40, 19, 51, 19]);
    c.fillStyle = INK; c.fillRect(53, 25, 3, 4);
    line(c, [54, 38, 61, 36]);
  }
  c.strokeStyle = skin; c.lineWidth = 8;
  line(c, [32, 53, 24, 71]); line(c, [62, 54, 72, 64]);
  c.strokeStyle = INK; c.lineWidth = 2;
  if (kind === 'groom') {
    c.fillStyle = '#fff9e8';
    c.beginPath(); c.moveTo(38, 48); c.lineTo(56, 48); c.lineTo(48, 72); c.closePath(); c.fill();
    c.fillStyle = '#cc5b76';
    c.beginPath(); c.moveTo(38, 51); c.lineTo(55, 58); c.lineTo(55, 51); c.lineTo(38, 58); c.closePath(); c.fill();
    oval(c, 60, 59, 4, 4, '#f3b8bf');
    box(c, 66, 73, 20, 14, '#f3d2a0');
    line(c, [70, 73, 70, 68, 81, 68, 81, 73]);
  } else if (bride) {
    for (const [x, y] of [[69, 58], [76, 56], [80, 63], [70, 66]]) oval(c, x, y, 5, 5, '#d66b8b');
    c.strokeStyle = '#528d72'; line(c, [72, 63, 73, 76]);
    c.strokeStyle = INK;
    box(c, 34, 4, 28, 4, '#f4d383');
  } else if (kind === 'football') {
    c.fillStyle = '#fff9e8'; c.font = 'bold 18px monospace'; c.fillText('9', 40, 71);
    oval(c, 76, 77, 13, 13, '#fff9e8');
    oval(c, 76, 77, 4, 4, INK);
    line(c, [68, 67, 74, 73, 85, 69]); line(c, [66, 83, 74, 80, 80, 88]);
  } else if (kind === 'deal') {
    box(c, 63, 61, 19, 25, '#fff9e8');
    c.fillStyle = '#cc4665'; c.font = 'bold 16px serif'; c.fillText('A', 68, 79);
    box(c, 76, 57, 15, 24, '#e0c6f1');
  } else if (kind === 'pingpong') {
    line(c, [72, 78, 75, 62]); oval(c, 77, 57, 10, 13, '#e77379');
    oval(c, 87, 42, 4, 4, '#fff9e8');
  } else if (kind === 'hat') {
    oval(c, 77, 62, 10, 10, '#c1e9f0aa');
    line(c, [69, 70, 63, 82]);
  } else if (kind === 'pub') {
    box(c, 68, 55, 17, 25, '#e6b64b');
    box(c, 85, 61, 7, 13, '#fff9e833');
    oval(c, 76, 56, 9, 4, '#fff9e8');
  } else if (kind === 'karaoke') {
    line(c, [72, 71, 76, 52]); oval(c, 77, 49, 6, 8, '#69778c');
    c.fillStyle = INK; c.font = '22px serif'; c.fillText('♪', 80, 28);
    if (!uploaded) box(c, 34, 25, 28, 7, '#352b3c');
  } else {
    c.fillStyle = '#f0ca81';
    c.beginPath(); c.moveTo(67, 55); c.lineTo(88, 55); c.lineTo(79, 85); c.closePath(); c.fill(); c.stroke();
    for (let i = 0; i < 4; i++) oval(c, 70 + i * 4, 54 + i % 2 * 4, 4, 4, i % 2 ? '#66986b' : '#c36452');
  }
  scene.textures.addCanvas(kind, image);
}

export function makeTextures(scene: Phaser.Scene): void {
  person(scene, 'groom'); person(scene, 'bride');
  temptations.forEach(temptation => person(scene, temptation.kind));
  for (let value = 1; value <= 6; value++) {
    const [image, c] = canvas(46, 40);
    const fill = ['#ffd98a', '#f4a4bb', '#b9a1e3', '#91cbbb', '#9ec4eb', '#f3b183'][value - 1];
    c.lineWidth = 2;
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(9, 6); c.lineTo(15, 1); c.lineTo(43, 1); c.lineTo(37, 6);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffffff66';
    c.fill();
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(37, 6); c.lineTo(43, 1); c.lineTo(43, 29); c.lineTo(37, 34);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#352b3c33';
    c.fill();
    box(c, 9, 6, 28, 28, fill);
    const dots = value === 1 ? [[23, 20]]
      : value === 2 ? [[16, 12], [30, 27]]
      : value === 3 ? [[16, 12], [23, 20], [30, 27]]
      : value === 4 ? [[16, 12], [30, 12], [16, 27], [30, 27]]
      : value === 5 ? [[16, 12], [30, 12], [23, 20], [16, 27], [30, 27]]
      : [[16, 12], [30, 12], [16, 20], [30, 20], [16, 27], [30, 27]];
    c.fillStyle = INK;
    for (const [x, y] of dots) { c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill(); }
    scene.textures.addCanvas(`sweet-${value}`, image);
  }
  extras(scene);
}

function extras(scene: Phaser.Scene): void {
  {
    const [image, c] = canvas(52, 52);
    oval(c, 26, 26, 23, 23, '#a8693c');
    c.strokeStyle = '#5b3a22'; c.lineWidth = 4;
    for (const r of [8, 16]) { c.beginPath(); c.arc(26, 26, r, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = INK; c.lineWidth = 2.5;
    line(c, [6, 26, 46, 26]); line(c, [26, 6, 26, 46]);
    c.fillStyle = '#fff8e8'; c.font = 'bold 11px monospace'; c.textAlign = 'center';
    c.fillText('ALE', 26, 30);
    scene.textures.addCanvas('barrel', image);
  }
  {
    const [image, c] = canvas(64, 44);
    oval(c, 30, 26, 18, 11, '#8e98a8');
    oval(c, 47, 18, 9, 8, '#8e98a8');
    c.fillStyle = '#6f9a7c'; c.beginPath(); c.arc(44, 24, 5, 0, Math.PI); c.fill();
    c.fillStyle = '#e8a03c'; c.beginPath(); c.moveTo(55, 17); c.lineTo(63, 20); c.lineTo(55, 22); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(49, 16, 1.8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6c7585'; c.beginPath(); c.moveTo(20, 22); c.lineTo(34, 4); c.lineTo(38, 22); c.closePath(); c.fill(); c.stroke();
    line(c, [12, 26, 2, 22]); line(c, [12, 28, 2, 32]);
    scene.textures.addCanvas('pigeon', image);
  }
  {
    const [image, c] = canvas(40, 40);
    c.strokeStyle = '#c9952a'; c.lineWidth = 6;
    c.beginPath(); c.arc(20, 23, 12, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 1.5;
    c.beginPath(); c.arc(20, 23, 15, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(20, 23, 9, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#d9f4ff'; c.beginPath(); c.moveTo(20, 2); c.lineTo(27, 9); c.lineTo(20, 14); c.lineTo(13, 9); c.closePath(); c.fill(); c.stroke();
    scene.textures.addCanvas('ring', image);
  }
  {
    const [image, c] = canvas(28, 60);
    box(c, 8, 22, 12, 34, '#2f6b4c');
    box(c, 11, 8, 6, 16, '#2f6b4c');
    box(c, 10, 2, 8, 8, '#d9b25a');
    box(c, 8, 32, 12, 12, '#f3e6c2');
    scene.textures.addCanvas('champagne', image);
  }
}

export function drawCity(scene: Phaser.Scene): (daylight: number) => void {
  const [sky, c] = canvas(1600, 720);
  const sunset = c.createLinearGradient(0, 0, 0, 720);
  sunset.addColorStop(0, '#82bdce'); sunset.addColorStop(.6, '#f4d4bc'); sunset.addColorStop(1, '#f6e5c7');
  c.fillStyle = sunset; c.fillRect(0, 0, 1600, 720);
  c.strokeStyle = '#f5d68a';
  oval(c, 1300, 150, 55, 55, '#fff0bc');
  c.strokeStyle = '#ffffff66';
  for (let i = 0; i < 9; i++) {
    const x = i * 190, y = 85 + i * 47 % 130;
    oval(c, x, y, 65, 15, '#ffffff88');
  }
  c.strokeStyle = '#728ea044';
  for (let x = 0; x < 1600; x += 105) {
    const height = 120 + x * 13 % 190;
    box(c, x, 540 - height, 85, height, '#97acb5');
  }
  scene.textures.addCanvas('sky', sky);
  scene.add.tileSprite(0, 0, WORLD.width, WORLD.height, 'sky').setOrigin(0).setName('day-sky');
  const [night, n] = canvas(1600, 720);
  const nightGradient = n.createLinearGradient(0, 0, 0, 720);
  nightGradient.addColorStop(0, '#10152f');
  nightGradient.addColorStop(.6, '#303858');
  nightGradient.addColorStop(1, '#625c78');
  n.fillStyle = nightGradient;
  n.fillRect(0, 0, 1600, 720);
  n.fillStyle = '#fff4d4';
  for (let id = 0; id < 85; id++) {
    const x = (id * 173 + 37) % 1600, y = (id * 89 + 25) % 310;
    n.beginPath(); n.arc(x, y, id % 3 === 0 ? 1.8 : 1, 0, Math.PI * 2); n.fill();
  }
  n.strokeStyle = '#fff4d4';
  oval(n, 1300, 150, 42, 42, '#fff4d4');
  n.strokeStyle = '#10152f';
  oval(n, 1318, 135, 38, 38, '#10152f');
  scene.textures.addCanvas('night-sky', night);
  const nightSky = scene.add.tileSprite(0, 0, WORLD.width, WORLD.height, 'night-sky')
    .setOrigin(0).setName('night-sky');
  const cityTiles: Phaser.GameObjects.Image[] = [];
  const [city, d] = canvas(WORLD.width, WORLD.height);
  const palette = ['#edb5a1', '#a8cdbf', '#efd290', '#c5b8dc', '#a9c8de'];
  const signs = ['SWEET TALK', 'THE EXTRA TIME', 'DEAL ME IN', 'PING & PONG', 'HATS OFF', 'ONE MORE PINT', 'OPEN MIC', 'KEBAB CORNER'];
  for (let i = 0; i < Math.ceil(WORLD.width / 215); i++) {
    const x = i * 215 - 20, height = 230 + i * 71 % 150, y = 610 - height;
    d.strokeStyle = '#64505c'; d.lineWidth = 3;
    box(d, x, y, 206, height, palette[i % palette.length]);
    d.save(); d.beginPath(); d.rect(x + 3, y + 3, 200, height - 6); d.clip();
    d.strokeStyle = '#ffffff55'; d.lineWidth = 1;
    for (let s = 0; s < 80; s++) {
      const sx = x + s * 37 % 200, sy = y + s * 53 % height;
      line(d, [sx, sy, sx + 35, sy - 38]);
    }
    d.restore();
    box(d, x - 4, y - 9, 214, 16, '#f7e5cf');
    for (let row = 0; row < Math.floor((height - 80) / 68); row++) {
      for (let col = 0; col < 3; col++) {
        const wx = x + 21 + col * 59, wy = y + 25 + row * 68;
        box(d, wx, wy, 34, 43, '#f4e4b6');
        line(d, [wx + 17, wy, wx + 17, wy + 43]);
        line(d, [wx, wy + 22, wx + 34, wy + 22]);
      }
    }
    box(d, x + 12, 537, 180, 30, i % 2 ? '#b46d83' : '#578878');
    d.fillStyle = '#fff8e8'; d.font = 'bold 14px monospace'; d.textAlign = 'center';
    d.fillText(signs[i % signs.length], x + 102, 557);
    box(d, x + 23, 572, 46, 38, '#796b7f');
    box(d, x + 80, 576, 98, 33, '#dbecde');
    if (i % 3 === 1) {
      line(d, [x + 192, y + 45, x + 192, 530]);
      for (let step = y + 50; step < 530; step += 21) line(d, [x + 179, step, x + 203, step]);
    }
  }
  d.strokeStyle = INK;
  for (const p of platforms) {
    box(d, p.x, p.y, p.width, p.height, p.kind === 'street' ? '#807b8b' : '#9e7f8f');
    box(d, p.x, p.y, p.width, p.kind === 'street' ? 15 : 7, '#ede1cc');
    if (p.kind === 'street') {
      d.strokeStyle = '#bdb3c3';
      for (let x = p.x + 30; x < p.x + p.width; x += 90) line(d, [x, 671, x + 40, 671]);
      d.strokeStyle = INK;
    }
  }
  for (let x = 150; x < BRIDE.x - 200; x += 430) {
    line(d, [x, 610, x, 455, x + 25, 455]);
    oval(d, x + 25, 466, 10, 14, '#fff0ad');
    box(d, x + 85, 583, 35, 27, '#b87f79');
    oval(d, x + 102, 571, 26, 22, '#80ad88');
  }
  const ax = BRIDE.x - 110;
  box(d, ax, 415, 14, 195, '#fffaeb');
  box(d, ax + 206, 415, 14, 195, '#fffaeb');
  d.lineWidth = 16; d.strokeStyle = '#fffaeb';
  d.beginPath(); d.arc(ax + 110, 420, 103, Math.PI, 2 * Math.PI); d.stroke();
  d.lineWidth = 2; d.strokeStyle = '#618c6e';
  for (let i = 0; i < 16; i++) {
    const angle = Math.PI + i / 15 * Math.PI;
    oval(d, ax + 110 + Math.cos(angle) * 104, 420 + Math.sin(angle) * 104, 8, 8, i % 2 ? '#eeb0bf' : '#ca748f');
  }
  d.strokeStyle = '#63556c'; d.lineWidth = 2;
  line(d, [20, 235, 700, 270, 1390, 240]);
  for (let x = 40; x < 1390; x += 65) {
    const y = x < 700 ? 235 + x / 20 : 270 - (x - 700) / 23;
    d.fillStyle = palette[Math.floor(x / 65) % 5];
    d.beginPath(); d.moveTo(x, y); d.lineTo(x + 30, y + 2); d.lineTo(x + 16, y + 33); d.closePath(); d.fill(); d.stroke();
  }
  for (let x = 0; x < WORLD.width; x += 1024) {
    const width = Math.min(1024, WORLD.width - x);
    const [tile, context] = canvas(width, WORLD.height);
    context.drawImage(city, x, 0, width, WORLD.height, 0, 0, width, WORLD.height);
    const key = `city-${x}`;
    scene.textures.addCanvas(key, tile);
    cityTiles.push(scene.add.image(x, 0, key).setOrigin(0).setName(key));
  }
  const updateLighting = (daylight: number): void => {
    nightSky.setAlpha(1 - daylight);
    const colour = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x65739d),
      Phaser.Display.Color.ValueToColor(0xffffff), 1, daylight,
    );
    const tint = Phaser.Display.Color.GetColor(colour.r, colour.g, colour.b);
    cityTiles.forEach(tile => tile.setTint(tint));
  };
  updateLighting(0);
  return updateLighting;
}
