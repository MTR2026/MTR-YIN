// netlify/functions/validate-ticket.js
const { neon } = require('@neondatabase/serverless');

function getDb() {
  return neon(process.env.NETLIFY_DATABASE_URL);
}

async function initTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS mtryin_tickets (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      ticket_type VARCHAR(50),
      ticket_name VARCHAR(100),
      buyer_name VARCHAR(200),
      buyer_email VARCHAR(200),
      entry_number INTEGER,
      total_entries INTEGER,
      school VARCHAR(200),
      pvp INTEGER,
      is_free BOOLEAN DEFAULT false,
      used BOOLEAN DEFAULT false,
      used_at TIMESTAMP,
      promo_code VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  try { await sql`ALTER TABLE mtryin_tickets ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50)`; } catch(e) {}
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const adminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret'];
  const isAdmin    = adminSecret === process.env.ADMIN_SECRET;
  const isReadonly = adminSecret === process.env.ADMIN_SECRET_READONLY;

  // Rechazar si no tiene ninguna clave válida
  if (!isAdmin && !isReadonly) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  const sql = getDb();
  await initTable(sql);

  // ── GET ──
  if (event.httpMethod === 'GET') {
    const action = event.queryStringParameters?.action;
    const code   = event.queryStringParameters?.code;

    if (action === 'list' || !code) {
      const rows = await sql`SELECT * FROM mtryin_tickets ORDER BY created_at DESC`;
      return { statusCode: 200, headers, body: JSON.stringify({ tickets: rows, readonly: isReadonly }) };
    }

    const rows = await sql`SELECT * FROM mtryin_tickets WHERE code = ${code}`;
    if (!rows.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Entrada no encontrada' }) };
    return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
  }

  // ── POST ──
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    const { action, code, ticketData } = body;

    // Acciones solo permitidas con clave de admin completa
    const adminOnly = ['register', 'delete'];
    if (adminOnly.includes(action) && !isAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acción no permitida en modo solo lectura' }) };
    }

    // ── Registrar entrada ──
    if (action === 'register') {
      const { ticket_type, ticket_name, buyer_name, buyer_email, entry_number, total_entries, school, pvp, is_free, promo_code } = ticketData;
      try {
        await sql`
          INSERT INTO mtryin_tickets (code, ticket_type, ticket_name, buyer_name, buyer_email, entry_number, total_entries, school, pvp, is_free, promo_code)
          VALUES (${code}, ${ticket_type}, ${ticket_name}, ${buyer_name}, ${buyer_email}, ${entry_number}, ${total_entries}, ${school || null}, ${pvp}, ${is_free || false}, ${promo_code || null})
          ON CONFLICT (code) DO NOTHING
        `;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
      }
    }

    // ── Validar entrada en puerta ──
    if (action === 'validate') {
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código requerido' }) };
      const rows = await sql`SELECT * FROM mtryin_tickets WHERE code = ${code}`;
      if (!rows.length) return { statusCode: 404, headers, body: JSON.stringify({ valid: false, error: 'Entrada no encontrada' }) };
      const ticket = rows[0];
      if (ticket.used) {
        return { statusCode: 200, headers, body: JSON.stringify({ valid: false, already_used: true, used_at: ticket.used_at, ticket }) };
      }
      await sql`UPDATE mtryin_tickets SET used = true, used_at = NOW() WHERE code = ${code}`;
      return { statusCode: 200, headers, body: JSON.stringify({ valid: true, ticket }) };
    }

    // ── Desvalidar entrada (permitido también en readonly) ──
    if (action === 'unvalidate') {
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código requerido' }) };
      const rows = await sql`SELECT * FROM mtryin_tickets WHERE code = ${code}`;
      if (!rows.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Entrada no encontrada' }) };
      await sql`UPDATE mtryin_tickets SET used = false, used_at = NULL WHERE code = ${code}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── Eliminar entrada ──
    if (action === 'delete') {
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código requerido' }) };
      await sql`DELETE FROM mtryin_tickets WHERE code = ${code}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no válida' }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
};
