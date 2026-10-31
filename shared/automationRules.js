export const AUTOMATION_CONDITIONS = ['filled', 'empty', 'changed', 'equals'];
export const AUTOMATION_ACTIONS = ['set_value', 'set_today', 'clear'];

export function automationToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isFilledValue(value) {
  // Whitespace-only values count as empty (a lone space is not "filled").
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function conditionMatches(rule, sourceValue, previousValue) {
  const filled = isFilledValue(sourceValue);
  if (rule.conditionType === 'filled') return filled;
  if (rule.conditionType === 'empty') return !filled;
  if (rule.conditionType === 'changed')
    return String(sourceValue ?? '') !== String(previousValue ?? '');
  if (rule.conditionType === 'equals')
    return String(sourceValue ?? '') === String(rule.conditionValue ?? '');
  return false;
}

// A rule may not blank an auto_date field that already holds a date. auto_date
// means "today when the create form opens, then whatever the user left there",
// so only the user clears it. Without this guard a "… -> clear" rule wipes the
// prefill in the form and the submitted date on create, for every owner who has
// such a rule in their common form.
export function isBlockedAutoDateClear(rule, currentValue) {
  return (
    rule.actionType === 'clear' &&
    rule.targetType === 'auto_date' &&
    isFilledValue(currentValue)
  );
}


export function actionValue(rule) {
  if (rule.actionType === 'clear') return '';
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
    if (isBlockedAutoDateClear(rule, result[rule.targetKey])) continue;
    result[rule.targetKey] = actionValue(rule);
  }
  return result;
}
