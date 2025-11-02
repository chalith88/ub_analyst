const ts = require("typescript");
const fs = require("fs");
const orig = fs.readFileSync("client/src/App.tsx", "utf8");
const funcIdx = orig.indexOf("function CompareAdvisor");
const returnIdx = orig.indexOf("return (\n", funcIdx);
const afterReturn = orig.indexOf("\n    </div>\n  );", returnIdx);
if (returnIdx === -1 || afterReturn === -1) {
  console.error("could not find return block");
  process.exit(1);
}
const modified = orig.slice(0, returnIdx) + "return <div />;" + orig.slice(afterReturn + "\n    </div>\n  );".length + returnIdx);
