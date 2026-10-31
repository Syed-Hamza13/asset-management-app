import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { renderTemplate } from './placeholder.js';
import { getSendTransport, fromHeader } from '../smtp/service.js';
import { isPermanent, sanitize } from './classify.js';

const LOCK_NAME = 'asset_email_worker';
const BATCH = 20;
let timer = null;
let running = false;

async function markFailed(id, message) {
  await pool.execute("UPDATE email_outbox SET status='failed', last_error=? WHERE id=?", [sanitize(message), id]);
}

async function deliver(row) {
  let transport, cfg;
  try {
    ({ transport, cfg } = await getSendTransport());
  } catch (e) {
    // SMTP not configured: leave the row pending so it sends once configured.
    await pool.execute("UPDATE email_outbox SET status='pending', attempts=attempts-1 WHERE id=?", [row.id]);
    return;
  }
  const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
  const snapshot = typeof row.template_snapshot_json === 'string' ? JSON.parse(row.template_snapshot_json) : row.template_snapshot_json;
  const recipients = (typeof row.recipients_json === 'string' ? JSON.parse(row.recipients_json) : row.recipients_json).map((r) => r.email).filter(Boolean);
  if (!recipients.length) { await markFailed(row.id, 'No active recipients.'); return; }

  const subject = renderTemplate(snapshot.subject, payload);
  const text = renderTemplate(snapshot.body, payload);
  try {
    await transport.sendMail({
      from: fromHeader(cfg),
      to: recipients.join(', '),
      replyTo: cfg.replyTo || undefined,
      subject,
      text,
    });
    await pool.execute("UPDATE email_outbox SET status='sent', last_error=NULL, sent_at=NOW() WHERE id=?", [row.id]);
  } catch (e) {
    const attempts = Number(row.attempts); // already incremented at claim time
    if (isPermanent(e) || attempts >= env.EMAIL_MAX_ATTEMPTS) {
      await pool.execute("UPDATE email_outbox SET status='failed', last_error=? WHERE id=?", [sanitize(e.message), row.id]);
    } else {
      const backoffSeconds = Math.min(30 * Math.pow(2, attempts - 1), 3600);
      await pool.execute("UPDATE email_outbox SET status='pending', last_error=?, next_attempt_at=DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id=?", [sanitize(e.message), backoffSeconds, row.id]);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  let locked = false;
  try {
    const [[lockRow]] = await pool.query('SELECT GET_LOCK(?, 0) AS got', [LOCK_NAME]);
    if (!lockRow?.got) return; // another process holds the lock
    locked = true;
    const [rows] = await pool.query("SELECT * FROM email_outbox WHERE status='pending' AND next_attempt_at <= NOW() ORDER BY id ASC LIMIT ?", [BATCH]);
    for (const row of rows) {
      const [claim] = await pool.execute("UPDATE email_outbox SET status='sending', attempts=attempts+1 WHERE id=? AND status='pending'", [row.id]);
      if (!claim.affectedRows) continue; // lost the race
      await deliver({ ...row, attempts: Number(row.attempts) + 1 });
    }
  } catch (e) {
    console.error('Email worker tick failed:', e.message);
  } finally {
    if (locked) { try { await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]); } catch {} }
    running = false;
  }
}

export function startEmailWorker() {
  if (env.EMAIL_WORKER_ENABLED !== 'true') { console.log('Email worker disabled by config.'); return; }
  if (timer) return;
  timer = setInterval(tick, env.EMAIL_WORKER_INTERVAL_MS);
  timer.unref?.();
  tick();
  console.log(`Email worker started (every ${env.EMAIL_WORKER_INTERVAL_MS}ms).`);
}

export function stopEmailWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}
