export type VariableQuantity = "length" | "angle" | "scalar";
export type CadVariable = { name: string; quantity: VariableQuantity; expression: string };
export type ExpressionValue = { value: number; length: number; angle: number };
export type EvaluatedVariable = { name: string; quantity: VariableQuantity; value: number; unit: "mm" | "rad" | ""; dependencies: string[] };

const units: Record<string, ExpressionValue> = {
  mm: {value:1,length:1,angle:0}, cm: {value:10,length:1,angle:0}, m: {value:1000,length:1,angle:0},
  in: {value:25.4,length:1,angle:0}, ft: {value:304.8,length:1,angle:0},
  rad: {value:1,length:0,angle:1}, deg: {value:Math.PI/180,length:0,angle:1},
};
const functions = new Set(["min", "max", "abs", "clamp", "sin", "cos", "tan"]);
export function validVariableName(name: unknown): name is string {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) &&
    !Object.hasOwn(units, name) && !functions.has(name) && !["pi", "__proto__", "prototype", "constructor"].includes(name);
}
const scalar = (value: number): ExpressionValue => ({value,length:0,angle:0});
const sameUnits = (a: ExpressionValue, b: ExpressionValue) => a.length === b.length && a.angle === b.angle;
function checked(value: ExpressionValue) {
  if (!Number.isFinite(value.value)) throw new Error("Expression result must be finite (check division by zero or overflow).");
  return value;
}

/** Bounded arithmetic grammar; no JavaScript evaluation, property access or assignments. */
export function evaluateExpression(expression: string, resolve: (name: string) => ExpressionValue): {result:ExpressionValue;dependencies:string[]} {
  if (typeof expression !== "string" || !expression.trim() || expression.length > 512) throw new Error("Expression must contain 1–512 characters.");
  const tokens: string[] = [];
  let position = 0;
  while (position < expression.length) {
    if (/\s/.test(expression[position])) { position++; continue; }
    const token = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z_][A-Za-z0-9_]*|^[()+\-*/,]/.exec(expression.slice(position))?.[0];
    if (!token) throw new Error(`Unexpected expression character at ${position + 1}.`);
    tokens.push(token); position += token.length;
    if (tokens.length > 128) throw new Error("Expression is too complex.");
  }
  let index = 0, depth = 0;
  const dependencies = new Set<string>();
  const consume = (token: string) => { if (tokens[index] !== token) throw new Error(`Expected '${token}' in expression.`); index++; };
  const expressionValue = (): ExpressionValue => {
    let value = product();
    while (["+", "-"].includes(tokens[index])) {
      const operator = tokens[index++], right = product();
      if (!sameUnits(value, right)) throw new Error("Cannot add or subtract different quantities.");
      value = checked({...value,value:operator === "+" ? value.value + right.value : value.value - right.value});
    }
    return value;
  };
  const product = (): ExpressionValue => {
    let value = primary();
    while (["*", "/"].includes(tokens[index])) {
      const operator = tokens[index++], right = primary(), sign = operator === "*" ? 1 : -1;
      value = checked({value:operator === "*" ? value.value * right.value : value.value / right.value,
        length:value.length+sign*right.length,angle:value.angle+sign*right.angle});
    }
    return value;
  };
  const primary = (): ExpressionValue => {
    if (++depth > 32) throw new Error("Expression nesting is too deep.");
    try {
      const token = tokens[index++];
      if (token === "+" || token === "-") { const value = primary(); return {...value,value:token === "-" ? -value.value : value.value}; }
      if (token === "(") { const value = expressionValue(); consume(")"); return value; }
      if (token && /^(?:\d|\.)/.test(token)) {
        const value = Number(token), unit = Object.hasOwn(units, tokens[index]) ? units[tokens[index++]] : scalar(1);
        return checked({...unit,value:value*unit.value});
      }
      if (!token || !/^[A-Za-z_]/.test(token)) throw new Error("Expected a number, variable or parenthesized expression.");
      if (tokens[index] === "(") {
        if (!functions.has(token)) throw new Error(`Unknown expression function: ${token}.`);
        consume("("); const args = [expressionValue()];
        while (tokens[index] === ",") { index++; args.push(expressionValue()); }
        consume(")");
        if (["sin", "cos", "tan"].includes(token)) {
          if (args.length !== 1 || args[0].length !== 0 || args[0].angle !== 1) throw new Error(`${token} requires one angle.`);
          return checked(scalar(Math[token as "sin"|"cos"|"tan"](args[0].value)));
        }
        if ((token === "abs" && args.length !== 1) || (token === "clamp" && args.length !== 3) || (["min", "max"].includes(token) && args.length < 2)) throw new Error(`Invalid argument count for ${token}.`);
        if (!args.every(value => sameUnits(value, args[0]))) throw new Error(`${token} arguments must have the same quantity.`);
        if (token === "clamp" && args[1].value > args[2].value) throw new Error("clamp minimum exceeds maximum.");
        const values = args.map(value => value.value);
        const value = token === "min" ? Math.min(...values) : token === "max" ? Math.max(...values) : token === "abs" ? Math.abs(values[0]) : Math.max(values[1], Math.min(values[2], values[0]));
        return checked({...args[0],value});
      }
      if (token === "pi") return scalar(Math.PI);
      if (!validVariableName(token)) throw new Error(`Invalid variable reference: ${token}.`);
      dependencies.add(token); return checked({...resolve(token)});
    } finally { depth--; }
  };
  const result = expressionValue();
  if (index !== tokens.length) throw new Error(`Unexpected token '${tokens[index]}' in expression.`);
  return {result,dependencies:[...dependencies]};
}

export function assertExpressionQuantity(value: ExpressionValue, quantity: VariableQuantity) {
  const length = quantity === "length" ? 1 : 0, angle = quantity === "angle" ? 1 : 0;
  if (value.length !== length || value.angle !== angle) throw new Error(`Expected ${quantity}; use compatible units (mm or rad/deg).`);
}

export function evaluateVariables(variables: Record<string, CadVariable> = {}): Record<string, EvaluatedVariable> {
  if (!variables || typeof variables !== "object" || Array.isArray(variables) || Object.keys(variables).length > 256) throw new Error("Invalid variable collection (maximum 256).");
  const values: Record<string, EvaluatedVariable> = {}, visiting: string[] = [];
  const visit = (name: string): ExpressionValue => {
    if (visiting.includes(name)) throw new Error(`Cyclic variable dependency: ${[...visiting,name].join(" → ")}.`);
    if (Object.hasOwn(values,name)) { const value = values[name]; return {value:value.value,length:value.quantity === "length" ? 1 : 0,angle:value.quantity === "angle" ? 1 : 0}; }
    if (!Object.hasOwn(variables,name)) throw new Error(`Unknown variable: ${name}.`);
    const variable = variables[name];
    if (!validVariableName(name) || !variable || variable.name !== name || !["length","angle","scalar"].includes(variable.quantity)) throw new Error(`Invalid variable: ${name}.`);
    if (visiting.length >= 64) throw new Error("Variable dependency chain is too deep.");
    visiting.push(name);
    try {
      const evaluated = evaluateExpression(variable.expression, visit);
      assertExpressionQuantity(evaluated.result,variable.quantity);
      values[name] = {name,quantity:variable.quantity,value:evaluated.result.value,unit:variable.quantity === "length" ? "mm" : variable.quantity === "angle" ? "rad" : "",dependencies:evaluated.dependencies};
      return evaluated.result;
    } catch (error) { throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { visiting.pop(); }
  };
  for (const name of Object.keys(variables)) visit(name);
  return values;
}
