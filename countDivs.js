const fs = require("fs");
const text = fs.readFileSync("client/src/App.tsx", "utf8");
const funcIdx = text.indexOf("function CompareAdvisor");
const bodyStart = text.indexOf(") {", funcIdx) + 3;
const bodyEnd = text.indexOf("type ScrapeStatus", bodyStart);
const body = text.slice(bodyStart, bodyEnd);
const divOpen = (body.match(/<div/g) || []).length;
const divClose = (body.match(/<\/div>/g) || []).length;
console.log({ divOpen, divClose });
