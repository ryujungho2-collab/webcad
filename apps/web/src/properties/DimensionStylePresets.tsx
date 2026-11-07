import { useState } from "react";
import { validDimensionStylePresetName, type CadDimensionStylePreset } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { PropertySection } from "../ui/PropertySection";

type Props = {
  objectIds: string[];
  presets: CadDimensionStylePreset[];
  disabled: boolean;
  onDocumentChange: () => void;
};

export function DimensionStylePresets({ objectIds, presets, disabled, onDocumentChange }: Props) {
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const preset = presets.find(entry => entry.name === chosen) ?? presets[0];

  async function run(command: CadCommand, success: string) {
    setBusy(true);
    setFeedback("");
    try {
      const result = await dispatchCadCommand(command);
      if (!result.ok) {
        setFeedback(result.reason ?? "Dimension style command rejected.");
        return;
      }
      if (command.type === "save-dimension-style-preset") {
        setChosen(command.name.trim());
        setName("");
      }
      setFeedback(result.changed ? success : "The selected dimensions already use these values.");
      onDocumentChange();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Dimension style command failed.");
    } finally {
      setBusy(false);
    }
  }

  const unavailable = disabled || busy;
  return (
    <PropertySection title="Dimension styles" meta={`${presets.length} saved`}>
      {objectIds.length === 1 && <>
        <label className="property-row"><span>Preset name</span>
          <input aria-label="Dimension style preset name" value={name} maxLength={80} disabled={unavailable}
            onChange={event => setName(event.target.value)} />
        </label>
        <div className="property-actions">
          <button type="button" disabled={unavailable || !validDimensionStylePresetName(name)}
            onClick={() => void run({ type: "save-dimension-style-preset", objectId: objectIds[0], name }, "Dimension style saved.")}>
            Save dimension style
          </button>
        </div>
      </>}
      <label className="property-row"><span>Saved preset</span>
        <select aria-label="Saved dimension style" disabled={unavailable || !preset} value={preset?.name ?? ""}
          onChange={event => setChosen(event.target.value)}>
          {!preset && <option value="">No saved styles</option>}
          {presets.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
        </select>
      </label>
      {preset && <p className="property-hint">
        {preset.style.lengthUnit} · {preset.style.precision} decimals · Text {preset.style.textHeight} · Arrow {preset.style.arrowSize}
      </p>}
      <div className="property-actions">
        <button type="button" disabled={unavailable || !preset}
          onClick={() => preset && void run({ type: "apply-dimension-style-preset", objectIds, name: preset.name },
            `Dimension style applied to ${objectIds.length} selected.`)}>
          Apply dimension style
        </button>
      </div>
      {feedback && <p className="property-hint" role="status">{feedback}</p>}
    </PropertySection>
  );
}
