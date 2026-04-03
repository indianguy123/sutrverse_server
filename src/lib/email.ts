import nodemailer from 'nodemailer';
import { dayjs } from './time.js';

const transporter = (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    })
  : null;

export async function sendBookingConfirmation(params: {
  id: string;
  customerName: string;
  customerEmail: string;
  service: string;
  startTime: Date;
  stylist: { name: string };
  salon: { name: string; timezone: string; email?: string | null };
}) {
  if (!transporter) {
    console.warn('[email] EMAIL_USER or EMAIL_APP_PASSWORD not configured \u2014 skipping email');
    return;
  }

  const localTime = dayjs(params.startTime)
    .tz(params.salon.timezone)
    .format('dddd, MMMM D YYYY [at] h:mm A');

  await transporter.sendMail({
    from: `"Salon Booking" <${process.env.EMAIL_USER}>`,
    replyTo: params.salon.email ?? undefined,
    to: params.customerEmail,
    subject: `Your appointment at ${params.salon.name} is confirmed`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
        <h1 style="font-size:24px;font-weight:600;margin-bottom:8px;">Booking Confirmed \u2713</h1>
        <p style="color:#555;margin-bottom:24px;">
          Hi ${params.customerName}, your appointment is booked.
        </p>
        <table style="width:100%;border-collapse:collapse;background:#f9f9f7;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:10px 16px;color:#888;font-size:13px;width:120px;">Stylist</td>
            <td style="padding:10px 16px;font-weight:500;">${params.stylist.name}</td>
          </tr>
          <tr style="background:#f3f2ef;">
            <td style="padding:10px 16px;color:#888;font-size:13px;">Service</td>
            <td style="padding:10px 16px;font-weight:500;">${params.service}</td>
          </tr>
          <tr>
            <td style="padding:10px 16px;color:#888;font-size:13px;">Date & Time</td>
            <td style="padding:10px 16px;font-weight:500;">${localTime}</td>
          </tr>
          <tr style="background:#f3f2ef;">
            <td style="padding:10px 16px;color:#888;font-size:13px;">Booking ID</td>
            <td style="padding:10px 16px;font-family:monospace;font-size:12px;color:#555;">${params.id}</td>
          </tr>
        </table>
        <p style="color:#aaa;font-size:12px;margin-top:24px;">
          To cancel or reschedule, contact ${params.salon.name} directly.
        </p>
      </div>
    `,
  });
}
