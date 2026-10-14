import type { TemptationKind } from '../shared/level';
import introUrl from '../shared/sounds/intro.mp3';
import footballUrl from '../shared/sounds/football.mp3';
import dealUrl from '../shared/sounds/deal.mp3';
import pingpongUrl from '../shared/sounds/pingpong.mp3';
import hatUrl from '../shared/sounds/hat.mp3';
import pubUrl from '../shared/sounds/pub.mp3';
import karaokeUrl from '../shared/sounds/karaoke.mp3';
import missedTubeUrl from '../assets/sounds/missed_tube_stop.mp3';
import brideMusicUrl from '../assets/sounds/herecomesthebride.mp3';
import backgroundUrl from '../assets/sounds/background.mp3';
import dnbUrl from '../assets/sounds/dnbloop.mp3';
import loseHornUrl from '../assets/sounds/lose_horn.mp3';
import loseYouLoseUrl from '../assets/sounds/lose_you_lose.mp3';
import levelEndUrl from '../assets/sounds/level_end.mp3';
import splatUrl from '../assets/sounds/splat.mp3';
import clickUrl from '../assets/sounds/click.mp3';
import tadaUrl from '../assets/sounds/tada.mp3';
import bashUrl from '../assets/sounds/bash.mp3';
import notifyUrl from '../assets/sounds/notify.mp3';
import corkUrl from '../assets/sounds/cork.mp3';
import sparkleUrl from '../assets/sounds/sparkle.mp3';
import flapUrl from '../assets/sounds/flap.mp3';

export type VoiceClip = 'intro' | TemptationKind;
export type RecordedEffect = 'lose_horn' | 'lose_you_lose' | 'level_end' | 'splat' | 'bash' | 'notify' | 'cork' | 'sparkle' | 'flap';
export type MusicMode = 'on' | 'off';
type SoundClip = VoiceClip | RecordedEffect | 'background' | 'dnb' | 'wedding';
const soundUrls: Record<SoundClip, string> = {
  intro: introUrl, football: footballUrl, deal: dealUrl, pingpong: pingpongUrl,
  hat: hatUrl, pub: pubUrl, karaoke: karaokeUrl, kebab: missedTubeUrl,
  background: backgroundUrl, dnb: dnbUrl, lose_horn: loseHornUrl, lose_you_lose: loseYouLoseUrl,
  level_end: levelEndUrl, splat: splatUrl,
  bash: bashUrl, notify: notifyUrl, cork: corkUrl, sparkle: sparkleUrl, flap: flapUrl,
  wedding: brideMusicUrl,
};
const effectVolume: Partial<Record<RecordedEffect, number>> = { flap: 1.8, notify: .8 };
const uiSounds = { click: { url: clickUrl, volume: .6 }, tada: { url: tadaUrl, volume: .8 } };

export class GameAudio {
  private context?: AudioContext;
  private effectsEnabled = true;
  private musicMode: MusicMode = 'on';
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
  private menuMusic?: AudioBufferSourceNode;
  private menuMusicWanted = false;
  private menuMusicRequest = 0;
  private weddingMusic?: AudioBufferSourceNode;
  private weddingRequest = 0;
  private effectRequest = 0;
  private readonly effects = new Set<AudioBufferSourceNode>();
  private readonly uiElements = new Map<keyof typeof uiSounds, HTMLAudioElement>();
  private readonly activeUiSounds = new Set<HTMLAudioElement>();
  constructor(private readonly notice: (message: string) => void) {}
  click(): void { this.ui('click'); }
  tada(): void { this.ui('tada'); }
  // Menu sounds use a media element so they keep playing while the game audio is paused or restarted.
  private ui(name: keyof typeof uiSounds): void {
    if (!this.effectsEnabled || this.destroyed) return;
    let element = this.uiElements.get(name);
    if (!element) {
      element = Object.assign(new Audio(uiSounds[name].url), { preload: 'auto' });
      this.uiElements.set(name, element);
    }
    const sound = element.paused ? element : element.cloneNode() as HTMLAudioElement;
    sound.volume = uiSounds[name].volume;
    sound.currentTime = 0;
    this.activeUiSounds.add(sound);
    sound.addEventListener('ended', () => this.activeUiSounds.delete(sound), { once: true });
    void sound.play().catch(error => {
      this.activeUiSounds.delete(sound);
      console.warn(`Could not play ${name} sound:`, error);
    });
  }
  unlock(): void {
    if (this.destroyed) return;
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      this.clips.clear();
    }
    if (!this.effectsEnabled && this.musicMode === 'off') return;
    void this.resume(this.context).then(() => {
      if (this.menuMusicWanted) this.startMenuMusic();
    });
  }
  // Browsers suspend audio while the page is in the background and only allow it to restart
  // after a tap or key press, so a failed resume is expected and the next press retries it.
  private resume(context: AudioContext): Promise<void> {
    if (context.state === 'running') return Promise.resolve();
    return context.resume().catch(error => console.warn('Audio is waiting for a tap to restart:', error));
  }
  setEffectsEnabled(enabled: boolean): void {
    this.effectsEnabled = enabled;
    if (enabled) {
      this.unlock();
      return;
    }
    this.stopEffects();
    this.stopSpeech();
    for (const sound of this.activeUiSounds) {
      sound.pause();
      sound.currentTime = 0;
    }
    this.activeUiSounds.clear();
  }
  setMusicMode(mode: MusicMode): void {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    this.haltBackground();
    this.haltMenuMusic();
    if (mode !== 'off' && this.backgroundWanted) this.startBackground();
    if (mode !== 'off' && this.menuMusicWanted) {
      this.unlock();
    }
  }
  private haltMenuMusic(): void {
    this.menuMusicRequest++;
    if (this.menuMusic) {
      this.menuMusic.stop();
      this.menuMusic.disconnect();
      this.menuMusic = undefined;
    }
  }
  stopMenuMusic(): void {
    this.menuMusicWanted = false;
    this.haltMenuMusic();
  }
  startMenuMusic(): void {
    this.menuMusicWanted = true;
    const context = this.context;
    if (this.musicMode === 'off' || document.hidden || !document.hasFocus() || this.destroyed
      || !context || context.state !== 'running' || this.menuMusic) return;
    const request = ++this.menuMusicRequest;
    void this.loadClip(context, 'background').then(buffer => {
      if (request !== this.menuMusicRequest || !this.menuMusicWanted || this.musicMode === 'off'
        || document.hidden || !document.hasFocus() || this.destroyed) return;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = .2;
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      this.menuMusic = source;
      source.start();
    }).catch(error => {
      if (!this.destroyed) this.notice(`Could not play menu music: ${String(error)}`);
    });
  }
  private haltWeddingMusic(): void {
    this.weddingRequest++;
    if (this.weddingMusic) {
      this.weddingMusic.stop();
      this.weddingMusic.disconnect();
      this.weddingMusic = undefined;
    }
  }
  startWeddingMusic(): void {
    const context = this.context;
    if (document.hidden || this.destroyed || !context || this.weddingMusic) return;
    const request = ++this.weddingRequest;
    void Promise.all([this.loadClip(context, 'wedding'), this.resume(context)]).then(([buffer]) => {
      if (request !== this.weddingRequest || document.hidden || this.destroyed) return;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = .6;
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      this.weddingMusic = source;
      source.start(0);
    }).catch(error => {
      if (!this.destroyed) this.notice(`Could not play wedding music: ${String(error)}`);
    });
  }
  stop(): void {
    this.stopMenuMusic();
    this.backgroundWanted = false;
    this.haltBackground();
    this.haltWeddingMusic();
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
    this.stopMenuMusic();
    this.backgroundWanted = true;
    if (fresh) {
      this.haltBackground();
      this.haltWeddingMusic();
      this.backgroundOffset = 0;
      this.stopEffects();
    }
    const context = this.context;
    if (this.musicMode === 'off' || document.hidden || this.destroyed || !context || this.background) return;
    const clip = 'dnb';
    const request = ++this.backgroundRequest;
    void Promise.all([this.loadClip(context, clip), this.resume(context)]).then(([buffer]) => {
      if (request !== this.backgroundRequest || !this.backgroundWanted || this.musicMode === 'off' || document.hidden || this.destroyed) return;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = .5;
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
  effect(...clips: RecordedEffect[]): void {
    const context = this.context;
    if (!this.effectsEnabled || document.hidden || this.destroyed || !context) return;
    const request = this.effectRequest;
    void Promise.all([Promise.all(clips.map(clip => this.loadClip(context, clip))), this.resume(context)]).then(([buffers]) => {
      if (request !== this.effectRequest || !this.effectsEnabled || document.hidden || this.destroyed) return;
      const startTime = context.currentTime;
      buffers.forEach((buffer, index) => {
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = effectVolume[clips[index]] ?? 1;
        source.connect(gain); gain.connect(context.destination);
        source.onended = () => { source.disconnect(); gain.disconnect(); this.effects.delete(source); };
        this.effects.add(source);
        source.start(startTime);
      });
    }).catch(error => {
      if (request === this.voiceRequest) this.voiceClip = this.queuedClip = undefined;
      if (!this.destroyed) this.notice(`Could not play ${clips.join(' and ')} sound: ${String(error)}`);
    });
  }
  finish(won: boolean): void {
    this.backgroundWanted = false;
    this.haltBackground();
    this.stopSpeech();
    if (won) this.effect('level_end');
    else this.effect('lose_horn', 'lose_you_lose');
    if (won) this.startWeddingMusic();
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
    if (!this.effectsEnabled || document.hidden || this.destroyed || !context) return;
    this.voiceClip = clip;
    const request = this.voiceRequest;
    const loading = this.loadClip(context, clip);
    void Promise.all([loading, this.resume(context)]).then(([buffer]) => {
      if (request !== this.voiceRequest) return;
      if (!this.effectsEnabled || document.hidden || this.destroyed || context.state !== 'running') {
        this.voiceClip = this.queuedClip = undefined;
        return;
      }
      const voice = context.createBufferSource(), gain = context.createGain();
      voice.buffer = buffer;
      gain.gain.value = .7;
      voice.connect(gain); gain.connect(context.destination);
      voice.onended = () => {
        voice.disconnect(); gain.disconnect();
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
    if (!this.effectsEnabled || document.hidden || !context || context.state !== 'running') return;
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
