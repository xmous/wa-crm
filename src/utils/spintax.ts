export function parseSpintax(template: string): string {
  if (!template) return '';

  // 1. Normalize any (opt1|opt2) parenthesized spintax to {opt1|opt2}
  let result = template.replace(/\(([^()]+)\)/g, (match, inner) => {
    return inner.includes('|') ? `{${inner}}` : match;
  });

  // 2. Resolve spintax patterns with choices (must contain '|')
  const spintaxRegex = /\{([^{}]+)\}/g;
  let maxIterations = 20;

  while (maxIterations-- > 0) {
    let changed = false;
    result = result.replace(spintaxRegex, (match, inner) => {
      if (inner.includes('|')) {
        changed = true;
        const choices = inner.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
      }
      return match; // Preserve variables like {nama}, {name}, etc.
    });
    if (!changed) break;
  }

  return result;
}

