import {CadCommand} from './commands';

export const commandSchemas: Record<string, any> = {
  'create-box': {
    type: 'object',
    properties: {
      type: {type: 'string', const: 'create-box'},
      id: {type: 'string'},
      width: {type: 'number'},
      depth: {type: 'number'},
      height: {type: 'number'},
      position: {
        type: 'array',
        items: {type: 'number'},
        minItems: 3,
        maxItems: 3
      }
    },
    required: ['type', 'width', 'depth', 'height']
  },
  'boolean-cut': {
    type: 'object',
    properties: {
      type: {type: 'string', const: 'boolean-cut'},
      target: {type: 'string'},
      tool: {type: 'string'}
    },
    required: ['type', 'target', 'tool']
  },
  'fillet': {
    type: 'object',
    properties: {
      type: {type: 'string', const: 'fillet'},
      target: {type: 'string'},
      edges: {
        type: 'array',
        items: {type: 'string'}
      },
      radius: {type: 'number'}
    },
    required: ['type', 'target', 'edges', 'radius']
  }
};