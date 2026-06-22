import { Resend } from 'resend';
import fs from 'fs';

const env = fs.readFileSync(new URL('../.env.vercel', import.meta.url), 'utf8');
const key = env.split('\n').find(l => l.startsWith('RESEND_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const resend = new Resend(key);

const akta = fs.readFileSync('/Users/oleksandrdiachuk/Downloads/apple-translation/1-Akta-Pendirian-original.pdf').toString('base64');
const nib = fs.readFileSync('/Users/oleksandrdiachuk/Downloads/apple-translation/3-NIB-original.pdf').toString('base64');

const html = `
<p>Halo Tim Anindyatrans,</p>

<p>Terima kasih atas layanan Anda. Kami ingin <b>MELANJUTKAN pemesanan</b> layanan penerjemah tersumpah Indonesia ke Inggris dengan paket <b>REGULER (2 hari kerja)</b> untuk 2 dokumen perusahaan kami, untuk keperluan pendaftaran <i>Apple Developer Program</i>.</p>

<p><b>Dokumen perusahaan:</b><br>
Nama: PT GRAVITY STRETCHING CANGGU (PT PMA)<br>
NIB: 2304260281773<br>
SK Menkumham: AHU-0031466.AH.01.01.TAHUN 2026</p>

<p><b>Dokumen terlampir untuk diterjemahkan:</b></p>
<ol>
<li>Akta Pendirian - 19 halaman (terlampir)</li>
<li>NIB - 3 halaman (terlampir)</li>
</ol>

<p>Mohon konfirmasi:</p>
<ul>
<li>Total biaya final (Rp) untuk paket <b>REGULER</b> berdasarkan dokumen terlampir</li>
<li><b>NOMOR REGISTRASI penerjemah tersumpah (Kemenkumham)</b> yang akan tercantum pada hasil, beserta cap dan tanda tangan (Apple secara khusus meminta hal ini)</li>
<li>Apakah hasil dalam bentuk <b>SOFT COPY (PDF digital)</b> dengan cap, tanda tangan, dan nomor registrasi sudah cukup, tanpa perlu hardcopy fisik (kami submit secara online ke Apple)</li>
<li>Estimasi waktu pengerjaan (REGULER 2 hari kerja)</li>
<li>Cara pembayaran (rekening bank BCA/Mandiri atau opsi lain) dan apakah perlu pembayaran di muka penuh</li>
</ul>

<p>Mohon kirimkan invoice/quotation agar kami dapat segera melakukan pembayaran dan memulai pengerjaan. Terima kasih.</p>

<p>Salam,<br>
<b>Oleksandr Diachuk</b><br>
Direktur, PT GRAVITY STRETCHING CANGGU<br>
admin@bookgravity.com - +62 821 3130 468<br>
bookgravity.com</p>
`;

const res = await resend.emails.send({
  from: 'PT Gravity Stretching Canggu <admin@bookgravity.com>',
  to: 'cs@anindyatrans.com',
  replyTo: 'admin@bookgravity.com',
  subject: 'Konfirmasi Order - Terjemahan Tersumpah REGULER ID->EN (Akta + NIB) untuk Apple Developer - PT GRAVITY STRETCHING CANGGU',
  html,
  attachments: [
    { filename: 'Akta-Pendirian-PT-Gravity-Stretching-Canggu.pdf', content: akta },
    { filename: 'NIB-2304260281773.pdf', content: nib },
  ],
});

console.log('result:', JSON.stringify(res.data || res.error));
