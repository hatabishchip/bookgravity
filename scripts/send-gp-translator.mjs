import { Resend } from 'resend'
import fs from 'node:fs'
import { config } from 'dotenv'
config({ path: '/Users/oleksandrdiachuk/Documents/Claude/bookgravity/.env.vercel' })

const resend = new Resend(process.env.RESEND_API_KEY)

const html = `<p>Halo Tim GP Translator,</p>

<p>Saya membutuhkan jasa <b>penerjemah tersumpah Indonesia ke Inggris</b> untuk 2 dokumen perusahaan saya, untuk keperluan pendaftaran <i>Apple Developer Program</i>. Apple secara eksplisit meminta <i>solicitor-certified English translation</i>.</p>

<p><b>Dokumen perusahaan:</b><br>
Nama: PT GRAVITY STRETCHING CANGGU (PT PMA)<br>
NIB: 2304260281773<br>
SK Menkumham: AHU-0031466.AH.01.01.TAHUN 2026<br>
Alamat: Jalan Raya Padonan Gang Pilot, Tibubeneng, Kuta Utara, Badung, Bali 80365</p>

<p><b>Dokumen yang perlu diterjemahkan (terlampir):</b></p>
<ol>
<li><b>Akta Pendirian</b> PT GRAVITY STRETCHING CANGGU - 19 halaman (Akta-Pendirian.pdf)</li>
<li><b>NIB</b> 2304260281773 (lampiran resmi pemerintah) - 3 halaman (NIB.pdf)</li>
</ol>

<p>Total kira-kira 22 halaman. Mohon konfirmasi:</p>
<ul>
<li>Penawaran harga total (Rp) untuk 22 halaman Bahasa Inggris bersumpah</li>
<li>Estimasi waktu pengerjaan (kami butuh secepatnya untuk Apple, idealnya 2-3 hari)</li>
<li>Apakah hasil terjemahan dilengkapi cap sworn translator + tanda tangan + nomor registrasi Kemenkumham (Apple meminta <i>solicitor-certified</i>)</li>
<li>Apakah perlu apostille tambahan, atau cap sworn translator sudah cukup untuk Apple</li>
<li>Cara pembayaran (transfer BCA/Mandiri, atau kartu internasional)</li>
</ul>

<p>Terima kasih, mohon balasan secepatnya.</p>

<p>Salam,<br>
<b>Oleksandr Diachuk</b><br>
Direktur, PT GRAVITY STRETCHING CANGGU<br>
admin@bookgravity.com - +62 821 3130 468<br>
bookgravity.com</p>`

const akta = fs.readFileSync('/tmp/apple-docs/Akta-Pendirian.pdf')
const nib = fs.readFileSync('/tmp/apple-docs/NIB.pdf')

const { data, error } = await resend.emails.send({
  from: 'PT Gravity Stretching Canggu <admin@bookgravity.com>',
  to: ['admin@gp-translator.com', 'penerjemahgp@gmail.com'],
  replyTo: 'admin@bookgravity.com',
  subject: 'Jasa Penerjemah Tersumpah ID→EN - PT GRAVITY STRETCHING CANGGU (22 halaman, urgent untuk Apple Developer)',
  html,
  attachments: [
    { filename: 'Akta-Pendirian.pdf', content: akta.toString('base64') },
    { filename: 'NIB.pdf', content: nib.toString('base64') },
  ],
})

if (error) { console.error('ERROR:', error); process.exit(1) }
console.log('Sent. ID:', data?.id)
