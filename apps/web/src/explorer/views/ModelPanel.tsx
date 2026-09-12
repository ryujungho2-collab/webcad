import {
  cadDocument,
} from "../../state/cadDocument";

type ModelPanelProps = {
  selectedObjectId:
    | string
    | null;

  onSelectObject: (
    objectId: string
  ) => void;
};

export function ModelPanel({
  selectedObjectId,
  onSelectObject,
}: ModelPanelProps) {
  return (
    <div className="side-panel-content">
      <h2>Model</h2>

      {cadDocument.rootObjects.map(
        (objectId) => {
          const object =
            cadDocument.objects[
              objectId
            ];

          if (!object) {
            return null;
          }

          return (
            <button
              key={objectId}
              type="button"
              className={
                objectId ===
                selectedObjectId
                  ? "model-row model-row-selected"
                  : "model-row"
              }
              onClick={() =>
                onSelectObject(
                  objectId
                )
              }
            >
              <span>
                {object.name}
              </span>
            </button>
          );
        }
      )}
    </div>
  );
}