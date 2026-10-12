export class RunnerInput {
  private readonly held = new Set<string>();
  private jumpQueued = false;
  private readonly jumpCodes = new Set(['Space', 'KeyW', 'ArrowUp']);
  private readonly down = (event: KeyboardEvent): void => {
    if (document.activeElement !== this.arena || !this.jumpCodes.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat && !this.held.has(event.code)) this.jumpQueued = true;
    this.held.add(event.code);
  };
  private readonly up = (event: KeyboardEvent): void => { this.held.delete(event.code); };
  private readonly pointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof HTMLElement)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-control]');
    if (button?.dataset.control !== 'jump') return;
    event.preventDefault();
    this.tap();
  };
  private readonly tap = (): void => {
    this.arena.focus({ preventScroll: true });
    this.jumpQueued = true;
  };
  private readonly click = (event: MouseEvent): void => {
    if (event.detail === 0 && event.target instanceof HTMLElement && event.target.closest('[data-control="jump"]')) this.tap();
  };
  private readonly clear = (): void => {
    this.held.clear();
    this.jumpQueued = false;
  };

  constructor(private readonly arena: HTMLElement, private readonly touch: HTMLElement) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    arena.addEventListener('blur', this.clear);
    arena.addEventListener('pointerdown', this.tap);
    document.addEventListener('visibilitychange', this.clear);
    touch.addEventListener('pointerdown', this.pointerDown);
    touch.addEventListener('click', this.click);
  }

  read(): { jump: boolean } {
    if (document.hidden || document.activeElement !== this.arena) {
      this.clear();
      return { jump: false };
    }
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return { jump };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear);
    this.arena.removeEventListener('blur', this.clear);
    this.arena.removeEventListener('pointerdown', this.tap);
    document.removeEventListener('visibilitychange', this.clear);
    this.touch.removeEventListener('pointerdown', this.pointerDown);
    this.touch.removeEventListener('click', this.click);
  }
}
