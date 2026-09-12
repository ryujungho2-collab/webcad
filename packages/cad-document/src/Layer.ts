export interface CadLayer {
  id: string;
  name: string;

  visible: boolean;
  locked: boolean;

  objectIds: string[];
}