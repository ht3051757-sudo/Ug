// UGPHONE MOD backend
// Node.js + Express + Supabase. Keep SUPABASE_SERVICE_ROLE_KEY server-side only.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

async function requireAdmin(req, res, next) {
  try {
    const h = String(req.headers.authorization || '');
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Admin authentication required' });
    const token = h.slice(7);
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid session' });
    const { data: profile } = await db.from('profiles').select('role,banned').eq('id', user.id).single();
    if (!profile || profile.banned || profile.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

async function ipBanned(ip) {
  if (!ip) return false;
  const { data, error } = await db.from('banned_ips').select('id').eq('ip', ip).maybeSingle();
  if (error) throw error;
  return !!data;
}

app.get('/api/health', async (_req, res) => {
  const { error } = await db.from('server_state').select('id').eq('id', 1).maybeSingle();
  res.status(error ? 503 : 200).json({ ok: !error, database: error ? 'error' : 'ok' });
});

app.get('/api/ip', async (req, res) => {
  const ip = clientIp(req);
  res.json({ ip, banned: await ipBanned(ip) });
});

app.get('/api/server-status', async (_req, res) => {
  const { data, error } = await db.from('server_state').select('*').eq('id', 1).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/ban-ip', requireAdmin, async (req, res) => {
  const ip = String(req.body?.ip || '').trim();
  if (!ip) return res.status(400).json({ error: 'ip is required' });
  const { data, error } = await db.from('banned_ips').upsert({ ip }, { onConflict: 'ip' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/admin/ban-ip/:ip', requireAdmin, async (req, res) => {
  const { error } = await db.from('banned_ips').delete().eq('ip', req.params.ip);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('/api/admin/banned-ips', requireAdmin, async (_req, res) => {
  const { data, error } = await db.from('banned_ips').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Block IP-banned visitors before serving the site.
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/admin/')) return next();
  try {
    if (await ipBanned(clientIp(req))) return res.status(403).send('IP bị BAN');
    next();
  } catch (e) {
    next(e);
  }
});

app.use(express.static(__dirname));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`UGPHONE server listening on http://localhost:${PORT}`));
