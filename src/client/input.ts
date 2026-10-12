export class RunnerInput {
  private readonly held = new Set<string>();
  private jumpQueued = false;
  private duckPointer = false;
  private readonly jumpCodes = new Set(['Space', 'KeyW', 'ArrowUp']);
  private readonly duckCodes = new Set(['ArrowDown', 'KeyS']);
  private readonly down = (event: KeyboardEvent): void => {
    if (document.activeElement !== this.arena) return;
    if (this.duckCodes.has(event.code)) {
      event.preventDefault();
      this.held.add(event.code);
      return;
    }
    if (!this.jumpCodes.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat && !this.held.has(event.code)) this.jumpQueued = true;
    this.held.add(event.code);
  };
  private readonly up = (event: KeyboardEvent): void => { this.held.delete(event.code); };
  private readonly pointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof HTMLElement)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-control]');
    if (button?.dataset.control === 'duck') {
      event.preventDefault();
      this.arena.focus({ preventScroll: true });
      this.duckPointer = true;
      return;
    }
    if (button?.dataset.control !== 'jump') return;
    event.preventDefault();
    this.tap();
  };
  private readonly release = (): void => { this.duckPointer = false; };
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
    this.duckPointer = false;
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
    window.addEventListener('pointerup', this.release);
    window.addEventListener('pointercancel', this.release);
  }

  read(): { jump: boolean; duck: boolean } {
    if (document.hidden || document.activeElement !== this.arena) {
      this.clear();
      return { jump: false, duck: false };
    }
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    const duck = this.duckPointer || [...this.duckCodes].some(code => this.held.has(code));
    return { jump, duck };
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
    window.removeEventListener('pointerup', this.release);
    window.removeEventListener('pointercancel', this.release);
  }
}
