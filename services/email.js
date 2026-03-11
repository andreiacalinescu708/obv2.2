// services/email.js - Serviciu de email folosind Gmail SMTP
const nodemailer = require('nodemailer');

// Configurare transporter Gmail
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_FROM || 'support@openbill.ro',
      pass: process.env.EMAIL_PASSWORD // App Password din Gmail
    }
  });
}

// Template-uri email
const templates = {
  invitation: (data) => ({
    subject: `Invitație în OpenBill - ${data.companyName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Invitație în OpenBill</h1>
          </div>
          <div class="content">
            <p>Salut,</p>
            <p>Ai fost invitat să te alături companiei <strong>${data.companyName}</strong> în platforma OpenBill.</p>
            
            <div class="warning">
              <strong>⚠️ Linkul expiră în 24 de ore!</strong>
            </div>
            
            <p>Pentru a-ți crea contul, apasă butonul de mai jos:</p>
            
            <center>
              <a href="${data.inviteUrl}" class="button">Acceptă Invitația</a>
            </center>
            
            <p>Sau copiază acest link în browser:</p>
            <p style="word-break: break-all; background: #e5e7eb; padding: 10px; border-radius: 4px;">${data.inviteUrl}</p>
            
            <p>Dacă nu te așteptai la această invitație, poți ignora acest email.</p>
          </div>
          <div class="footer">
            <p>OpenBill - Sistem de management pentru distribuție</p>
            <p>support@openbill.ro</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  welcome: (data) => ({
    subject: 'Bine ai venit în OpenBill!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Bine ai venit!</h1>
          </div>
          <div class="content">
            <p>Salut ${data.firstName || data.username},</p>
            <p>Contul tău în OpenBill a fost creat cu succes pentru compania <strong>${data.companyName}</strong>.</p>
            
            <p>Poți accesa aplicația la:</p>
            <center>
              <a href="${data.loginUrl}" class="button">Intră în Aplicație</a>
            </center>
            
            <p><strong>Datele tale de login:</strong></p>
            <ul>
              <li>Username: ${data.username}</li>
              <li>URL: ${data.loginUrl}</li>
            </ul>
            
            <p><strong>🎁 Ai 30 de zile de trial gratuit!</strong></p>
          </div>
          <div class="footer">
            <p>OpenBill - Sistem de management pentru distribuție</p>
            <p>support@openbill.ro</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  verificationCode: (data) => ({
    subject: 'Cod de verificare email - OpenBill',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3B82F6; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; text-align: center; }
          .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Verificare Email</h1>
          </div>
          <div class="content">
            <p>Salut ${data.firstName || ''},</p>
            <p>Codul tău de verificare este:</p>
            
            <div class="code">${data.code}</div>
            
            <p>Acest cod expiră în 30 de minute.</p>
            <p>Dacă nu ai solicitat acest cod, poți ignora acest email.</p>
          </div>
          <div class="footer">
            <p>OpenBill</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  trialReminder: (data) => ({
    subject: 'Trialul tău OpenBill expiră curând',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #F59E0B; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
          .warning { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Trial Expiră Curând</h1>
          </div>
          <div class="content">
            <p>Salut,</p>
            <p>Trialul gratuit pentru compania <strong>${data.companyName}</strong> expiră în <strong>${data.daysLeft} zile</strong>.</p>
            
            <div class="warning">
              <p>Pentru a continua să folosești OpenBill, contactează-ne la <strong>support@openbill.ro</strong></p>
            </div>
            
            <p>Accesează aplicația: <a href="${data.appUrl}">${data.appUrl}</a></p>
          </div>
          <div class="footer">
            <p>OpenBill</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Trimite email
async function sendEmail({ to, template, data }) {
  const transporter = createTransporter();
  const templateData = templates[template](data);

  const mailOptions = {
    from: `"OpenBill" <${process.env.EMAIL_FROM || 'support@openbill.ro'}>`,
    to,
    subject: templateData.subject,
    html: templateData.html
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (err) {
    console.error(`❌ Email failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  sendEmail,
  templates
};
