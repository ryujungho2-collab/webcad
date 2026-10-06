import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export type ModuleInfo = {
  file: string;
  dependencies: { module: string; typeOnly: boolean }[];
  contractHasRuntime?: boolean;
};
export type ArchitectureIssue = { code: string; file: string; detail: string };
const slash = (path: string) => path.replaceAll("\\", "/");
const pure = (file: string) => file.startsWith("src/precision/") || file.startsWith("src/features/drawing-editing/geometry/");
const contracts = "src/features/drawing-editing/contracts.ts";
const drawingCommands = "src/features/drawing-editing/commands/";
const application = (module: string) => module.startsWith("src/state/") || module.startsWith("src/viewport/")
  || module.startsWith("src/ui/") || module.startsWith("src/app/") || module.startsWith("src/properties/")
  || module.includes("/ui/") || module === "src/App.tsx" || /^react(?:-dom)?(?:\/|$)/.test(module);

/** Enforce dependency direction, including type-only imports and lazy imports. */
export function reviewModuleGraph(modules: ModuleInfo[]): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [], graph = new Map(modules.map(module => [module.file, module]));
  for (const source of modules) {
    if (source.file === contracts && (source.contractHasRuntime || source.dependencies.some(d => !d.typeOnly))) {
      issues.push({ code: "runtime-contract", file: source.file, detail: "Canvas contracts must contain only types and type imports." });
    }
    for (const dependency of source.dependencies) {
      const target = dependency.module;
      if (pure(source.file) && !(pure(target) || target === contracts && dependency.typeOnly
        || target === "three" || target.startsWith("@agent-webcad/"))) {
        issues.push({ code: "geometry-boundary", file: source.file, detail: `Pure geometry depends on ${target}. Pass data into the operation instead.` });
      }
      if ((source.file.startsWith(drawingCommands) || source.file === "src/features/drawing-editing/registerCommands.ts") && application(target)) {
        issues.push({ code: "command-boundary", file: source.file, detail: `Command adapter depends on ${target}. Use the supplied transaction document.` });
      }
    }
  }
  // A shared geometry cycle can remain hidden until another feature imports it.
  const visited = new Set<string>(), active: string[] = [], reported = new Set<string>();
  function visit(file: string) {
    const at = active.indexOf(file);
    if (at >= 0) {
      const cycle = active.slice(at), key = [...cycle].sort().join("|");
      if (!reported.has(key)) { reported.add(key); issues.push({ code: "geometry-cycle", file, detail: [...cycle, file].join(" → ") }); }
      return;
    }
    if (visited.has(file)) return;
    active.push(file);
    for (const dependency of graph.get(file)?.dependencies ?? []) {
      if (!dependency.typeOnly && pure(dependency.module) && graph.has(dependency.module)) visit(dependency.module);
    }
    active.pop(); visited.add(file);
  }
  for (const module of modules) if (pure(module.file)) visit(module.file);
  return issues;
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function imports(source: ts.SourceFile) {
  const dependencies: { module: string; typeOnly: boolean }[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause, bindings = clause?.namedBindings;
      const typeOnly = !!clause && (clause.isTypeOnly || !clause.name && !!bindings
        && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly));
      dependencies.push({ module: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.exportClause;
      dependencies.push({ module: node.moduleSpecifier.text, typeOnly: node.isTypeOnly
        || !!clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every(e => e.isTypeOnly) });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      dependencies.push({ module: node.argument.literal.text, typeOnly: true });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      dependencies.push({ module: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return dependencies;
}

export function inspectSourceTree(webRoot: string) {
  const modules: ModuleInfo[] = [], issues: ArchitectureIssue[] = [];
  for (const file of [...filesUnder(join(webRoot, "src")), ...filesUnder(join(webRoot, "tests"))]) {
    if (!/\.tsx?$/.test(file) || file.endsWith(".d.ts")) continue;
    const name = slash(relative(webRoot, file)), source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const dependencies = imports(source).map(dependency => {
      if (!dependency.module.startsWith(".")) return dependency;
      const base = resolve(dirname(file), dependency.module), extension = extname(base);
      const target = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"),
        ...(extension === ".js" ? [base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx"] : [])].find(path => existsSync(path) && extname(path));
      if (!target) issues.push({ code: "missing-import", file: name, detail: dependency.module });
      return { ...dependency, module: slash(relative(webRoot, target ?? base)) };
    });
    const contractHasRuntime = name === contracts && source.statements.some(statement =>
      !ts.isTypeAliasDeclaration(statement) && !ts.isInterfaceDeclaration(statement)
      && !(ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly)
      && !(ts.isExportDeclaration(statement) && statement.isTypeOnly) && !ts.isEmptyStatement(statement));
    modules.push({ file: name, dependencies, contractHasRuntime });
  }
  return { modules, issues: [...issues, ...reviewModuleGraph(modules)] };
}

export function inspectDocumentationLinks(workspace: string): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [], files = [...readdirSync(workspace).filter(name => name.endsWith(".md")).map(name => join(workspace, name)), ...filesUnder(join(workspace, "docs")).filter(file => file.endsWith(".md"))];
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(link)) continue;
      const target = decodeURIComponent(link.split("#")[0]);
      if (!existsSync(resolve(dirname(file), target))) issues.push({ code: "missing-doc-link", file: slash(relative(workspace, file)), detail: link });
    }
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."), workspace = resolve(webRoot, "../..");
  const result = inspectSourceTree(webRoot), issues = [...result.issues, ...inspectDocumentationLinks(workspace)];
  if (issues.length) { for (const issue of issues) console.error(`${issue.code}: ${issue.file}: ${issue.detail}`); process.exitCode = 1; }
  else console.log(`Architecture check passed: ${result.modules.length} modules, geometry/command/type boundaries and documentation links.`);
}
