import { useState } from "react";
import { CadViewport } from "./viewport/CadViewport";
import { cadDocument } from "./state/cadDocument";
import "./styles.css";

export function App() {
  const [selectedObjectId, setSelectedObjectId] =
    useState<string | null>(null);

  const selectedObject =
    selectedObjectId
      ? cadDocument.objects[selectedObjectId]
      : null;

  return (
    <main className="app">
      <header className="toolbar">
        <strong>agent-webcad</strong>
      </header>

      <section className="workspace">
        <div className="viewport-shell">
          <CadViewport
            onSelectObject={setSelectedObjectId}
          />
        </div>

        <aside className="properties-panel">
          <h2>Properties</h2>

          {selectedObject ? (
            <>
              <div>
                <strong>Name</strong>
                <div>{selectedObject.name}</div>
              </div>

              <div>
                <strong>ID</strong>
                <div>{selectedObject.id}</div>
              </div>

              <div>
                <strong>Geometry</strong>
                <div>{selectedObject.geometryId}</div>
              </div>

              <div>
                <strong>Visible</strong>
                <div>
                  {selectedObject.visible
                    ? "Yes"
                    : "No"}
                </div>
              </div>
            </>
          ) : (
            <div>No object selected</div>
          )}
        </aside>
      </section>
    </main>
  );
}
