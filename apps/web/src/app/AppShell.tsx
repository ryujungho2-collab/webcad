import type {
  ReactNode,
} from "react";

import {
  ActivityBar,
  type ActivityId,
} from "../activity/ActivityBar";

import {
  MenuBar,
} from "../menu/MenuBar";

import {
  Ribbon,
} from "../ribbon/Ribbon";

import {
  ExplorerPanel,
} from "../explorer/ExplorerPanel";

import {
  StatusBar,
} from "../status/StatusBar";

type AppShellProps = {
  activeActivity:
    ActivityId;

  documentRevision:
    number;

  selectedLayerId:
    string;

  selectedObjectId:
    string | null;

  onChangeActivity: (
    activity: ActivityId
  ) => void;

  onSelectLayer: (
    layerId: string
  ) => void;

  onSelectObject: (
    objectId: string
  ) => void;

  onDocumentChange:
    () => void;

  onCreateBox:
    () => void;

  onUndo:
    () => void;

  onRedo:
    () => void;

  onSave?: () => void;

  onSaveAs?: () => void;

  onOpen?: () => void;

  children:
    ReactNode;

  properties:
    ReactNode;
};

export function AppShell({
  activeActivity,
  documentRevision,
  selectedLayerId,
  selectedObjectId,
  onChangeActivity,
  onSelectLayer,
  onSelectObject,
  onDocumentChange,
  onCreateBox,
  onUndo,
  onRedo,
  onSave,
  onSaveAs,
  onOpen,
  children,
  properties,
}: AppShellProps) {
  return (
    <main className="app-shell">
      <MenuBar
        onSave={
          onSave
        }
        onSaveAs={
          onSaveAs
        }
        onOpen={
          onOpen
        }
        onUndo={
          onUndo
        }
        onRedo={
          onRedo
        }
      />

      <Ribbon
        onCreateBox={
          onCreateBox
        }
        onUndo={
          onUndo
        }
        onRedo={
          onRedo
        }
        onSave={
          onSave
        }
      />

      <div className="workbench">
        <ActivityBar
          activeActivity={
            activeActivity
          }
          onChange={
            onChangeActivity
          }
        />

        <ExplorerPanel
          activeActivity={
            activeActivity
          }
          documentRevision={
            documentRevision
          }
          selectedLayerId={
            selectedLayerId
          }
          selectedObjectId={
            selectedObjectId
          }
          onSelectLayer={
            onSelectLayer
          }
          onSelectObject={
            onSelectObject
          }
          onDocumentChange={
            onDocumentChange
          }
        />

        <section className="workbench-viewport">
          {children}
        </section>

        <aside className="workbench-properties">
          {properties}
        </aside>
      </div>

      <StatusBar
        selectedObjectId={
          selectedObjectId
        }
      />
    </main>
  );
}