# Agent WebCAD Project State

## Product Goal

Build an AI-native professional Web CAD system combining:

- AutoCAD precision
- Illustrator direct drawing/editing
- Figma interaction patterns
- Blender spatial modeling
- parametric CAD workflows
- AI-agent controlled CAD commands

## Architecture

User / Agent
    ↓
CadCommand
    ↓
CommandBus
    ↓
CadDocument
    ↓
History
    ↓
Kernel / Viewport

All meaningful CAD mutations should remain undoable.

## Implemented

### Kernel
- OpenCascade.js 2.x
- Box
- Cylinder
- Sphere
- Cone
- Torus
- Boolean operations
...

### 2D Drawing
- Line
- Polyline
- Rectangle
- Circle
- Arc

### Precision
- Grid
- OSNAP
  - Endpoint
  - Midpoint
  - Center
  - Intersection
  - Perpendicular
  - Tangent
  - Nearest
- Ortho
- numeric distance/angle input
- XY/XZ/YZ work planes
- smart-guide feedback

### Selection
- SelectionState
- ids
- primaryId
- Shift/Ctrl/Cmd additive selection
- viewport/explorer synchronization
- batch delete
- selection bounds

### View
- 2D/3D workspace transition
- Top/Front/Right/Iso
- Perspective/Orthographic
...

## Partial

- Multi-selection Inspector
- multi-object transform
- measurement workflow
...

## Deferred

- Mixed-value Inspector
- Align / Distribute
- Direct Select
- Offset
- Trim / Extend
- Sketch constraints
- Extrude / Revolve / Loft / Sweep
- Components / Instances
- Variants
- Infinite Canvas
- Node Graph
- AI Agent

## Product Ideas

### Illustrator inspiration
Direct Selection
Shape Builder
Smart Guides
Offset Path
Live Corners

### Figma inspiration
Components
Instances
Variants
Multi-select
Align/Distribute
Infinite Canvas

### Blender inspiration
Viewport-first workflow
Multi View
Nodes
G/R/S style interaction

## Current Priority

Finish selection architecture:

1. Mixed-value Inspector
2. Multi-object transform
3. Multi Duplicate
4. Align / Distribute

Then:

5. Direct topology selection
6. Offset
7. Trim / Extend

Then move toward Sketch Constraints.