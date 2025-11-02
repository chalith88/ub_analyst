*** Begin Patch
*** Update File: src/scrapers/peoples-tariff.ts
@@
-  const lawOfficerIdx = findIndex(/Legal Charges for mortgage bonds prepared by the Law Officers/i);
-  if (lawOfficerIdx !== -1) {
-    const bands: { range: string; amount: string }[] = [];
-    for (let i = lawOfficerIdx - 1; i >= 0; i--) {
-      const text = sanitized[i].text;
-      if (/Rate\s*\/\s*Fee/i.test(text)) break;
-      const percent = extractPercent(text);
-      if (!percent) continue;
-      const cleaned = text.replace(/\d+(?:\.\d+)?\s*%.*$/, '').trim();
-      const range = normalizeRange(cleaned);
-      if (!range) continue;
-      bands.push({ range, amount: percent });
-    }
-    bands
-      .sort((a, b) => parseRangeStart(a.range) - parseRangeStart(b.range))
-      .forEach(({ range, amount }) => {
-        const descRange = range.replace(/^([A-Z])/, (letter) => letter.toUpperCase());
-        pushLegal(`Legal Charges for mortgage bonds prepared by Bank Law Officers ${EN_DASH} ${descRange}`, amount, LEGAL_NOTE);
-      });
-  }
+  const lawOfficerLines = sanitized.filter(
+    (line) => /%/.test(line.text) && /(Up to|Above|Rs\.)/i.test(line.text) && line.text.includes("1,000")
+  );
+  if (lawOfficerLines.length) {
+    const bands = lawOfficerLines
+      .map((line) => {
+        const amount = extractPercent(line.text);
+        if (!amount) return undefined;
+        const cleaned = line.text.replace(/\d+(?:\.\d+)?\s*%.*$/, '').trim();
+        const range = normalizeRange(cleaned);
+        return range ? { range, amount } : undefined;
+      })
+      .filter((entry): entry is { range: string; amount: string } => Boolean(entry));
+
+    bands
+      .sort((a, b) => parseRangeStart(a.range) - parseRangeStart(b.range))
+      .forEach(({ range, amount }) => {
+        pushLegal(`Legal Charges for mortgage bonds prepared by Bank Law Officers ${EN_DASH} ${range}`, amount, LEGAL_NOTE);
+      });
+  }
*** End Patch
