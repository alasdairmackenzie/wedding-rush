import Phaser from 'phaser';
import { beckyTexts, BRIDE, corks, daylightProgress, GROOM, hurdles, movers, moverStart, MOVER_TRIGGER, people, platforms,
  RING_VALUE, rings, Run, RUN_OBJECTIVE, runnerSpeed, SQUASH_BONUS, START, sweets, WORLD } from '../shared/level';
import { drawCity, makeTextures } from './art';
import { RunnerInput } from './input';
import { GameAudio } from './audio';
import groomPhotoUrl from '../assets/art/groom-photo.png';
import brideHeadUrl from '../assets/art/bride-head.png';
import pingpongHeadUrl from '../assets/art/pingpong-head.png';
import dealHeadUrl from '../assets/art/deal-head.png';

interface Hurdle {
  body: Phaser.GameObjects.Rectangle;
  rail: Phaser.GameObjects.Container;
}
interface Person {
  body: Phaser.GameObjects.Rectangle;
  art: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Text;
  nearby: boolean;
}
interface Mover {
  art: Phaser.GameObjects.Image;
  x: number;
  active: boolean;
}
export interface GameUI {
  arena: HTMLElement;
  touch: HTMLElement;
  audio: GameAudio;
  update(run: Run, x: number): void;
  notice(message: string): void;
  text(message: string): void;
  end(run: Run): void;
  ready(scene: WeddingScene): void;
  error(message: string): void;
}

export class WeddingScene extends Phaser.Scene {
  run = new Run();
  celebrating = false;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerArt!: Phaser.GameObjects.Image;
  private brideArt!: Phaser.GameObjects.Image;
  private victoryTimer?: Phaser.Time.TimerEvent;
  private controls!: RunnerInput;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;
  private effects!: Phaser.GameObjects.Group;
  private readonly obstacles: Hurdle[] = [];
  private readonly characters: Person[] = [];
  private lightCity!: (daylight: number) => void;
  private eventOverlay?: Phaser.GameObjects.Text;
  private readonly moving: Mover[] = [];
  private readonly ringArt: Phaser.GameObjects.Image[] = [];
  private readonly corkArt: Phaser.GameObjects.Image[] = [];
  private playerScale = 1;
  private ducking = false;
  private doubleJumped = false;
  private textsSent = 0;
  private lastMultiplier = 1;
  private invulnerableUntil = 0;
  private groundedAt = -1000;
  private jumpUntil = -1000;
  private failedAssets = false;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly ui: GameUI) { super('wedding'); }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failedAssets = true;
      this.ui.error(`Could not load ${file.key}. Reload the page to try again.`);
    });
    this.load.image('groom-photo', groomPhotoUrl);
    this.load.image('bride-head', brideHeadUrl);
    this.load.image('pingpong-head', pingpongHeadUrl);
    this.load.image('deal-head', dealHeadUrl);
  }

  create(): void {
    if (this.failedAssets) return;
    makeTextures(this);
    this.lightCity = drawCity(this);
    this.effects = this.add.group();
    this.physics.world.setBounds(0, -300, WORLD.width, WORLD.height + 600);
    const ground = this.physics.add.staticGroup();
    for (const p of platforms) {
      const rectangle = this.add.rectangle(p.x + p.width / 2, p.y + p.height / 2, p.width, p.height, 0xffffff, 0);
      ground.add(rectangle);
      if (p.kind === 'ledge' && rectangle.body instanceof Phaser.Physics.Arcade.StaticBody) {
        rectangle.body.checkCollision.down = false;
        rectangle.body.checkCollision.left = false;
        rectangle.body.checkCollision.right = false;
      }
    }
    this.player = this.physics.add.sprite(START.x, START.y, 'groom').setAlpha(0);
    this.player.setSize(GROOM.width, GROOM.height).setOffset(31, 40);
    this.playerArt = this.add.image(START.x, START.y + 40, 'groom-photo').setOrigin(.5, 1).setDepth(5);
    const photo = this.textures.get('groom-photo').getSourceImage();
    this.playerScale = Math.min(90 / photo.width, 120 / photo.height);
    this.playerArt.setScale(this.playerScale);
    this.physics.add.collider(this.player, ground);
    this.pickups = this.physics.add.staticGroup();
    sweets.forEach((sweet, id) => {
      const pickup = this.pickups.create(sweet.x, sweet.y, `sweet-${sweet.value}`);
      if (!(pickup instanceof Phaser.Physics.Arcade.Sprite)) throw new Error('Could not create a sweet.');
      pickup.setData('sweetId', id);
    });
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => {
      if (!(pickup instanceof Phaser.Physics.Arcade.Sprite)) return;
      const id: number = pickup.getData('sweetId');
      if (this.run.collect(id)) {
        pickup.disableBody(true, true);
        this.ui.audio.tone('sweet');
        this.floatText(pickup.x, pickup.y - 25, `+${sweets[id].value}`, '#42735a');
        this.announceEvent('SWEET!', `+${sweets[id].value} POINTS`, '#d68b25');
        this.ui.update(this.run, this.player.x);
      }
    });
    hurdles.forEach((definition, id) => {
      const y = 610 - definition.height / 2;
      const body = this.add.rectangle(definition.x, y, definition.width, definition.height, 0xffffff, 0);
      this.physics.add.existing(body, true);
      const rail = this.add.container(definition.x, 610).setDepth(6);
      const colours = [0xb84b64, 0x578878, 0x795777];
      rail.add([
        this.add.rectangle(-24, -definition.height / 2, 8, definition.height, 0x302825),
        this.add.rectangle(24, -definition.height / 2, 8, definition.height, 0x302825),
        this.add.rectangle(0, -definition.height + 12, 72, 24, colours[id % colours.length]).setStrokeStyle(3, 0x302825),
        this.add.rectangle(-24, -3, 24, 6, 0x302825),
        this.add.rectangle(24, -3, 24, 6, 0x302825),
        this.add.text(0, -definition.height + 12, 'JUMP', {
          fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#fff8e8',
        }).setOrigin(.5),
      ]);
      this.obstacles.push({ body, rail });
      this.physics.add.overlap(this.player, body, () => this.contact(id));
    });
    people.forEach((definition, id) => {
      const character = definition.temptation;
      const body = this.add.rectangle(definition.x, 610 - definition.height / 2,
        definition.width, definition.height, 0xffffff, 0);
      this.physics.add.existing(body, true);
      const art = this.add.image(definition.x, 610, character.kind)
        .setOrigin(.5, 102 / 112).setScale(1.1).setDepth(4);
      const bubble = this.add.text(definition.x, 475, character.line, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '17px', fontStyle: 'bold',
        color: '#352b3c', backgroundColor: '#fff8e8', padding: { x: 12, y: 10 },
        wordWrap: { width: 235 }, align: 'center',
      }).setOrigin(.5, 1).setDepth(10).setVisible(false);
      this.characters.push({ body, art, bubble, nearby: false });
      this.physics.add.overlap(this.player, body, () => this.contactPerson(id));
    });
    movers.forEach((definition, id) => {
      const art = this.add.image(moverStart(definition), definition.y, definition.kind)
        .setDepth(6).setName(`${definition.kind}-${id}`);
      this.moving.push({ art, x: moverStart(definition), active: false });
    });
    corks.forEach((cork, id) => {
      this.corkArt.push(this.add.image(cork.x, cork.y, 'champagne').setDepth(5).setName(`champagne-${id}`));
    });
    rings.forEach((ring, id) => {
      const art = this.add.image(ring.x, ring.y, 'ring').setDepth(5).setName(`ring-${id}`);
      this.ringArt.push(art);
      if (!this.reducedMotion.matches) this.tweens.add({ targets: art, scaleX: .15, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    this.brideArt = this.add.image(BRIDE.x, 610, 'bride').setOrigin(.5, 102 / 112).setScale(1.3).setDepth(4).setName('bride');
    this.add.text(BRIDE.x, 390, 'THE WEDDING / THIS WAY', {
      fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#9d4d6a',
      backgroundColor: '#fff4df', padding: { x: 12, y: 8 },
    }).setOrigin(.5).setDepth(9).setName('wedding-sign');
    this.add.text(BRIDE.x - 80, 560, "Sean, don't be late!", {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: '#9d4d6a',
      backgroundColor: '#fff8e8', padding: { x: 12, y: 8 },
    }).setOrigin(1, 1).setDepth(9).setName('bride-caption');
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.setFollowOffset(-110, 0);
    this.controls = new RunnerInput(this.ui.arena, this.ui.touch);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this));
    this.resize();
    this.physics.pause();
    this.ui.ready(this);
    this.syncUI();
  }

  private resize(): void {
    this.cameras.main.setZoom(this.scale.height / WORLD.height);
    this.positionEvent();
  }
  private positionEvent(): void {
    if (!this.eventOverlay) return;
    const camera = this.cameras.main;
    this.eventOverlay.setFontSize(Math.min(42, camera.width / camera.zoom / 13));
    const screenY = Math.max(camera.height * .28, 110 + this.eventOverlay.height * camera.zoom / 2);
    this.eventOverlay.setPosition(camera.width / 2, camera.height / 2 + (screenY - camera.height / 2) / camera.zoom);
  }
  private announceEvent(title: string, detail: string, colour: string): void {
    if (this.eventOverlay) {
      this.tweens.killTweensOf(this.eventOverlay);
      this.effects.remove(this.eventOverlay);
      this.eventOverlay.destroy();
    }
    const overlay = this.add.text(0, 0, `${title}\n${detail}`, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '42px', fontStyle: 'bold',
      color: colour, stroke: '#302825', strokeThickness: 3, backgroundColor: '#fff8e8',
      padding: { x: 16, y: 12 }, align: 'center',
    }).setOrigin(.5).setScrollFactor(0).setDepth(30).setName('event-overlay');
    this.eventOverlay = overlay;
    this.effects.add(overlay);
    this.positionEvent();
    if (!this.reducedMotion.matches) {
      overlay.setScale(.75).setAngle(-4);
      this.tweens.add({ targets: overlay, scaleX: 1, scaleY: 1, angle: 0, duration: 220, ease: 'Back.easeOut' });
    }
    this.tweens.add({
      targets: overlay, alpha: 0, delay: 1050, duration: 250,
      onComplete: () => {
        this.effects.remove(overlay);
        overlay.destroy();
        if (this.eventOverlay === overlay) this.eventOverlay = undefined;
      },
    });
  }

  start(fresh = false): void {
    const resetting = fresh || this.run.phase === 'won' || this.run.phase === 'late';
    const newRun = resetting || this.run.phase === 'ready';
    if (resetting) {
      this.victoryTimer?.remove();
      this.victoryTimer = undefined;
      this.celebrating = false;
      this.tweens.killTweensOf([this.player, this.brideArt]);
      this.brideArt.setPosition(BRIDE.x, 610);
      this.run = new Run();
      this.effects.getChildren().forEach(effect => this.tweens.killTweensOf(effect));
      this.effects.clear(true, true);
      this.eventOverlay = undefined;
      this.pickups.children.each(child => {
        if (child instanceof Phaser.Physics.Arcade.Sprite) child.enableBody(false, 0, 0, true, true);
        return true;
      });
      this.obstacles.forEach(obstacle => {
        obstacle.rail.setAlpha(1);
      });
      this.characters.forEach(character => {
        this.tweens.killTweensOf(character.art);
        character.art.setScale(1.1).setAlpha(1);
        character.nearby = false;
        character.bubble.setVisible(false);
        if (character.body.body instanceof Phaser.Physics.Arcade.StaticBody) character.body.body.enable = true;
      });
      this.moving.forEach((mover, id) => {
        mover.x = moverStart(movers[id]);
        mover.active = false;
        mover.art.setPosition(mover.x, movers[id].y).setAlpha(1).setAngle(0);
      });
      this.corkArt.forEach(art => art.setVisible(true));
      this.ringArt.forEach(art => art.setVisible(true));
      this.textsSent = 0;
      this.lastMultiplier = 1;
      this.cameras.main.resetFX();
      this.setDucking(false);
      this.player.body?.reset(START.x, START.y);
      this.lightCity(0);
      this.invulnerableUntil = 0;
    }
    if (newRun) {
      this.player.setVelocity(0);
      this.groundedAt = this.jumpUntil = -1000;
      this.doubleJumped = false;
    }
    this.run.phase = 'playing';
    this.physics.resume();
    this.tweens.resumeAll();
    this.ui.arena.focus({ preventScroll: true });
    this.ui.audio.startBackground(newRun);
    if (newRun) {
      const message = RUN_OBJECTIVE;
      this.ui.notice(message);
      this.ui.audio.speak('intro');
    }
    this.syncUI();
  }
  pause(): void {
    if (this.run.phase !== 'playing') return;
    this.run.phase = 'paused';
    this.physics.pause();
    this.tweens.pauseAll();
    this.ui.audio.stop();
    this.syncUI();
  }
  private floatText(x: number, y: number, text: string, colour: string): void {
    const label = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: colour,
      backgroundColor: '#fff8e8', padding: { x: 6, y: 3 },
    }).setOrigin(.5).setDepth(11);
    this.effects.add(label);
    this.tweens.add({
      targets: label, y: this.reducedMotion.matches ? y : y - 45, alpha: 0, duration: 800,
      onComplete: () => { this.effects.remove(label); label.destroy(); },
    });
  }
  private buzz(pattern: number | number[]): void {
    // Phaser sets navigator.vibrate to undefined on browsers without it (Safari/iOS), so check it is callable.
    if (typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(pattern); } catch { /* vibration unsupported or blocked */ }
  }
  private confetti(x: number, y: number): void {
    if (this.reducedMotion.matches) return;
    const colours = [0xe9799b, 0xffd98a, 0x91cbbb, 0x9ec4eb, 0xb9a1e3, 0xfff8e8];
    for (let id = 0; id < 22; id++) {
      const piece = this.add.rectangle(x, y, 8, 12, colours[id % colours.length]).setDepth(12).setName('confetti');
      this.effects.add(piece);
      const angle = -Math.PI / 2 + (id / 21 - .5) * 2.4;
      const distance = 70 + id % 4 * 30;
      this.tweens.add({
        targets: piece, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance + 70,
        angle: 360 + id * 25, alpha: 0, duration: 900 + id % 5 * 80, ease: 'Quad.easeOut',
        onComplete: () => { this.effects.remove(piece); piece.destroy(); },
      });
    }
  }
  private setDucking(ducking: boolean): void {
    if (this.ducking === ducking || !this.player) return;
    this.ducking = ducking;
    if (ducking) {
      this.player.setSize(GROOM.width, GROOM.height / 2).setOffset(31, 40 + GROOM.height / 2);
      if (this.run.phase === 'playing') this.ui.audio.effect('duck');
    } else this.player.setSize(GROOM.width, GROOM.height).setOffset(31, 40);
  }
  private comboCheck(): void {
    const multiplier = this.run.multiplier;
    if (multiplier > this.lastMultiplier) {
      this.announceEvent(`COMBO ×${multiplier}!`, `${this.run.streak} IN A ROW`, '#7b4bb3');
      this.ui.audio.tone('sweet');
    } else if (multiplier < this.lastMultiplier) {
      this.floatText(this.player.x, this.player.y - 85, 'COMBO LOST', '#b52f44');
    }
    this.lastMultiplier = multiplier;
  }
  private bump(title: string, message: string): void {
    this.invulnerableUntil = this.run.elapsed + 900;
    this.ui.audio.effect('bash');
    this.buzz(120);
    this.floatText(this.player.x, this.player.y - 55, '-1 chance!', '#b52f44');
    this.announceEvent(title, '-1 CHANCE', '#b52f44');
    this.ui.notice(message);
    this.comboCheck();
    if (this.run.lives === 0) this.end();
  }
  private contact(id: number): void {
    if (this.run.hitHurdle(id)) {
      this.obstacles[id].rail.setAlpha(.35);
      this.bump('OUCH!', 'Hurdle hit! One chance lost. Jump the next hurdle!');
    }
  }
  private contactPerson(id: number): void {
    if (this.run.phase !== 'playing') return;
    const character = this.characters[id];
    const body = this.player.body;
    const target = character.body.body;
    if (!(body instanceof Phaser.Physics.Arcade.Body) || !(target instanceof Phaser.Physics.Arcade.StaticBody)) {
      throw new Error('Character collision physics body missing.');
    }
    if (body.velocity.y > 0 && body.prev.y + body.height <= target.top + 8) {
      if (!this.run.squashPerson(id)) return;
      target.enable = false;
      character.bubble.setVisible(false);
      if (this.reducedMotion.matches) character.art.setScale(1.4, .25);
      else this.tweens.add({ targets: character.art, scaleX: 1.4, scaleY: .25, duration: 160, ease: 'Sine.easeOut' });
      this.player.setVelocityY(-GROOM.jump * .65);
      this.groundedAt = this.jumpUntil = -1000;
      this.doubleJumped = false;
      this.ui.audio.effect('splat');
      this.buzz(40);
      this.confetti(character.art.x, 540);
      if (!this.reducedMotion.matches) this.cameras.main.shake(180, .008);
      this.floatText(character.art.x, 490, `+${SQUASH_BONUS}`, '#42735a');
      this.announceEvent('SQUASH!', `+${SQUASH_BONUS} BONUS POINTS`, '#42735a');
      this.comboCheck();
      this.ui.notice(`${people[id].temptation.name} squashed! +${SQUASH_BONUS} bonus points. No chance or time lost.`);
    } else if (this.run.hitPerson(id)) {
      target.enable = false;
      character.art.setAlpha(.5);
      character.bubble.setVisible(false);
      this.bump('DISTRACTED!', `Distracted by ${people[id].temptation.name.toLowerCase()}! One chance lost. Land on their head or jump over them!`);
    }
    this.syncUI();
  }
  private end(): void {
    this.player.setVelocity(0);
    this.physics.pause();
    this.ui.audio.finish(this.run.phase === 'won');
    this.characters.forEach(character => character.bubble.setVisible(false));
    if (this.run.phase === 'won') {
      this.celebrating = true;
      this.lightCity(1);
      this.invulnerableUntil = 0;
      this.ui.notice('Sean and Becky, together at last! The distractions can wait.');
      this.announceEvent('MADE IT!', 'SEAN + BECKY', '#b84b64');
      const reunion = { x: BRIDE.x - 28, y: 570 };
      if (this.reducedMotion.matches) {
        this.player.setPosition(reunion.x, reunion.y);
        this.brideArt.setX(BRIDE.x + 12);
      } else {
        this.tweens.add({ targets: this.player, ...reunion, duration: 650, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: this.brideArt, x: BRIDE.x + 12, duration: 650, ease: 'Sine.easeInOut' });
      }
      for (let id = 0; id < 12; id++) {
        const heart = this.add.text(BRIDE.x - 65 + id % 6 * 26, 435 - Math.floor(id / 6) * 26, '♥', {
          fontFamily: 'sans-serif', fontSize: `${24 + id % 3 * 5}px`, color: id % 2 ? '#b84b64' : '#e9799b',
        }).setOrigin(.5).setDepth(11).setName('reunion-heart');
        this.effects.add(heart);
        if (!this.reducedMotion.matches) {
          this.tweens.add({
            targets: heart, y: heart.y - 130, alpha: 0,
            duration: 1800, delay: 450 + id * 65, ease: 'Sine.easeOut',
          });
        }
      }
      const banner = this.add.text(BRIDE.x, 340, 'JUST MARRIED!', {
        fontFamily: 'monospace', fontSize: '24px', color: '#a34668', backgroundColor: '#fff8e8',
        padding: { x: 10, y: 8 },
      }).setOrigin(.5).setDepth(12).setName('married-banner');
      this.effects.add(banner);
      this.victoryTimer = this.time.delayedCall(3200, () => {
        this.celebrating = false;
        this.victoryTimer = undefined;
        this.syncUI();
        this.ui.end(this.run);
      });
      this.syncUI();
      return;
    }
    this.announceEvent('OUT OF CHANCES!', 'ONE MORE BIG DAY?', '#b52f44');
    this.syncUI();
    this.ui.end(this.run);
  }
  private syncUI(): void {
    this.ui.arena.dataset.celebrating = String(this.celebrating);
    this.ui.arena.dataset.x = this.player.x.toFixed(1);
    this.ui.arena.dataset.y = this.player.y.toFixed(1);
    this.ui.arena.dataset.grounded = String(this.player.body?.blocked.down ?? false);
    this.ui.arena.dataset.squashed = String(this.run.squashed.size);
    this.ui.arena.dataset.rings = String(this.run.rings.size);
    this.ui.arena.dataset.dodged = String(this.run.dodged.size);
    this.ui.arena.dataset.combo = String(this.run.multiplier);
    this.ui.arena.dataset.ducking = String(this.ducking);
    this.ui.arena.dataset.daylight = (this.run.phase === 'won' ? 1 : daylightProgress(this.player.x)).toFixed(3);
    this.ui.update(this.run, this.player.x);
  }
  update(_time: number, delta: number): void {
    if (!this.player) return;
    if (this.run.phase === 'playing') {
      this.run.tick(delta);
      const body = this.player.body;
      if (!(body instanceof Phaser.Physics.Arcade.Body)) throw new Error('Sean physics body missing.');
      const input = this.controls.read();
      if (body.blocked.down) {
        this.groundedAt = this.run.elapsed;
        this.doubleJumped = false;
      }
      this.setDucking(input.duck);
      if (input.duck && !body.blocked.down && body.velocity.y < 750) this.player.setVelocityY(body.velocity.y + 45);
      if (input.jump) {
        const canGroundJump = this.run.elapsed - this.groundedAt <= 100;
        const landingSoon = body.velocity.y > 0 && body.bottom > 560;
        if (!canGroundJump && !landingSoon && !this.doubleJumped) {
          this.doubleJumped = true;
          this.setDucking(false);
          this.player.setVelocityY(-GROOM.jump * .85);
          this.ui.audio.tone('jump');
          this.floatText(this.player.x, this.player.y - 70, 'DOUBLE JUMP!', '#2d6c9c');
        } else {
          this.jumpUntil = this.run.elapsed + 120;
        }
      }
      this.player.setVelocityX(runnerSpeed(this.player.x));
      if (this.jumpUntil >= this.run.elapsed && this.run.elapsed - this.groundedAt <= 100) {
        this.setDucking(false);
        this.player.setVelocityY(-GROOM.jump);
        this.jumpUntil = this.groundedAt = -1000;
        this.ui.audio.tone('jump');
      }
      this.updateExtras(delta, body);
      this.player.x = Phaser.Math.Clamp(this.player.x, GROOM.width / 2, WORLD.width - GROOM.width / 2);
      this.lightCity(daylightProgress(this.player.x));
      this.obstacles.forEach((_obstacle, id) => {
        const definition = hurdles[id];
        if (body.left > definition.x + definition.width / 2 && this.run.clearHurdle(id)) {
          this.ui.audio.tone('sweet');
          this.floatText(definition.x, 485, 'NOT TODAY!', '#42735a');
          this.announceEvent('CLEARED!', `${this.run.cleared.size} / ${hurdles.length} HURDLES`, '#42735a');
          this.ui.notice(`Hurdle cleared! ${this.run.cleared.size} / ${hurdles.length} hurdles cleared.`);
          this.comboCheck();
        }
      });
      this.characters.forEach((character, id) => {
        const definition = people[id];
        const resolved = this.run.hitPeople.has(id) || this.run.squashed.has(id);
        const near = !resolved && definition.x - this.player.x < 430 && definition.x > this.player.x;
        if (near && !character.nearby) {
          this.ui.notice(`${definition.temptation.name}: "${definition.temptation.line}" Jump over them or land on their head!`);
          this.ui.audio.speak(definition.temptation.kind);
        }
        character.nearby = near;
        character.bubble.setVisible(near);
      });
      if (this.player.x >= BRIDE.x - 54 && this.run.finish()) this.end();
      this.syncUI();
    }
    const bob = !this.reducedMotion.matches && this.run.phase === 'playing' && this.player.body?.blocked.down
      ? Math.sin(this.run.elapsed / 65) * 2 : 0;
    this.playerArt.setPosition(this.player.x, this.player.y + 40 + bob);
    this.playerArt.setScale(this.playerScale, this.playerScale * (this.ducking ? .55 : 1));
    this.playerArt.setAlpha(this.run.elapsed < this.invulnerableUntil ? .5 : 1);
  }
  private updateExtras(delta: number, body: Phaser.Physics.Arcade.Body): void {
    const overlaps = (x: number, y: number, width: number, height: number): boolean =>
      body.right > x - width / 2 && body.left < x + width / 2 && body.bottom > y - height / 2 && body.top < y + height / 2;
    this.moving.forEach((mover, id) => {
      const definition = movers[id];
      if (!mover.active && moverStart(definition) - this.player.x <= MOVER_TRIGGER) {
        mover.active = true;
        if (definition.kind === 'pigeon') {
          this.announceEvent('PIGEON!', 'DUCK! ↓', '#2d6c9c');
          this.ui.audio.effect('flap');
          this.ui.notice('A pigeon is swooping at head height. Hold DUCK, S or the down arrow!');
        } else {
          this.announceEvent('BARREL!', 'JUMP IT!', '#a8693c');
          this.ui.notice('A beer barrel is rolling your way. Jump it!');
        }
      }
      if (mover.active) mover.x -= definition.speed * delta / 1000;
      const flap = definition.kind === 'pigeon' && !this.reducedMotion.matches ? Math.sin(this.run.elapsed / 90) * 4 : 0;
      mover.art.setPosition(mover.x, definition.y + flap);
      if (definition.kind === 'barrel' && mover.active && !this.reducedMotion.matches) {
        mover.art.angle -= definition.speed * delta / 1000 / (definition.width / 2) * 180 / Math.PI;
      }
      if (this.run.hitMovers.has(id) || this.run.dodged.has(id)) return;
      if (overlaps(mover.x, definition.y, definition.width, definition.height)) {
        if (this.run.hitMover(id)) {
          mover.art.setAlpha(.4);
          this.bump(definition.kind === 'pigeon' ? 'PIGEONED!' : 'BARRELLED!',
            definition.kind === 'pigeon' ? 'Hit by a pigeon! Duck next time.' : 'Flattened by a beer barrel! Jump it next time.');
        }
      } else if (body.left > mover.x + definition.width / 2 && this.run.dodgeMover(id)) {
        this.ui.audio.tone('sweet');
        this.announceEvent(definition.kind === 'pigeon' ? 'DUCKED!' : 'DODGED!', 'NICE MOVES', '#42735a');
        this.comboCheck();
      }
    });
    corks.forEach((cork, id) => {
      if (this.run.corks.has(id) || !overlaps(cork.x, cork.y, 28, 60)) return;
      this.run.popCork(id);
      this.corkArt[id].setVisible(false);
      this.setDucking(false);
      this.player.setVelocityY(-GROOM.jump * 1.5);
      this.groundedAt = this.jumpUntil = -1000;
      this.doubleJumped = false;
      this.ui.audio.effect('cork');
      this.confetti(cork.x, cork.y - 30);
      this.announceEvent('POP!', 'CHAMPAGNE SUPER JUMP', '#c9952a');
      this.ui.notice('Champagne cork! Grab the spinning ring up high.');
    });
    rings.forEach((ring, id) => {
      if (this.run.rings.has(id) || !overlaps(ring.x, ring.y, 34, 34)) return;
      this.run.collectRing(id);
      this.ringArt[id].setVisible(false);
      this.ui.audio.effect('sparkle');
      this.floatText(ring.x, ring.y - 30, `+${RING_VALUE * this.run.multiplier}`, '#c9952a');
      this.announceEvent('RING!', `+${RING_VALUE * this.run.multiplier} POINTS`, '#c9952a');
    });
    const progress = (this.player.x - START.x) / (BRIDE.x - START.x);
    while (this.textsSent < beckyTexts.length && progress >= beckyTexts[this.textsSent].at) {
      this.ui.text(beckyTexts[this.textsSent++].text);
      this.ui.audio.effect('notify');
    }
  }
}
