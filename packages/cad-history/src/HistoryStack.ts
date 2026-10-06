export type HistorySnapshot<T> = {
  label: string;
  value: T;
};

/** In-memory identity of one document state, independent of stack depth.
 * UI metadata may use this stable object as a WeakMap key. It is never saved
 * with document snapshots; a weak cache does not retain discarded branches. */
export type HistoryStateToken = Readonly<{ id: number }>;
type StoredSnapshot<T> = HistorySnapshot<T> & { state: HistoryStateToken };

export class HistoryStack<T> {
  private past: StoredSnapshot<T>[] = [];
  private future: StoredSnapshot<T>[] = [];
  private nextStateId = 1;
  private currentState: HistoryStateToken = Object.freeze({ id: 0 });

  constructor(
    private readonly clone: (value: T) => T,
    private readonly maxEntries = 100,
  ) {}

  private trimPast() {
    const overflow = this.past.length - Math.max(1, this.maxEntries);
    if (overflow > 0) this.past.splice(0, overflow);
  }

  push(
    label: string,
    value: T
  ) {
    this.pushSnapshot(label, this.clone(value));
  }

  /**
   * Store a snapshot whose ownership has already been transferred to history.
   * Callers must not retain or mutate `value` after this call.
   */
  pushSnapshot(
    label: string,
    value: T
  ) {
    this.past.push({ label, value, state: this.currentState });
    this.currentState = Object.freeze({ id: this.nextStateId++ });
    this.trimPast();

    this.future = [];
  }

  undo(
    currentValue: T
  ): HistorySnapshot<T> | null {
    const previous =
      this.past.pop();

    if (!previous) {
      return null;
    }

    this.future.push({
      label: previous.label,
      value: this.clone(currentValue),
      state: this.currentState,
    });
    this.currentState = previous.state;

    return {
      label: previous.label,
      value: this.clone(previous.value),
    };
  }

  redo(
    currentValue: T
  ): HistorySnapshot<T> | null {
    const next =
      this.future.pop();

    if (!next) {
      return null;
    }

    this.past.push({
      label: next.label,
      value: this.clone(currentValue),
      state: this.currentState,
    });
    this.currentState = next.state;
    this.trimPast();

    return {
      label: next.label,
      value: this.clone(next.value),
    };
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  getStateToken(): HistoryStateToken {
    return this.currentState;
  }

  getPastLabels() {
    return this.past.map(
      (snapshot) => snapshot.label
    );
  }

  getFutureLabels() {
    return this.future.map(
      (snapshot) => snapshot.label
    );
  }

  clear() {
    this.past = [];
    this.future = [];
    this.currentState = Object.freeze({ id: this.nextStateId++ });
  }
}
