import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({ tsConfigFilePath: '../tsconfig.json' });

const sourceFiles = project.getSourceFiles('../src/routes/api/public/**/*.ts');

for (const sourceFile of sourceFiles) {
  let changed = false;

  // Add imports
  const validateImport = sourceFile.getImportDeclaration(d => d.getModuleSpecifierValue() === '@/lib/http/validate');
  if (validateImport) {
    const namedImports = validateImport.getNamedImports().map(n => n.getName());
    const toAdd = ['readJsonBody', 'readQuery', 'readJsonInput', 'zodDetails', 'invalidRequest', 'badRequest'];
    for (const add of toAdd) {
      if (!namedImports.includes(add)) {
        validateImport.addNamedImport(add);
      }
    }
  }

  // Find statements like: const parsed = await parseJsonBody(request, KapnosBodySchema, CORS);
  // Or const parsed = parseQuery(request.url, Schema, CORS);
  const variableDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
  
  for (const decl of variableDeclarations) {
    const initializer = decl.getInitializer();
    if (!initializer) continue;
    
    let callExpr = initializer.asKind(SyntaxKind.CallExpression);
    if (!callExpr && initializer.isKind(SyntaxKind.AwaitExpression)) {
      callExpr = initializer.getExpression().asKind(SyntaxKind.CallExpression);
    }
    if (!callExpr) continue;

    const fnName = callExpr.getExpression().getText();
    if (['parseJsonBody', 'parseQuery', 'parseJsonInput', 'parseQueryInput'].includes(fnName)) {
      const args = callExpr.getArguments();
      const reqArg = args[0].getText();
      const schemaArg = args[1].getText();
      const corsArg = args.length > 2 ? args[2].getText() : undefined;
      
      const isJson = fnName.includes('Json');
      const isInput = fnName.includes('Input');
      
      const varName = decl.getName();
      const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
      if (!stmt) continue;

      const parentBlock = stmt.getParentIfKind(SyntaxKind.Block) || stmt.getParentIfKind(SyntaxKind.SourceFile);
      if (!parentBlock) continue;

      const stmts = parentBlock.getStatements();
      const stmtIndex = stmts.findIndex(s => s === stmt);
      
      // Look at the next statement to see if it's the `if (!parsed.ok)` return
      const nextStmt = stmts[stmtIndex + 1];
      
      // We will replace stmt and nextStmt with our expanded version.
      let replacement = '';
      
      if (isJson) {
        const readFn = isInput ? 'readJsonInput' : 'readJsonBody';
        const corsStr = corsArg ? `, ${corsArg}` : '';
        replacement += `const __body = await ${readFn}(${reqArg}${corsStr});\n`;
        replacement += `if (!__body.ok) return __body.response;\n`;
        replacement += `const ${varName} = ${schemaArg}.safeParse(__body.value);\n`;
      } else {
        replacement += `const __query = readQuery(${reqArg});\n`;
        replacement += `const ${varName} = ${schemaArg}.safeParse(__query);\n`;
      }
      
      const errResponse = isInput 
        ? `invalidRequest(${varName}.error${corsArg ? `, ${corsArg}` : ''})`
        : `badRequest("Invalid request", zodDetails(${varName}.error)${corsArg ? `, ${corsArg}` : ''})`;
        
      replacement += `if (!${varName}.success) return ${errResponse};\n`;
      // Check if code was using parsed.data. If so, alias it or just leave it since safeParse gives .data on success.
      // We'll replace parsed.data with parsed.data, it works.

      if (nextStmt && nextStmt.getText().includes(`!${varName}.ok`)) {
        // Remove the next statement
        nextStmt.replaceWithText(replacement);
        stmt.remove();
      } else {
        stmt.replaceWithText(replacement);
      }
      
      changed = true;
    }
  }

  // Same thing for parseOptionalJsonBody in schemas/public-api, but let's only touch routes for now.

  if (changed) {
    sourceFile.saveSync();
    console.log(`Refactored ${sourceFile.getBaseName()}`);
  }
}
