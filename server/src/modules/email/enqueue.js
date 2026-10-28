import { ownerScope } from '../../utils/scope.js';

async function loadRules(conn, actor, assetTypeId, triggerType) {
  const scope = ownerScope(actor, 'er.owner_user_id');
  const [rules] = await conn.execute(
    `SELECT er.id, er.trigger_field_id, er.trigger_condition, er.trigger_condition_value,
            et.name AS template_name, et.subject_template, et.body_template,
            fd.\`key\` AS trigger_field_key
     FROM email_rules er
     JOIN email_rule_asset_types erat ON erat.rule_id = er.id
     JOIN email_templates et ON et.id = er.template_id
     LEFT JOIN field_definitions fd ON fd.id = er.trigger_field_id
     WHERE erat.asset_type_id = ? AND er.trigger_type = ? AND er.is_active = 1${scope.sql}`,
    [assetTypeId, triggerType, ...scope.params],
  );
  if (!rules.length) return [];
  const ruleIds = rules.map((r) => r.id);
  const [recips] = await conn.query(
    `SELECT err.rule_id, r.name, r.email FROM email_rule_recipients err
     JOIN email_recipients r ON r.id = err.recipient_id
     WHERE r.is_active = 1 AND err.rule_id IN (${ruleIds.map(() => '?').join(',')})`,
    ruleIds,
  );
  const byRule = new Map();
  for (const rec of recips) {
    if (!byRule.has(rec.rule_id)) byRule.set(rec.rule_id, []);
    byRule.get(rec.rule_id).push({ name: rec.name, email: rec.email });
  }
  return rules.map((r) => ({ ...r, recipients: byRule.get(r.id) || [] })).filter((r) => r.recipients.length);
}

function str(v) { return v === undefined || v === null ? '' : String(v); }

function conditionMet(rule, prev, next) {
  const changed = str(prev) !== str(next);
  if (!changed) return false; // no-op suppression
  switch (rule.trigger_condition) {
    case 'equals': return str(next) === str(rule.trigger_condition_value);
    case 'not_equals': return str(next) !== str(rule.trigger_condition_value);
    case 'filled': return str(next).trim() !== '';
    case 'empty': return str(next).trim() === '';
    case 'any_change':
    default: return true;
  }
}

async function insertOutbox(conn, actor, rule, eventType, asset, payload) {
  await conn.execute(
    `INSERT INTO email_outbox (owner_user_id, rule_id, asset_public_id, event_type, payload_json, template_snapshot_json, recipients_json, status, attempts, next_attempt_at)
     VALUES (?,?,?,?,?,?,?, 'pending', 0, NOW())`,
    [
      actor.id, rule.id, asset.publicId, eventType,
      JSON.stringify(payload),
      JSON.stringify({ name: rule.template_name, subject: rule.subject_template, body: rule.body_template }),
      JSON.stringify(rule.recipients),
    ],
  );
}

function buildPayload(actor, asset, fields, previous, creator = actor) {
  return {
    assetTypeName: asset.assetTypeName,
    publicId: asset.publicId,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    user: { email: creator.email, name: creator.email },
    fields,
    previous,
  };
}

// Returns the number of outbox rows enqueued. Must run inside the asset write transaction.
// `actor` is the type owner (drives which email rules fire and who owns the outbox
// rows); `creator` is the user who actually performed the write and is shown in the
// email body via the {{user.*}} placeholders.
export async function enqueueForCreate(conn, actor, asset, values, creator = actor) {
  const createdRules = await loadRules(conn, actor, asset.assetTypeId, 'asset_created');
  let queued = createdRules.length;
  for (const rule of createdRules) {
    await insertOutbox(conn, actor, rule, 'asset_created', asset, buildPayload(actor, asset, values, {}, creator));
  }
  // A `field_changed` rule whose condition already holds on the newly added asset
  // also fires at creation (there is no previous value, so "changed" means the
  // field is set to a matching value). This lets an asset that is ADDED with, for
  // example, Status = "issued" send the same notification as editing it to that
  // value. Update behaviour is untouched; rules that do not match stay silent.
  const changedRules = await loadRules(conn, actor, asset.assetTypeId, 'field_changed');
  for (const rule of changedRules) {
    const key = rule.trigger_field_key;
    if (!key) continue;
    if (!conditionMet(rule, undefined, values?.[key])) continue;
    await insertOutbox(conn, actor, rule, 'field_changed', asset, buildPayload(actor, asset, values, {}, creator));
    queued += 1;
  }
  return queued;
}

export async function enqueueForUpdate(conn, actor, asset, previousValues, nextValues, creator = actor) {
  const rules = await loadRules(conn, actor, asset.assetTypeId, 'field_changed');
  let queued = 0;
  for (const rule of rules) {
    const key = rule.trigger_field_key;
    if (!key) continue;
    if (!conditionMet(rule, previousValues?.[key], nextValues?.[key])) continue;
    await insertOutbox(conn, actor, rule, 'field_changed', asset, buildPayload(actor, asset, nextValues, previousValues || {}, creator));
    queued += 1;
  }
  return queued;
}
