export function parseSpintax(template: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  let matches = template.match(spintaxRegex);

  while (matches && matches.length > 0) {
    for (const match of matches) {
      const choices = match.slice(1, -1).split('|');
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];
      template = template.replace(match, randomChoice);
    }
    matches = template.match(spintaxRegex);
  }

  return template;
}
