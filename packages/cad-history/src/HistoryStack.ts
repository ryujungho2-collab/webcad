export type HistorySnapshot<T> = {
  label: string;
  value: T;
};

export class HistoryStack<T> {
  private past: HistorySnapshot<T>[] = [];
  private future: HistorySnapshot<T>[] = [];

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
    this.past.push({ label, value });
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
    });

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
    });
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
  }
}
