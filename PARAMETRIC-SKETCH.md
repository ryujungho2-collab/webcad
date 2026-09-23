# Parametric Sketch Mode

This milestone adds a document-owned `sketches` collection without changing the
existing drawing Feature representation. A sketch has a work plane, layer,
local 2D geometry, persistent geometry/control/edge IDs, constraints, dimension
references, and a solved state. Internal lengths are millimetres; angle values
are radians. A dimension's driving value is stored only in its constraint.

## Solver and transaction boundary

`solveSketch` is a pure TypeScript operation. It partitions geometry by the
constraint graph, evaluates equation residuals, uses a damped least-squares
step with a numerical Jacobian, and estimates remaining degrees of freedom
from Jacobian row rank at the accepted solution. A successful solve with
nonzero DOF is **under-constrained**, not fully constrained. Tolerance is
`1e-6` internal millimetres for geometric residuals; angle residuals use the
same numeric threshold in radians. Conflicting or nonconvergent proposals
return their nonzero-residual constraint IDs. Command handlers solve a detached
proposal and commit only on success, so rejected/no-op edits do not alter the
document or create History entries. Batch commands retain their existing
rollback boundary.

Supported constraints: Coincident, Horizontal, Vertical, fixed point, linear
Distance, Radius, Diameter, and signed Angle between two lines. The fixed-point
constraint is the anchor needed to remove translation DOF. Parallel,
Perpendicular, Tangent, Concentric and Equal are not yet implemented.

## Profiles and migration

`recognizeSketchProfiles` returns boundaries derived from the **solved sketch**
and referencing stable source topology. It recognizes rectangle, circle,
closed straight polyline, and explicitly Coincident-connected line loops.
Mere nearby endpoints do not close a line loop. It rejects open, branching,
zero-area and ordinary self-crossing line loops. Multiple independent profiles
are returned separately; loop nesting/holes are deliberately not classified.
No new solid feature consumes this profile type yet.

Sketch Mode is entered from the ribbon on the active XY/XZ/YZ plane and may
be re-entered from the Model Explorer. Existing drawing tools create sketch
entities through `add-sketch-geometry`. The sketch owns their local geometry;
the drawing Feature and object are derived projections for viewport rendering,
SelectionState, topology picking and OSNAP. A successful solve updates only
affected projections. The Inspector exposes only the supported relationships,
editable driving values and DOF status. The viewport's Direct mode uses the
same persistent control IDs. Document mutations still pass through CommandBus.

`adaptLegacyDrawingsToSketch` is a read-only bridge for untransformed,
coplanar Line/Polyline/axis-aligned Rectangle/Circle drawings. It retains
existing topology IDs and never persists a duplicate geometry source. Curved
polyline segments, Arc, transformed drawings, off-plane drawings, and mixed
layers/planes are rejected explicitly. Existing documents remain in their
original drawing format; no silent migration is performed. New Sketch Mode
entities support Arc as well as Line, Polyline, Rectangle and Circle, but the
legacy migration path is intentionally separate.

## Scaling and next correctness work

Independent constrained components solve separately. A giant connected
constraint graph still uses a dense normal-equation solve and may block the
main thread. A large connected sketch needs sparse/iterative algebra or a
Worker boundary. Curve-inclusive profile nesting/holes and a Sketch Profile
consumer remain future work. Rectangle single-corner editing and sketch-owned
segment translation are not defined; use whole-entity dimensions and supported
point handles instead. A failed constraint is shown as an Inspector error but
is not persisted as a broken document state.
