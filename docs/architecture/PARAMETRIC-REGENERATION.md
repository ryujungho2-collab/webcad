# Parametric feature regeneration

Updated 2026-10-04. Current scope and whole-suite results are in
[PROJECT-STATE](../../PROJECT-STATE.md); this document owns regeneration policy.

Source edits now rebuild existing Extrude, Revolve, Sweep, Loft, Boolean,
Fillet and Chamfer dependents in dependency order. This includes solved sketch
dimensions, drawing controls, feature parameters and object transforms. Names
and visibility do not invalidate geometry. Unrelated branches retain their
parameters and avoid kernel work.

## Document and transaction behavior

`CadFeature.inputs` identifies source objects. New derived features use
`dependencyMode: "live"`. Boolean and edge treatments retain their source
objects/features and layer membership, hide them and remove them from
`rootObjects`. The Model tree exposes these sources beneath their result;
showing a source makes it renderable and selectable for editing. Final model
exports still use visible root objects.

Each document command runs on a detached proposal. Ordinary batch children
regenerate before the next child runs, so later operations use current geometry.
A batch containing only coupled variable/binding/sketch-dimension drivers
instead solves and rebuilds the final driver state together; a temporary
intermediate value must not reject a valid final profile. The live document
is published only after the entire operation
succeeds. One history entry restores the source, dependent geometry, dimensions,
layers and visibility together. Failed regeneration or Worker cancellation
preserves the document, revision and Undo/Redo stacks.

Deleting a referenced input is rejected. Delete its dependent features first.
Deleting a final result restores its unused direct source objects to the model.
Show All reveals root objects without revealing retained construction history.
A dependent output on a locked layer blocks its source geometry edit.

## Compatibility and limits

- Source links survive JSON save/open. Legacy features with intact source
  objects can regenerate. Legacy consumed operands whose originals were already
  deleted remain snapshots; missing history cannot be reconstructed.
- Duplicated solids are independent snapshots with no live inputs.
- Fillet/Chamfer edge references use existing geometric fingerprints. If an
  edit changes a selected edge so its reference cannot resolve, the entire
  initiating edit is rejected with a reason. Automatic topology remapping is
  not implemented.
- Profile closure, work-plane and solid-operation validation still apply.
  Boolean/edge-treatment inputs with non-unit scale remain unsupported.
- Dependency traversal and transaction cloning scan the whole document. This
  milestone establishes correctness; it does not claim improved large-model
  performance. Retained sources and nested operand snapshots increase storage.

## Verification

`pnpm --filter @agent-webcad/web test` covers source edits, branching dependencies,
full profile → extrusion → Boolean → Fillet/Chamfer chains, sweep paths, ordered
loft sections and revolve geometry. Assertions check analytic dimensions,
mesh bounds and volumes, export geometry, complete Undo/Redo state, source
preservation, locked/missing inputs, stale edge references, cycles, failed
batches and save/open compatibility. Curved display meshes use tolerances
matching the kernel's tessellation; exact profile dimensions are checked
separately.

On the development server, open `/tests/featureRegeneration.browser.html` and
press **Run regeneration checks**. Its eight checks use the real browser
Worker, including transferable mesh buffers, publication atomicity during
progress, cancellation, queue release, Worker recovery and reopening.
