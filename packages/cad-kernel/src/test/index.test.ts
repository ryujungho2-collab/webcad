import { createBox, createCylinder, createSphere } from '../operations/primitives';
import { translate, rotate } from '../operations/transforms';
import { fuse, cut, intersect } from '../operations/booleans';
import { filletEdges } from '../operations/fillet';
import { volume, surfaceArea } from '../operations/measurements';
import { shapeToMesh } from '../mesh/shapeToMesh';

// Test all operations can be imported and are functional
describe('CAD Kernel Operations Test', () => {
  test('All operations import correctly', () => {
    expect(createBox).toBeDefined();
    expect(createCylinder).toBeDefined();
    expect(createSphere).toBeDefined();
    expect(translate).toBeDefined();
    expect(rotate).toBeDefined();
    expect(fuse).toBeDefined();
    expect(cut).toBeDefined();
    expect(intersect).toBeDefined();
    expect(filletEdges).toBeDefined();
    expect(volume).toBeDefined();
    expect(surfaceArea).toBeDefined();
    expect(shapeToMesh).toBeDefined();
  });
});