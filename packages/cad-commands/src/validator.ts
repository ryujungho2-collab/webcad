import {CadCommand} from './commands';
import {commandSchemas} from './schemas';

export function validateCommand(command: CadCommand): boolean {
  // Simple validation using JSON schema approach
  if (!commandSchemas[command.type]) {
    return false;
  }

  // In a real implementation, we would use a proper schema validator
  // For now, we'll just check required fields
  switch (command.type) {
    case 'create-box':
      const boxCommand = command as any;
      return typeof boxCommand.width === 'number' &&
             typeof boxCommand.depth === 'number' &&
             typeof boxCommand.height === 'number';
    case 'boolean-cut':
      const cutCommand = command as any;
      return typeof cutCommand.target === 'string' &&
             typeof cutCommand.tool === 'string';
    case 'fillet':
      const filletCommand = command as any;
      return typeof filletCommand.target === 'string' &&
             Array.isArray(filletCommand.edges) &&
             typeof filletCommand.radius === 'number';
    default:
      return false;
  }
}