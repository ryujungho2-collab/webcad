type GeometryId = string;

export class GeometryRegistry {
  private shapes = new Map<GeometryId, unknown>();

  set(id: GeometryId, shape: unknown) {
    this.shapes.set(id, shape);
  }

  get(id: GeometryId) {
    return this.shapes.get(id);
  }

  delete(id: GeometryId) {
    this.shapes.delete(id);
  }
}