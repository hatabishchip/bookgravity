import { Resend } from 'resend';
import fs from 'fs';

const env = fs.readFileSync(new URL('../.env.vercel', import.meta.url), 'utf8');
const key = env.split('\n').find(l => l.startsWith('RESEND_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const resend = new Resend(key);

const html = `
<p>Halo Tim Anindyatrans,</p>

<p>Terima kasih atas quotation (Rp 2.398.000, paket REGULER). Kami setuju untuk melanjutkan.</p>

<p>Mohon kirimkan detail pembayaran berikut agar kami dapat segera melakukan transfer:</p>
<ul>
<li><b>Nomor rekening BCA</b></li>
<li><b>Nama pemilik rekening</b></li>
<li>Jumlah yang harus dibayar (konfirmasi: Rp 2.398.000)</li>
</ul>

<p>Setelah transfer, kami akan kirimkan bukti pembayaran. Mohon konfirmasi bahwa pengerjaan (REGULER, 2 hari kerja) dimulai setelah pembayaran diterima, dan bahwa hasil akhir berupa soft copy PDF dengan cap, tanda tangan, dan nomor registrasi penerjemah tersumpah (Kemenkumham).</p>

<p>Terima kasih.</p>

<p>Salam,<br>
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
