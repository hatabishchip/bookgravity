import { Resend } from 'resend';
import fs from 'fs';
const env = fs.readFileSync(new URL('../.env.vercel', import.meta.url), 'utf8');
const key = env.split('\n').find(l => l.startsWith('RESEND_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const resend = new Resend(key);
const html = `
<p>Dear Anindyatrans,</p>

<p>Thank you. Glad the payment is received and the translation will be ready by June 23 at 12:00 WIB.</p>

<p>Company details for the invoice and delivery:</p>
<ul>
<li>Company: PT GRAVITY STRETCHING CANGGU</li>
<li>NPWP: 1000000009312478</li>
<li>Address: Jalan Raya Padonan Gang Pilot, Tibubeneng, Kuta Utara, Badung, Bali 80365</li>
<li>Delivery: soft-copy PDF to admin@bookgravity.com</li>
</ul>

<p>Important: these documents are for an Apple Developer Program application, which Apple reviews closely. Please make sure the final soft-copy PDF is a clean, high-resolution scan where the sworn translator's stamp, signature, and Kemenkumham registration number are fully clear and legible. Clarity is essential for Apple to accept them.</p>

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
