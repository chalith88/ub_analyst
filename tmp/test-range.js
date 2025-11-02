const ranges = [
  'Above Rs. 100,000,000/ - 0.25 %',
  'Rs. 75,000,001/ - to 100,000,000/ - 0.5 %',
  'Rs. 50,000,001/ - to 75,000,000/ - 0.75 %',
  'Rs. 25,000,001/ - to 50,000,000/ - 0.8 %',
  'Rs. 1,000,001/ - to 25,000,000/ - 1.0 %',
  'Up to Rs. 1,000,000/ - 1.25 %'
];
const normalizeRange = (range) => {
  let out = range.replace(/\s+to\s+/gi, ' - ');
  out = out.replace(/\/\s*-\s*/g, '').replace(/\/ -/g, '').trim();
  out = out.replace(/\s+-\s+/g, ' - ').replace(/\s{2,}/g, ' ').trim();
  return out.replace(/^-/, '').trim();
};
for (const line of ranges) {
  const cleaned = line.replace(/\d+(?:\.\d+)?\s*%.*$/, '').trim();
  console.log(cleaned, '=>', normalizeRange(cleaned));
}
