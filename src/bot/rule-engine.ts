export interface BotRuleMatch {
  matched: boolean;
  replyText?: string;
  action?: string;
}

export function matchBotRuleLocal(text: string, rules: any[]): BotRuleMatch {
  const clean = text.trim().toLowerCase();

  for (const rule of rules) {
    if (rule.triggerType === 'EXACT' && clean === rule.keyword.toLowerCase().trim()) {
      return { matched: true, replyText: rule.replyText, action: rule.action };
    }
    if (rule.triggerType === 'CONTAINS' && clean.includes(rule.keyword.toLowerCase().trim())) {
      return { matched: true, replyText: rule.replyText, action: rule.action };
    }
    if (rule.triggerType === 'NUMERIC_MENU' && clean === rule.keyword.trim()) {
      return { matched: true, replyText: rule.replyText, action: rule.action };
    }
  }

  return { matched: false };
}
