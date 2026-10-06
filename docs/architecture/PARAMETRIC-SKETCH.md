# Parametric Sketch Mode

Updated 2026-10-04. This is the sketch model/solver contract. Current product
scope and whole-suite results are in [PROJECT-STATE](../../PROJECT-STATE.md).

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
`1e-6` internal millimetres for geometric residuals, enlarged only by the
coordinate roundoff policy for large absolute coordinates. Angle residuals
use an independent `1e-8` radian tolerance and are normalized into the linear
solver's residual space. Each connected component is translated to a local
origin before numerical differentiation; fixed anchors are translated with it
and the accepted geometry is shifted back. The solved state records both
tolerances. Conflicting or nonconvergent proposals
return their nonzero-residual constraint IDs. Command handlers solve a detached
proposal and commit only on success, so rejected/no-op edits do not alter the
document or create History entries. Batch commands retain their existing
rollback boundary.

Supported constraints include Coincident, Horizontal, Vertical, fixed point,
linear Distance, Radius, Diameter and signed Angle between two lines. The fixed
point is an anchor for translation DOF. Extended saved relations add Parallel,
Perpendicular, Equal length/radius, Concentric, signed line-circle and internal/
external circle tangency, Point on supporting line/full circle, and Symmetry
about a persistent straight edge. Their exact targets, canvas review, circular
drag guides, DOF/conflict handling and v5 serialization are described in
[extended relations](../implementation/EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md).
Arc-contact domains and point-on-arc remain unsupported; do not treat full-circle
relations as constraints on a bounded arc.

## Profiles and migration

`recognizeSketchProfiles` returns boundaries derived from the **solved sketch**
and referencing stable source topology. It recognizes rectangle, circle,
closed straight polyline, and explicitly Coincident-connected line loops.
Mere nearby endpoints do not close a line loop. It rejects open, branching,
zero-area and ordinary self-crossing line loops. Multiple independent profiles
are returned separately; this dedicated recognizer does not classify nesting.
Solid features consume the sketch's drawing projections through
`extractSketchLoops`. Solved source changes now regenerate dependent solids
with nested hole boundaries and independent islands supported by extrusion.
They regenerate inside the same transaction; see [regeneration](PARAMETRIC-REGENERATION.md). The dedicated
recognized-profile representation is still separate from the kernel bridge.

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

### Basic sketch editing (2026-10-03)

Sketch Mode now supports Move, Rotate, uniform Scale, Duplicate, Offset,
Trim and Extend through typed sketch commands. Transforms edit the original
plane-local coordinates and leave projection object transforms at identity.
Rectangles retain corner/edge IDs and intrinsic width/height while rotating;
their optional `angle` is in radians and defaults to zero for existing files.
Orientation is fixed during constraint solving (the rectangle still has four
DOF); Rotate explicitly changes it. A corner drag anchors the opposite corner.
An edge drag changes its perpendicular extent and anchors the opposite edge.
Crossing the opposite side is rejected.

Temporary point targets enforce the requested drag/transform during solving.
They are removed before persistence and DOF calculation. Contradictory driving
dimensions or fixed points reject the whole transaction with constraint IDs
and kinds, including any dependent solid regeneration. Duplicate remaps all
geometry/topology/constraint/dimension IDs, copies relations internal to the
selection, translates copied fixed anchors and leaves external relations on
the original geometry. Offset creates unconstrained editable geometry.
Trim/Extend preserve retained line and arc IDs; changing a constrained
polyline's vertex count requires removing its affected constraints first.
Circle Trim converts the original circle into an arc with retained centre
and curve IDs. Deleting an entity cleans its owned relations and dimensions
in the same Undo step; live solid dependencies still protect their sources.

Drawing tools remain active after commits. First-point `x,y` accepts units
(for example `0,0` or `2m,1m`); rectangle `width,height` and line `length<angle`
follow. Esc clears partial input, then exits an idle tool without clearing the
selection. Width/Height are named distinctly in the Inspector and dimension
fields accept units. 2D precision transforms and gizmos use the work plane:
XY → Z, XZ → −Y, YZ → X rotation, with two-value Move input in local coordinates.
The 2D Inspector disables off-plane position/rotation axes. Fit and standard
views terminate pending workspace animations before setting their camera
target; 2D Fit always preserves the plane-normal view.

The foundational stage passed 288 Node tests and 13 React UI/Worker checks.
These are historical counts. Current whole-suite results and commands are in
[PROJECT-STATE](../../PROJECT-STATE.md) and [README](../../README.md).
The [ordered-milestone checks](../verification/WORKFLOW-VERIFICATION-2026-10-03.md),
[precision/recovery checks](../verification/CORE-VERIFICATION-2026-10-03.md) and
[driving expressions](VARIABLES-AND-EXPRESSIONS.md) retain their stage evidence.
`pnpm --filter @agent-webcad/web test:browser` runs separately from Node tests.
Manual browser checks cover corner/edge dragging, Move gizmo, Trim/Extend
pointer picks and Undo/Redo. The camera regression compares equal horizontal
and vertical pixel spans through actual pointer drawing after Fit interrupts
a workspace transition. The browser harness runs separately from `pnpm test`;
use a fresh localhost port because it creates a new test document in that
origin's local cache.

Independent constrained components solve separately. A giant connected
constraint graph still uses a dense normal-equation solve and may block the
main thread. A large connected sketch needs sparse/iterative algebra or a
Worker boundary. A direct consumer of the dedicated recognized-profile
representation, arbitrary face work planes and nonuniform sketch scaling
remain future work. The exact drawing bridge supports hole regions and
extrusion sessions. Canvas driving dimensions, constraint glyphs, automatic
Coincident/Horizontal/Vertical relations and construction geometry are implemented.
A failed constraint is displayed without persisting a broken document state.

Current implementation order and acceptance criteria are maintained in
[NEXT-STEPS.md](../../NEXT-STEPS.md). The ordered milestones and the remaining
output/interaction boundaries are recorded in
[WORKFLOW-VERIFICATION-2026-10-03.md](../verification/WORKFLOW-VERIFICATION-2026-10-03.md).
