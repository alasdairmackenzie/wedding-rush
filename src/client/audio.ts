import type { TemptationKind } from '../shared/level';
import introUrl from '../shared/sounds/intro.mp3';
import footballUrl from '../shared/sounds/football.mp3';
import dealUrl from '../shared/sounds/deal.mp3';
import pingpongUrl from '../shared/sounds/pingpong.mp3';
import hatUrl from '../shared/sounds/hat.mp3';
import pubUrl from '../shared/sounds/pub.mp3';
import karaokeUrl from '../shared/sounds/karaoke.mp3';
import kebabUrl from '../shared/sounds/kebab.mp3';
import backgroundUrl from '../assets/sounds/background.mp3';
import gameoverUrl from '../assets/sounds/gameover.mp3';
import levelEndUrl from '../assets/sounds/level_end.mp3';
import splatUrl from '../assets/sounds/splat.mp3';
import clickUrl from '../assets/sounds/click.mp3';

export type VoiceClip = 'intro' | TemptationKind;
type RecordedEffect = 'gameover' | 'level_end' | 'splat';
type SoundClip = VoiceClip | RecordedEffect | 'background';
const soundUrls: Record<SoundClip, string> = {
  intro: introUrl, football: footballUrl, deal: dealUrl, pingpong: pingpongUrl,
  hat: hatUrl, pub: pubUrl, karaoke: karaokeUrl, kebab: kebabUrl,
  background: backgroundUrl, gameover: gameoverUrl, level_end: levelEndUrl, splat: splatUrl,
};

export class GameAudio {
  private context?: AudioContext;
  private muted = false;
  private voice?: AudioBufferSourceNode;
  private voiceRequest = 0;
  private voiceClip?: VoiceClip;
  private queuedClip?: VoiceClip;
  private destroyed = false;
  private readonly clips = new Map<SoundClip, Promise<AudioBuffer>>();
  private background?: AudioBufferSourceNode;
  private backgroundWanted = false;
  private backgroundRequest = 0;
  private backgroundOffset = 0;
  private backgroundStarted = 0;
  private effectRequest = 0;
  private readonly effects = new Set<AudioBufferSourceNode>();
  private clickSound?: HTMLAudioElement;
  constructor(private readonly notice: (message: string) => void) {}
  // Menu clicks use a media element so they keep playing while the game audio is paused or restarted.
  click(): void {
    if (this.muted || this.destroyed) return;
    this.clickSound ??= Object.assign(new Audio(clickUrl), { preload: 'auto' });
    const sound = this.clickSound.paused ? this.clickSound : this.clickSound.cloneNode() as HTMLAudioElement;
    sound.volume = .6;
    sound.currentTime = 0;
    void sound.play().catch(error => console.warn('Could not play click sound:', error));
  }
  unlock(): void {
    if (this.destroyed) return;
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      this.clips.clear();
    }
    if (this.muted) return;
    void this.resume(this.context);
  }
  // Browsers suspend audio while the page is in the background and only allow it to restart
  // after a tap or key press, so a failed resume is expected and the next press retries it.
  private resume(context: AudioContext): Promise<void> {
    if (context.state === 'running') return Promise.resolve();
    return context.resume().catch(error => console.warn('Audio is waiting for a tap to restart:', error));
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      const backgroundWanted = this.backgroundWanted;
      this.stop();
      this.backgroundWanted = backgroundWanted;
    } else {
      this.unlock();
      if (this.backgroundWanted) this.startBackground();
    }
  }
  stop(): void {
    this.backgroundWanted = false;
    this.haltBackground();
    this.stopEffects();
    this.stopSpeech();
    if (this.context?.state === 'running') {
      void this.context.suspend().catch(error => console.warn('Audio could not pause:', error));
    }
  }
  private loadClip(context: AudioContext, clip: SoundClip): Promise<AudioBuffer> {
    let loading = this.clips.get(clip);
    if (!loading) {
      loading = fetch(soundUrls[clip]).then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => {
        this.clips.delete(clip);
        throw error;
      });
      this.clips.set(clip, loading);
    }
    return loading;
  }
  private haltBackground(): void {
    this.backgroundRequest++;
    if (this.background) {
      const duration = this.background.buffer?.duration;
      if (duration && this.context) {
        this.backgroundOffset = (this.backgroundOffset + this.context.currentTime - this.backgroundStarted) % duration;
      }
      this.background.stop();
      this.background.disconnect();
      this.background = undefined;
    }
  }
  startBackground(fresh = false): void {
    this.backgroundWanted = true;
    if (fresh) {
      this.haltBackground();
      this.backgroundOffset = 0;
      this.stopEffects();
    }
    const context = this.context;
    if (this.muted || document.hidden || this.destroyed || !context || this.background) return;
    const request = ++this.backgroundRequest;
    void Promise.all([this.loadClip(context, 'background'), this.resume(context)]).then(([buffer]) => {
      if (request !== this.backgroundRequest || !this.backgroundWanted || this.muted || document.hidden || this.destroyed) return;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = .18;
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      this.background = source;
      this.backgroundStarted = context.currentTime;
      source.start(0, this.backgroundOffset % buffer.duration);
    }).catch(error => {
      if (request === this.voiceRequest) this.voiceClip = this.queuedClip = undefined;
      if (!this.destroyed) this.notice(`Could not play background music: ${String(error)}`);
    });
  }
  private stopEffects(): void {
    this.effectRequest++;
    for (const effect of this.effects) {
      effect.stop();
      effect.disconnect();
    }
    this.effects.clear();
  }
  effect(clip: RecordedEffect): void {
    const context = this.context;
    if (this.muted || document.hidden || this.destroyed || !context) return;
    const request = this.effectRequest;
    void Promise.all([this.loadClip(context, clip), this.resume(context)]).then(([buffer]) => {
      if (request !== this.effectRequest || this.muted || document.hidden || this.destroyed) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => { source.disconnect(); this.effects.delete(source); };
      this.effects.add(source);
      source.start();
    }).catch(error => {
      if (request === this.voiceRequest) this.voiceClip = this.queuedClip = undefined;
      if (!this.destroyed) this.notice(`Could not play ${clip} sound: ${String(error)}`);
    });
  }
  finish(won: boolean): void {
    this.backgroundWanted = false;
    this.haltBackground();
    this.stopSpeech();
    this.effect(won ? 'level_end' : 'gameover');
  }
  stopSpeech(): void {
    this.voiceRequest++;
    this.voiceClip = this.queuedClip = undefined;
    if (this.voice) {
      this.voice.stop();
      this.voice.disconnect();
      this.voice = undefined;
    }
  }
  speak(clip: VoiceClip): void {
    if (clip !== 'intro' && this.voiceClip === 'intro') {
      this.queuedClip = clip;
      return;
    }
    this.stopSpeech();
    const context = this.context;
    if (this.muted || document.hidden || this.destroyed || !context) return;
    this.voiceClip = clip;
    const request = this.voiceRequest;
    const loading = this.loadClip(context, clip);
    void Promise.all([loading, this.resume(context)]).then(([buffer]) => {
      if (request !== this.voiceRequest) return;
      if (this.muted || document.hidden || this.destroyed || context.state !== 'running') {
        this.voiceClip = this.queuedClip = undefined;
        return;
      }
      const voice = context.createBufferSource();
      voice.buffer = buffer;
      voice.connect(context.destination);
      voice.onended = () => {
        voice.disconnect();
        if (this.voice !== voice) return;
        this.voice = undefined;
        this.voiceClip = undefined;
        const queued = this.queuedClip;
        this.queuedClip = undefined;
        if (queued) this.speak(queued);
      };
      this.voice = voice;
      voice.start();
    }).catch(error => {
      if (request === this.voiceRequest) this.voiceClip = this.queuedClip = undefined;
      if (!this.destroyed) this.notice(`Could not play ${clip} voice: ${String(error)}. Captions are still shown.`);
    });
  }
  tone(kind: 'sweet' | 'jump' | 'stomp' | 'delay' | 'win' | 'lose'): void {
    const context = this.context;
    if (this.muted || document.hidden || !context || context.state !== 'running') return;
    const frequencies = { sweet: 880, jump: 440, stomp: 220, delay: 160, win: 660, lose: 130 };
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = kind === 'delay' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequencies[kind], context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[kind] * (kind === 'lose' ? .5 : 1.5), context.currentTime + .14);
    gain.gain.setValueAtTime(.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .18);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .2);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.clips.clear();
    void this.context?.close().catch(error => console.error('Could not close game audio:', error));
  }
}
