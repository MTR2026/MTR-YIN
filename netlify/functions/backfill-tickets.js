
// netlify/functions/backfill-tickets.js
// MTR YIN — Función de un solo uso para registrar y enviar entradas
// de compras Stripe que no se procesaron por el webhook (antes de
// corregir la URL del endpoint).
//
// Uso: GET /.netlify/functions/backfill-tickets?secret=TU_ADMIN_SECRET
// Una vez ejecutada, puede eliminarse este archivo.
 
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
 
// Lista de compras pendientes de procesar (extraídas de Stripe)
const PENDING_SALES = [
  { chargeId: 'ch_3ThwDZKkIU2phT3t1CtO0D8c', name: 'Alina Alexandra Pintoiu', email: 'alina.pintoiu@gmail.com', ticketType: 'general', qty: 1 },
  { chargeId: 'ch_3ThtZIKkIU2phT3t018Q0CtD', name: 'Benjamín Pouso',           email: 'muaypousothai@gmail.com', ticketType: 'general', qty: 2 },
  { chargeId: 'ch_3TfGvBKkIU2phT3t0DNUwN8s', name: 'Elena Martínez Gil',       email: 'elenamartinezrv@gmail.com', ticketType: 'general', qty: 2 },
  { chargeId: 'ch_3Te9F4KkIU2phT3t0R8tYRdC', name: 'Blanca Romero',            email: 'blromero@ucm.es', ticketType: 'general', qty: 3 },
  { chargeId: 'ch_3TXN82KkIU2phT3t0aCMJpSs', name: 'Victoria Flores',          email: 'flores0486@hotmail.com', ticketType: 'primera_fila', qty: 1 },
  { chargeId: 'ch_3TXN57KkIU2phT3t10QwZYdZ', name: 'Alondra Rendon',           email: 'abril_bor@icloud.com', ticketType: 'primera_fila', qty: 2 },
  { chargeId: 'ch_3TWxOCKkIU2phT3t0gZ4G8Q7', name: 'Angel Curiel',             email: 'angelcuriel@gmail.com', ticketType: 'primera_fila', qty: 1 },
];
 
function generateTicketCode(seed, index) {
  const hash = crypto
    .createHash('sha256')
    .update(`${seed}-${index}-MTR-YIN-2026-BACKFILL`)
    .digest('hex').toUpperCase();
  return `MTRYIN-${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}`;
}
 
async function generateQRBuffer(code) {
  return await QRCode.toBuffer(code, {
    errorCorrectionLevel: 'H', width: 200, margin: 1,
    color: { dark: '#000000', light: '#f0ede8' },
  });
}
 
async function generatePDF(ticket, label, pvp, name, quantity) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'MTR YIN — Entrada', Author: 'Muay Thai Revolution' } });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
 
    const W = 595.28, H = 841.89, pad = 48;
 
    doc.rect(0, 0, W, H).fill('#0a0a0a');
 
    doc.fontSize(8).fillColor('#b0aca5').font('Helvetica')
      .text('MUAY THAI REVOLUTION', pad, pad, { align: 'center', width: W - pad*2, characterSpacing: 3 });
 
    doc.fontSize(56).fillColor('#f0ede8').font('Helvetica-Bold')
      .text('MTR', pad, pad + 20, { align: 'center', width: W - pad*2 });
 
    const sepY = pad + 90;
    doc.rect(pad, sepY, W - pad*2, 4).fill('#f0ede8');
 
    doc.fontSize(56).fillColor('#f0ede8').font('Helvetica-Bold')
      .text('YIN', pad, sepY + 8, { align: 'center', width: W - pad*2 });
 
    doc.fontSize(9).fillColor('#b0aca5').font('Helvetica')
      .text('21 JUNIO 2026 · SALA GROOVE · PINTO, MADRID', pad, sepY + 72, { align: 'center', width: W - pad*2, characterSpacing: 1 });
 
    const boxY = sepY + 100;
    const boxH = 180;
    doc.rect(pad, boxY, W - pad*2, boxH).stroke('#444444');
 
    doc.fontSize(8).fillColor('#b0aca5').font('Helvetica')
      .text(`ENTRADA ${ticket.number} DE ${quantity}`, pad + 20, boxY + 18, { characterSpacing: 2 });
 
    doc.fontSize(22).fillColor('#f0ede8').font('Helvetica-Bold')
      .text(label, pad + 20, boxY + 34);
 
    doc.fontSize(11).fillColor('#b0aca5').font('Helvetica')
      .text('PVP: ', pad + 20, boxY + 68, { continued: true })
      .fontSize(18).fillColor('#f0ede8').font('Helvetica-Bold')
      .text(`${pvp}€`);
 
    doc.fontSize(10).fillColor('#b0aca5').font('Helvetica')
      .text(`#${String(ticket.number).padStart(4,'0')}`, pad + 20, boxY + 96);
 
    if (name) {
      doc.fontSize(10).fillColor('#b0aca5').font('Helvetica')
        .text(name, pad + 20, boxY + 116);
    }
 
    const qrBuf = await generateQRBuffer(ticket.code);
    const qrSize = 140;
    doc.image(qrBuf, W - pad - qrSize - 10, boxY + (boxH - qrSize) / 2, { width: qrSize, height: qrSize });
 
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
 
async function registerTicket(code, ticketType, ticketName, buyerName, buyerEmail, entryNumber, totalEntries, pvp) {
  try {
    await fetch(`${process.env.URL}/.netlify/functions/validate-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET },
      body: JSON.stringify({
        action: 'register', code,
        ticketData: { ticket_type: ticketType, ticket_name: ticketName, buyer_name: buyerName, buyer_email: buyerEmail, entry_number: entryNumber, total_entries: totalEntries, school: null, pvp, is_free: false, promo_code: null },
      }),
    });
  } catch (e) { console.warn('No se pudo registrar en BD:', e.message); }
}
 
function buildEmailHtml(name, label, pvp, quantity) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="background:#0a0a0a;color:#f0ede8;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:40px;">
      <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#b0aca5;margin-bottom:8px;">MUAY THAI REVOLUTION</p>
      <h1 style="font-size:52px;font-weight:900;line-height:0.9;margin:0;">MTR<br><span style="display:block;height:4px;background:#f0ede8;margin:5px 0;"></span>YIN</h1>
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b0aca5;margin-top:8px;">21 JUNIO 2026 · MADRID</p>
    </div>
    <p style="font-size:16px;font-weight:300;line-height:1.7;margin-bottom:20px;">
      Hola <strong>${name}</strong>,<br><br>
      ¡Gracias por tu compra! Adjunto encontrarás ${quantity > 1 ? `tus <strong>${quantity} entradas</strong>` : 'tu <strong>entrada</strong>'} en PDF para <strong>MTR YIN</strong>. 🥊<br>
      Cada PDF incluye el código QR para acceder al evento. Disculpa el retraso en el envío.
    </p>
    <div style="background:rgba(240,237,232,0.05);border:1px solid rgba(240,237,232,0.1);padding:20px;margin-bottom:20px;">
      <table style="width:100%;font-size:14px;">
        <tr><td style="color:#b0aca5;padding:5px 0;">Evento</td><td style="text-align:right;color:#f0ede8;">MTR YIN</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">Fecha</td><td style="text-align:right;color:#f0ede8;">21 Junio 2026 · Madrid</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">Acceso</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${label}</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">PVP</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${pvp}€</td></tr>
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
}
 
exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
 
  const secret = event.queryStringParameters?.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }
 
  const results = [];
 
  for (const sale of PENDING_SALES) {
    const label = TICKET_LABELS[sale.ticketType];
    const pvp = TICKET_PVP[sale.ticketType];
    const tickets = [];
    const pdfAttachments = [];
 
    try {
      for (let i = 0; i < sale.qty; i++) {
        const code = generateTicketCode(sale.chargeId, i);
        tickets.push({ code, number: i + 1 });
        await registerTicket(code, sale.ticketType, label, sale.name, sale.email, i + 1, sale.qty, pvp);
        const pdfBuffer = await generatePDF({ code, number: i + 1 }, label, pvp, sale.name, sale.qty);
        pdfAttachments.push({
          filename: `MTR-YIN-entrada-${String(i+1).padStart(4,'0')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        });
      }
 
      await transporter.sendMail({
        from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: sale.email,
        subject: `🎟️ Tu entrada PDF para MTR YIN — ${label}`,
        html: buildEmailHtml(sale.name, label, pvp, sale.qty),
        attachments: pdfAttachments,
      });
 
      await transporter.sendMail({
        from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: 'entradas@muaythairevolution.com',
        subject: `[CONTROL] Backfill — ${label} x${sale.qty} — ${sale.name}`,
        html: `<p style="font-family:Arial;font-size:14px;line-height:1.8;">
          <strong>Entrada registrada retroactivamente (compra Stripe)</strong><br><br>
          <strong>Nombre:</strong> ${sale.name}<br>
          <strong>Email:</strong> ${sale.email}<br>
          <strong>Tipo:</strong> ${label}<br>
          <strong>Cantidad:</strong> ${sale.qty}<br>
          <strong>PVP:</strong> ${pvp}€<br>
          <strong>Charge ID:</strong> ${sale.chargeId}<br>
          <strong>Códigos:</strong><br>
          ${tickets.map(t => `&nbsp;&nbsp;${t.code}`).join('<br>')}
        </p>`,
      }).catch(e => console.warn('Error email control:', e));
 
      results.push({ email: sale.email, name: sale.name, ok: true, codes: tickets.map(t => t.code) });
    } catch (err) {
      results.push({ email: sale.email, name: sale.name, ok: false, error: err.message });
    }
  }
 
  return { statusCode: 200, headers, body: JSON.stringify({ done: true, results }) };
};
