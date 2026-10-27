export const AUTOMATION_CONDITIONS = ['filled', 'empty', 'changed', 'equals'];
export const AUTOMATION_ACTIONS = ['set_value', 'set_today'];

export function automationToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function conditionMatches(rule, sourceValue, previousValue) {
  const filled = sourceValue !== undefined && sourceValue !== null && sourceValue !== '';
  if (rule.conditionType === 'filled') return filled;
  if (rule.conditionType === 'empty') return !filled;
  if (rule.conditionType === 'changed')
    return String(sourceValue ?? '') !== String(previousValue ?? '');
  if (rule.conditionType === 'equals')
    return String(sourceValue ?? '') === String(rule.conditionValue ?? '');
  return false;
}

export function actionValue(rule) {
  if (rule.actionType === 'set_today') return automationToday();
  if (rule.targetType === 'number') return Number(rule.actionValue);
  if (rule.targetType === 'boolean') return rule.actionValue === 'true';
  return rule.actionValue;
}

// Single ordered pass over the merged rule list (common-form rules first,
// then asset-type rules). Later rules see values written by earlier ones,
// which is what makes chained rules work. Client and server must both use
// this exact algorithm so the live preview matches the persisted result.
export function applyAutomationRules(rules, values, previousValues = {}) {
  const result = { ...values };
  for (const rule of rules) {
    if (!conditionMatches(rule, result[rule.sourceKey], previousValues[rule.sourceKey]))
      continue;
    result[rule.targetKey] = actionValue(rule);
  }
  return result;
}
