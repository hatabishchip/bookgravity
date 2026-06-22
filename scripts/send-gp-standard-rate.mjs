import { Resend } from 'resend'
import { config } from 'dotenv'
config({ path: '/Users/oleksandrdiachuk/Documents/Claude/bookgravity/.env.vercel' })

const resend = new Resend(process.env.RESEND_API_KEY)

const html = `<p>Dear Muiz,</p>

<p>Thank you for the express quotation (Rp 150,000 per result page, delivery 19 June).</p>

<p>Before we decide, could you please also send us your <b>standard (regular, non-express) rate</b> for the same two documents (Akta Pendirian + NIB, approx. 25 result pages, Indonesian to English sworn translation)?</p>

<p>Specifically:</p>
<ul>
<li>Standard price per result page (Rp)</li>
<li>Total estimated cost for the ~25 pages</li>
<li>Standard turnaround time (how many working days)</li>
<li>Down payment required for the standard option</li>
</ul>

<p>We want to compare the express vs standard options before confirming. Thank you.</p>

<p>Best regards,<br>
<b>Oleksandr Diachuk</b><br>
Director, PT GRAVITY STRETCHING CANGGU<br>
admin@bookgravity.com - +62 821 3130 468</p>`

const { data, error } = await resend.emails.send({
  from: 'PT Gravity Stretching Canggu <admin@bookgravity.com>',
  to: ['admin@gp-translator.com', 'penerjemahgp@gmail.com'],
  replyTo: 'admin@bookgravity.com',
  subject: 'Re: Jasa Penerjemah Tersumpah ID->EN - standard (regular) rate request',
  html,
})

if (error) { console.error('ERROR:', error); process.exit(1) }
console.log('Sent. ID:', data?.id)
