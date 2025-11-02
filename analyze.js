const ts = require("typescript");
const fs = require("fs");
const source = fs.readFileSync("client/src/App.tsx", "utf8");
const sf = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && node.name.text === "CompareAdvisor") {
    node.body.statements.forEach((stmt) => {
      if (stmt.kind === ts.SyntaxKind.ReturnStatement) {
        const { line, character } = sf.getLineAndCharacterOfPosition(stmt.pos);
        console.log('Return statement at', line + 1, character + 1);
      }
    });
  }
  ts.forEachChild(node, visit);
}
visit(sf);
