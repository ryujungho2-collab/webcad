import { CadViewport } from "./viewport/CadViewport";

export function App() {
  return (
    <main className="app">
      <header className="toolbar">
        <strong>agent-webcad</strong>
      </header>

      <section className="viewport-shell">
        <CadViewport />
      </section>
    </main>
  );
}
