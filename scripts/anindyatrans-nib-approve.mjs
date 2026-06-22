import { Resend } from 'resend';
import fs from 'fs';
const env = fs.readFileSync(new URL('../.env.vercel', import.meta.url), 'utf8');
const key = env.split('\n').find(l => l.startsWith('RESEND_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const resend = new Resend(key);

const html = `
<p>Dear Anindyatrans,</p>

<p>Thank you for the trial translation of the NIB. We checked it and it is correct - all key data matches the original:</p>
<ul>
<li>NIB: 2304260281773</li>
<li>Company: PT GRAVITY STRETCHING CANGGU</li>
<li>NPWP: 1000000009312478</li>
<li>Address: Jalan Raya Padonan Gang Pilot, Tibubeneng, Kuta Utara, Badung, Bali 80365</li>
<li>Status: PMA (Foreign Direct Investment)</li>
<li>KBLI: 93116 (Fitness Center)</li>
<li>Issued: 23 April 2026, Jakarta</li>
<li>Business Activity Number: 202604-2315-0015-1491-327</li>
</ul>
<p>The translation is accurate and complete.</p>

<p>Before you finalize, could you also please send us the trial translation of the <b>Akta Pendirian</b> for a quick check (it contains passport numbers and personal names that we want to verify)? After that, please proceed to finalize both documents (Akta Pendirian + NIB) as sworn translations - soft-copy PDF with the sworn translator's stamp, signature, and Kemenkumham registration number.</p>

<p>Thank you,<br>
<b>Oleksandr Diachuk</b><br>
Direktur, PT GRAVITY STRETCHING CANGGU<br>
admin@bookgravity.com - +62 821 3130 468</p>
`;

const res = await resend.emails.send({
  from: 'PT Gravity Stretching Canggu <admin@bookgravity.com>',
  to: 'cs@anindyatrans.com',
  replyTo: 'admin@bookgravity.com',
  subject: 'Re: Konfirmasi Order - Terjemahan Tersumpah REGULER ID->EN (Akta + NIB) untuk Apple Developer - PT GRAVITY STRETCHING CANGGU',
  html,
});
console.log('result:', JSON.stringify(res.data || res.error));
