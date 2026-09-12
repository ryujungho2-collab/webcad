export type HistorySnapshot<T> = {
  label: string;
  value: T;
};

export class HistoryStack<T> {
  private past: HistorySnapshot<T>[] = [];
  private future: HistorySnapshot<T>[] = [];

  constructor(
    private readonly clone: (value: T) => T
  ) {}

  push(
    label: string,
    value: T
  ) {
    this.past.push({
      label,
      value: this.clone(value),
    });

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

  clear() {
    this.past = [];
    this.future = [];
  }
}