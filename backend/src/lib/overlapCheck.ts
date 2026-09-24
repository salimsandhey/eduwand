const FLAG_THRESHOLD_WORDS = 12;

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

// Copyright compliance (spec: "Add an overlap check between source chunks and
// generated text; flag anything beyond a short quoted line as a bug").
// Returns the generated lines that share a run of FLAG_THRESHOLD_WORDS+
// consecutive words with the source - a real bug to fix (regenerate that
// slide), not a soft warning. A pragmatic n-gram overlap check rather than a
// new ML dependency - 12 consecutive words is well beyond "a short quoted line".
export function findVerbatimOverlap(sourceText: string, generatedLines: string[]): string[] {
  const sourceWords = normalize(sourceText);
  const sourceJoined = ` ${sourceWords.join(" ")} `;
  const flagged: string[] = [];
  for (const line of generatedLines) {
    const words = normalize(line);
    for (let start = 0; start + FLAG_THRESHOLD_WORDS <= words.length; start += 1) {
      const gram = words.slice(start, start + FLAG_THRESHOLD_WORDS).join(" ");
      if (sourceJoined.includes(` ${gram} `)) {
        flagged.push(line);
        break;
      }
    }
  }
  return flagged;
}
