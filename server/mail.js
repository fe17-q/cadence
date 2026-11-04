// Outgoing email over HTTPS (Railway blocks SMTP on most plans).
// Brevo: free, sends from a single verified address such as a Gmail, to anyone.
// Resend: also supported, but delivers to other people only once you verify a domain you own.
const from = () => process.env.MAIL_FROM || '';
export const mailEnabled = () => !!((process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) && from());

function parseFrom(s) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(s);
  return m ? { name: m[1] || 'Cadence', email: m[2] } : { name: 'Cadence', email: s.trim() };
}

export async function sendMail({ to, subject, text, html }) {
  if (!mailEnabled()) { console.log(`[mail disabled] to=${to} subject=${subject}\n${text}`); return false; }
  let res;
  if (process.env.BREVO_API_KEY) {
    res = await fetch(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(from()), to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    });
  } else {
    res = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from(), to: [to], subject, text, html }),
    });
  }
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return true;
}
