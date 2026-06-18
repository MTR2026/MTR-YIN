// netlify/functions/generate-free-ticket.js
// MTR YIN — Generador de entradas PDF para escuelas (usando pdfkit)

const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const TICKET_LABELS = {
  general:      'Acceso General',
  primera_fila: 'Acceso Primera Fila',
  vip_cena:     'Acceso VIP + Cena',
};

const TICKET_PVP = {
  general:      35,
  primera_fila: 50,
  vip_cena:     75,
};

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

function generateTicketCode(seed, index) {
  const hash = crypto
    .createHash('sha256')
    .update(`FREE-${seed}-${index}-MTR-YIN-2026-${Date.now()}`)
    .digest('hex').toUpperCase();
  return `MTRYIN-${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}`;
}

async function generateQRBuffer(code) {
  return await QRCode.toBuffer(code, {
    errorCorrectionLevel: 'H',
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#f0ede8' },
  });
}

async function generatePDF(ticket, label, pvp, school, name, quantity) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'MTR YIN — Entrada', Author: 'Muay Thai Revolution' } });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const W = 595.28;
    const H = 841.89;
    const pad = 48;

    doc.rect(0, 0, W, H).fill('#0a0a0a');

    doc.fontSize(8).fillColor('#b0aca5')
      .font('Helvetica')
      .text('MUAY THAI REVOLUTION', pad, pad, { align: 'center', width: W - pad*2, characterSpacing: 3 });

    doc.fontSize(56).fillColor('#f0ede8')
      .font('Helvetica-Bold')
      .text('MTR', pad, pad + 20, { align: 'center', width: W - pad*2 });

    const sepY = pad + 90;
    doc.rect(pad, sepY, W - pad*2, 4).fill('#f0ede8');

    doc.fontSize(56).fillColor('#f0ede8')
      .font('Helvetica-Bold')
      .text('YIN', pad, sepY + 8, { align: 'center', width: W - pad*2 });

    doc.fontSize(9).fillColor('#b0aca5')
      .font('Helvetica')
      .text('21 JUNIO 2026 · MADRID', pad, sepY + 72, { align: 'center', width: W - pad*2, characterSpacing: 2 });

    const boxY = sepY + 100;
    const boxH = 180;
    doc.rect(pad, boxY, W - pad*2, boxH).stroke('#444444');

    doc.fontSize(8).fillColor('#b0aca5')
      .font('Helvetica')
      .text(`ENTRADA ${ticket.number} DE ${quantity}`, pad + 20, boxY + 18, { characterSpacing: 2 });

    doc.fontSize(22).fillColor('#f0ede8')
      .font('Helvetica-Bold')
      .text(label, pad + 20, boxY + 34);

    doc.fontSize(11).fillColor('#b0aca5')
      .font('Helvetica')
      .text('PVP: ', pad + 20, boxY + 68, { continued: true })
      .fontSize(18).fillColor('#f0ede8')
      .font('Helvetica-Bold')
      .text(`${pvp}€`);

    doc.fontSize(10).fillColor('#b0aca5')
      .font('Helvetica')
      .text(`#${String(ticket.number).padStart(4,'0')}`, pad + 20, boxY + 96);

    let extraY = boxY + 116;
    if (school) {
      doc.fontSize(10).fillColor('#b0aca5').font('Helvetica').text(school, pad + 20, extraY);
      extraY += 16;
    }
    if (name) {
      doc.fontSize(10).fillColor('#b0aca5').font('Helvetica').text(name, pad + 20, extraY);
    }

    const qrBuf = await generateQRBuffer(ticket.code);
    const qrSize = 140;
    const qrX = W - pad - qrSize - 10;
    const qrY = boxY + (boxH - qrSize) / 2;
    doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });

    const tableY = boxY + boxH + 20;
    const rows = [
      ['Evento', 'MTR YIN'],
      ['Fecha', 'Domingo, 21 de Junio de 2026'],
      ['Lugar', 'Sala Groove, Pinto (Madrid)'],
      ['Acceso', label],
    ];

    doc.rect(pad, tableY - 6, W - pad*2, 1).fill('#2a2a2a');

    rows.forEach((row, i) => {
      const rowY = tableY + i * 24;
      doc.fontSize(10).fillColor('#b0aca5').font('Helvetica').text(row[0], pad, rowY);
      doc.fontSize(10).fillColor('#f0ede8').font('Helvetica-Bold').text(row[1], W/2, rowY, { width: W/2 - pad, align: 'right' });
      doc.rect(pad, rowY + 16, W - pad*2, 1).fill('#1a1a1a');
    });

    const codeY = tableY + rows.length * 24 + 12;
    doc.fontSize(10).fillColor('#555555').font('Helvetica')
      .text(ticket.code, pad, codeY, { align: 'center', width: W - pad*2, characterSpacing: 1 });

    const infoY = codeY + 22;
    doc.rect(pad, infoY, W - pad*2, 1).fill('#2a2a2a');

    const instrucciones = [
      { bold: 'Como llegar:', text: 'Sala Groove, Ctra. de Getafe, 32, Pinto, Madrid. A 20 min de Madrid en coche o cercanias (C-3 hasta Pinto).' },
      ...(label.includes('VIP') ? [{ bold: 'Acceso VIP:', text: 'Entrada exclusiva por acceso VIP con acceso preferente. Incluye cena.' }] : []),
      ...(label.includes('Primera') ? [{ bold: 'Primera Fila:', text: 'Asientos numerados asignados el dia del evento en taquilla.' }] : []),
      { bold: 'Puertas:', text: 'Se abren 30 minutos antes del evento. El evento es puntual — no llegues tarde.' },
      { bold: 'Sin devoluciones:', text: 'Las entradas no son reembolsables bajo ningun concepto.' },
      { bold: 'Acceso:', text: 'Presenta este QR en la entrada. Uso unico y no transferible.' },
    ];

    let lineY = infoY + 10;
    instrucciones.forEach(item => {
      doc.fontSize(8.5).fillColor('#f0ede8').font('Helvetica-Bold')
        .text(item.bold + ' ', pad, lineY, { continued: true, width: W - pad*2 })
        .fillColor('#b0aca5').font('Helvetica')
        .text(item.text, { width: W - pad*2 });
      lineY += 20;
    });

    doc.fontSize(8).fillColor('#333333').font('Helvetica')
      .text('© 2026 MTR YIN — Muay Thai Revolution · contacto@muaythairevolution.es', pad, H - 28, { align: 'center', width: W - pad*2 });

    doc.end();
  });
}

async function registerTicket(code, ticketType, ticketName, buyerName, buyerEmail, entryNumber, totalEntries, school, pvp, promoCode) {
  try {
    await fetch(`${process.env.URL}/.netlify/functions/validate-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET },
      body: JSON.stringify({
        action: 'register', code,
        ticketData: { ticket_type: ticketType, ticket_name: ticketName, buyer_name: buyerName, buyer_email: buyerEmail, entry_number: entryNumber, total_entries: totalEntries, school, pvp, is_free: true, promo_code: promoCode || null },
      }),
    });
  } catch (e) { console.warn('No se pudo registrar en BD:', e.message); }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };

  const adminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret'];
  if (!process.env.ADMIN_SECRET || (adminSecret !== process.env.ADMIN_SECRET && adminSecret !== 'PROMO_AUTO'))
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  // ✅ promoCode extraído directamente del body (no parseado de la nota)
  const { email, name, ticketType, qty, school, note, promoCode } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email inválido' }) };
  if (!ticketType || !TICKET_LABELS[ticketType])
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticketType inválido' }) };

  const quantity = Math.min(parseInt(qty || '1', 10), 20);
  const label = TICKET_LABELS[ticketType];
  const pvp = TICKET_PVP[ticketType];
  const seed = `${email}-${school || 'escuela'}-${ticketType}-${Date.now()}`;

  const tickets = [];
  const pdfAttachments = [];

  for (let i = 0; i < quantity; i++) {
    const code = generateTicketCode(seed, i);
    tickets.push({ code, number: i + 1 });
    // ✅ promoCode pasado directamente, sin parsear la nota
    await registerTicket(code, ticketType, label, name, email, i + 1, quantity, school, pvp, promoCode || null);
    const pdfBuffer = await generatePDF({ code, number: i + 1 }, label, pvp, school, name, quantity);
    pdfAttachments.push({
      filename: `MTR-YIN-entrada-${String(i+1).padStart(4,'0')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const noteLine = note ? `<p style="font-size:13px;color:#b0aca5;margin-bottom:20px;font-style:italic;">${note}</p>` : '';

  const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="background:#0a0a0a;color:#f0ede8;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:40px;">
      <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#b0aca5;margin-bottom:8px;">MUAY THAI REVOLUTION</p>
      <h1 style="font-size:52px;font-weight:900;line-height:0.9;margin:0;">MTR<br><span style="display:block;height:4px;background:#f0ede8;margin:5px 0;"></span>YIN</h1>
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b0aca5;margin-top:8px;">21 JUNIO 2026 · MADRID</p>
    </div>
    <p style="font-size:16px;font-weight:300;line-height:1.7;margin-bottom:20px;">
      Hola <strong>${name || 'campeón/a'}</strong>,<br><br>
      Adjunto encontrarás ${quantity > 1 ? `tus <strong>${quantity} entradas</strong>` : 'tu <strong>entrada</strong>'} en PDF para <strong>MTR YIN</strong>. 🥊<br>
      Cada PDF incluye el código QR para acceder al evento.
    </p>
    ${noteLine}
    <div style="background:rgba(240,237,232,0.05);border:1px solid rgba(240,237,232,0.1);padding:20px;margin-bottom:20px;">
      <table style="width:100%;font-size:14px;">
        <tr><td style="color:#b0aca5;padding:5px 0;">Evento</td><td style="text-align:right;color:#f0ede8;">MTR YIN</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">Fecha</td><td style="text-align:right;color:#f0ede8;">21 Junio 2026 · Madrid</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">Acceso</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${label}</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">PVP</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${pvp}€</td></tr>
        ${school ? `<tr><td style="color:#b0aca5;padding:5px 0;">Escuela</td><td style="text-align:right;color:#f0ede8;">${school}</td></tr>` : ''}
        <tr><td style="color:#b0aca5;padding:5px 0;">Entradas</td><td style="text-align:right;color:#f0ede8;">${quantity}</td></tr>
      </table>
    </div>
    <div style="margin-bottom:20px;border-top:1px solid rgba(240,237,232,0.08);padding-top:20px;">
      <p style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#b0aca5;margin-bottom:12px;">Como llegar</p>
      <a href="https://www.google.com/maps/place/Sala+Groove/@40.2407951,-3.6912879,17z" target="_blank" style="display:block;margin-bottom:10px;">
        <img src="https://maps.googleapis.com/maps/api/staticmap?center=40.240791,-3.688713&zoom=16&size=520x180&markers=color:red%7Clabel:S%7C40.240791,-3.688713&maptype=roadmap"
          alt="Mapa Sala Groove Pinto" style="width:100%;display:block;border:1px solid rgba(240,237,232,0.1);" onerror="this.style.display=none">
      </a>
      <p style="font-size:13px;color:#b0aca5;line-height:1.7;margin-bottom:10px;">
        <strong style="color:#f0ede8;">Sala Groove</strong> — Ctra. de Getafe, 32, Pinto, Madrid.<br>
        Cercanias C-3 hasta Pinto (20 min desde Atocha). Tambien accesible en coche por la A-4.
      </p>
      <a href="https://www.google.com/maps/place/Sala+Groove/@40.2407951,-3.6912879,17z"
        target="_blank"
        style="display:block;text-align:center;background:rgba(240,237,232,0.08);border:1px solid rgba(240,237,232,0.2);color:#f0ede8;font-family:Arial;font-size:13px;padding:12px;text-decoration:none;">
        Ver en Google Maps →
      </a>
    </div>
    <p style="font-size:13px;color:#b0aca5;line-height:1.7;border-top:1px solid rgba(240,237,232,0.08);padding-top:20px;">
      Presenta el PDF con el QR en la entrada. Cada entrada es de uso unico y no transferible.<br>
      Contacto: <a href="mailto:contacto@muaythairevolution.es" style="color:#f0ede8;">contacto@muaythairevolution.es</a>
    </p>
    <p style="font-size:11px;color:rgba(176,172,165,0.3);margin-top:20px;text-align:center;">© 2026 MTR YIN — Muay Thai Revolution</p>
  </body></html>`;

  try {
    await transporter.sendMail({
      from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: `🎟️ Tu entrada PDF para MTR YIN — ${label}`,
      html: emailHtml,
      attachments: pdfAttachments,
    });

    await transporter.sendMail({
      from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: 'entradas@muaythairevolution.com',
      subject: `[CONTROL] Nueva entrada — ${label} x${quantity} — ${name}`,
      html: `<p style="font-family:Arial;font-size:14px;line-height:1.8;">
        <strong>Nueva entrada generada</strong><br><br>
        <strong>Nombre:</strong> ${name}<br>
        <strong>Email:</strong> ${email}<br>
        <strong>Tipo:</strong> ${label}<br>
        <strong>Cantidad:</strong> ${quantity}<br>
        <strong>PVP:</strong> ${pvp}€<br>
        ${school ? `<strong>Escuela:</strong> ${school}<br>` : ''}
        ${promoCode ? `<strong>Código promo:</strong> ${promoCode}<br>` : ''}
        <strong>Códigos:</strong><br>
        ${tickets.map(t => `&nbsp;&nbsp;${t.code}`).join('<br>')}
      </p>`,
    }).catch(e => console.warn('Error enviando email de control:', e));

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, message: `${quantity} entrada(s) PDF enviada(s) a ${email}`, codes: tickets.map(t => t.code) }),
    };
  } catch (err) {
    console.error('Error email:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error enviando email: ' + err.message }) };
  }
};
