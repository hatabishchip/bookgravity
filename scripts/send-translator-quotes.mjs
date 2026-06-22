import { Resend } from 'resend';
import fs from 'fs';

// load RESEND_API_KEY from .env.vercel
const env = fs.readFileSync(new URL('../.env.vercel', import.meta.url), 'utf8');
const key = env.split('\n').find(l => l.startsWith('RESEND_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const resend = new Resend(key);

const FROM = 'PT Gravity Stretching Canggu <admin@bookgravity.com>';
const SUBJECT = 'Permintaan Penawaran - Penerjemah Tersumpah ID->EN (Akta + NIB, untuk Apple Developer) - PT GRAVITY STRETCHING CANGGU';

const body = (greeting) => `
<p>Halo ${greeting},</p>

<p>Saya membutuhkan jasa <b>penerjemah tersumpah Indonesia ke Inggris</b> untuk 2 dokumen perusahaan, untuk pendaftaran <i>Apple Developer Program</i>. Apple meminta <i>"solicitor-certified English translation"</i>; untuk Indonesia padanannya adalah penerjemah tersumpah (sworn translator) yang diakui Kemenkumham, dengan cap + tanda tangan + nomor registrasi.</p>

<p><b>Dokumen perusahaan:</b><br>
Nama: PT GRAVITY STRETCHING CANGGU (PT PMA)<br>
NIB: 2304260281773<br>
SK Menkumham: AHU-0031466.AH.01.01.TAHUN 2026<br>
Alamat: Jalan Raya Padonan Gang Pilot, Tibubeneng, Kuta Utara, Badung, Bali 80365</p>

<p><b>Dokumen yang perlu diterjemahkan:</b></p>
<ol>
<li><b>Akta Pendirian</b> - sekitar 19 halaman</li>
<li><b>NIB</b> (lampiran resmi pemerintah) - sekitar 3 halaman</li>
</ol>
<p>Total sekitar 22 halaman sumber.</p>

<p>Mohon konfirmasi:</p>
<ul>
<li>Harga per halaman hasil + estimasi total untuk ~25 halaman hasil (Rp)</li>
<li>Estimasi waktu pengerjaan (kami butuh secepatnya untuk Apple), dan apakah ada layanan express</li>
<li>Apakah hasil dilengkapi cap penerjemah tersumpah + tanda tangan + <b>NOMOR REGISTRASI Kemenkumham</b> (Apple meminta ini)</li>
<li>Apakah soft copy (PDF) saja sudah cukup, atau perlu hard copy</li>
<li>Cara pembayaran dan apakah perlu uang muka (down payment)</li>
</ul>

<p>Kami dapat mengirimkan kedua dokumen (PDF) segera setelah Anda konfirmasi. Mohon balasan ke email ini (admin@bookgravity.com).</p>

<p>Terima kasih,<br>
<b>Oleksandr Diachuk</b><br>
Direktur, PT GRAVITY STRETCHING CANGGU<br>
admin@bookgravity.com - +62 821 3130 468<br>
bookgravity.com</p>
`;

const recipients = [
  { to: 'cs@anindyatrans.com', greeting: 'Tim Anindyatrans' },
  { to: 'info@mediamaz.co.id', greeting: 'Tim Mediamaz Translation' },
];

for (const r of recipients) {
  try {
    const res = await resend.emails.send({
      from: FROM,
      to: r.to,
      replyTo: 'admin@bookgravity.com',
      subject: SUBJECT,
      html: body(r.greeting),
    });
    console.log(`${r.to} -> id=${res.data?.id || JSON.stringify(res.error)}`);
  } catch (e) {
    console.log(`${r.to} -> ERROR ${e.message}`);
  }
}
