import { useEffect, useRef, useState } from "react";
import { searchPaletteCommands, type PaletteCommand } from "./paletteCommands";
import "../ui/palette.css";

export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const executing = useRef(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const results = searchPaletteCommands(commands, query);
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
    if (command.disabledReason || executing.current) return;
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
        if (event.key === "Tab") {
          event.preventDefault();
          // There are two tab stops. Keep focus in the modal rather than
          // allowing a browser's chrome to consume the next CAD shortcut.
          if (event.target === input.current) closeButton.current?.focus();
          else input.current?.focus();
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
      <input ref={input} className="palette-search" type="text" role="combobox" aria-label="Search commands" aria-expanded="true" aria-controls="palette-results" aria-autocomplete="list" aria-activedescendant={active ? `palette-${active.id}` : undefined}
        placeholder="Search in English or 한국어…" value={query} onChange={(event) => { setQuery(event.target.value); setActiveId(null); }} />
      <div id="palette-results" className="palette-results" role="listbox" aria-label="Commands">
        {results.map((command) => <div key={command.id} id={`palette-${command.id}`} role="option" aria-selected={active?.id === command.id} aria-disabled={Boolean(command.disabledReason)}
          className={`palette-option${active?.id === command.id ? " palette-option-active" : ""}`}
          onMouseMove={() => setActiveId(command.id)} onMouseDown={(event) => event.preventDefault()} onClick={() => execute(command)}>
          <span className="palette-category">{command.category}</span>
          <span className="palette-description"><strong>{command.label}</strong>{command.disabledReason && <small>{command.disabledReason}</small>}</span>
          {command.shortcut && <kbd>{command.shortcut}</kbd>}
        </div>)}
        {!results.length && <p className="palette-empty" role="status">No matching commands. Try “돌출”, “align”, or “save”.</p>}
      </div>
      <footer className="palette-footer"><span>{results.length} commands</span><span>↑ ↓ Navigate · Enter Run · Esc Close</span></footer>
    </dialog>
  );
}
