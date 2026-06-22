import { Resend } from 'resend';
import fs from 'fs';
const env = fs.readFileSync(new URL('../.env.vercel', import.meta.url), 'utf8');
const key = env.split('\n').find(l => l.startsWith('RESEND_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const resend = new Resend(key);

const html = `
<p>Dear Anindyatrans,</p>

<p>Payment has been completed. Transfer details:</p>
<ul>
<li>Amount: <b>Rp 2,398,000</b></li>
<li>Date/time: 21 June 2026, 13:58:31 WIB</li>
<li>Method: BI-FAST (from BNI / Wondr)</li>
<li>Sender: Oleksandr Diachuk</li>
<li>Recipient: ANINDYATRANS CV, BCA 6871001101</li>
<li>Reference ID: <b>20260621135821853134</b></li>
<li>BIZ ID: 20260621BNINIDJA010OO241004798</li>
</ul>

<p>Please confirm receipt and start the REGULER translation (2 working days). As agreed, the final result is a soft-copy PDF with the sworn translator's stamp, signature, and Kemenkumham registration number (affidavit page), for our Apple Developer submission.</p>

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
