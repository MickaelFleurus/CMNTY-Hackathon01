// Ambient declarations for dev-only globals (checked via checkJs).
interface Window {
  /** Test bridge set by devtools.js (playwright scripts, dev builds only). */
  __golemDebug?: {
    trigger(ev: string, data?: unknown): void;
    auraRadius(): number | null;
    golemHp(): number | null;
  };
}
