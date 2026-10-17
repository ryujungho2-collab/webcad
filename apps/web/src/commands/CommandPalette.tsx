import { useEffect, useRef, useState } from "react";
import { searchPaletteCommands, type PaletteCommand } from "./paletteCommands";
import "../ui/palette.css";

export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const executing = useRef(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"commands" | "shortcuts">("commands");
  const [activeId, setActiveId] = useState<string | null>(null);
  const results = searchPaletteCommands(commands.filter(command => view === "shortcuts" ? Boolean(command.shortcut) : !command.reference), query);
  const active = results.find((command) => command.id === activeId) ?? results[0];

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    return () => element.close();
  }, []);

  useEffect(() => {
    if (active) document.getElementById(`palette-${active.id}`)?.scrollIntoView({ block: "nearest" });
  }, [active?.id]);

  function close() {
    dialog.current?.close();
    onClose();
  }

  function execute(command: PaletteCommand) {
    if (command.reference || command.disabledReason || executing.current) return;
    executing.current = true;
    close();
    // Keep execution within the user gesture (not an effect or timer), so
    // native file pickers and downloads remain available.
    command.run();
  }

  return (
    <dialog ref={dialog} className="command-palette" aria-labelledby="palette-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const stops = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
          const index = stops.indexOf(document.activeElement as HTMLElement);
          stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
        } else if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
          event.preventDefault(); close();
        } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          if (!results.length) return;
          const index = results.findIndex((command) => command.id === active?.id);
          setActiveId(results[(index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length].id);
          input.current?.focus();
        } else if (event.key === "Enter" && event.target === input.current) {
          event.preventDefault();
          if (active && !event.repeat) execute(active);
        }
      }}>
      <div className="palette-heading"><h2 id="palette-title">Search commands</h2><button ref={closeButton} type="button" aria-label="Close command palette" onClick={close}>Esc</button></div>
      <div className="palette-views" role="group" aria-label="Palette view">
        {(["commands", "shortcuts"] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode}
          onClick={() => { setView(mode); setActiveId(null); input.current?.focus(); }}>{mode === "commands" ? "Commands · 기능" : "Shortcuts · 단축키"}</button>)}
      </div>
      <input ref={input} className="palette-search" type="text" role="combobox" aria-label="Search commands" aria-expanded="true" aria-controls="palette-results" aria-autocomplete="list" aria-activedescendant={active ? `palette-${active.id}` : undefined}
        placeholder="기능명 또는 단축키 검색 · text, 자르기, Ctrl+Wheel…" value={query} onChange={(event) => { setQuery(event.target.value); setActiveId(null); }} />
      <div id="palette-results" className="palette-results" role="listbox" aria-label="Commands">
        {results.map((command) => <div key={command.id} id={`palette-${command.id}`} role="option" aria-selected={active?.id === command.id} aria-disabled={Boolean(command.disabledReason)}
          className={`palette-option${command.reference ? " palette-reference" : ""}${active?.id === command.id ? " palette-option-active" : ""}`}
          onMouseMove={() => setActiveId(command.id)} onMouseDown={(event) => event.preventDefault()} onClick={() => execute(command)}>
          <span className="palette-category">{command.category}</span>
          <span className="palette-description"><strong>{command.label}</strong>{command.description && <small>{command.description}</small>}{command.disabledReason && <small>{command.disabledReason}</small>}</span>
          {command.shortcut ? <kbd>{command.shortcut}</kbd> : <small className="palette-no-shortcut">Menu / 메뉴</small>}
        </div>)}
        {!results.length && <p className="palette-empty" role="status">No matching commands. Try “돌출”, “align”, or “save”.</p>}
      </div>
      <footer className="palette-footer"><span>{results.length} {view === "commands" ? "commands" : "shortcuts"}</span><span>↑ ↓ Navigate · {active?.reference ? "Gesture guide" : "Enter Run"} · Esc Close</span></footer>
    </dialog>
  );
}
