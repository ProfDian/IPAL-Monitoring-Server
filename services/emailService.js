/**
 * ========================================
 * EMAIL NOTIFICATION SERVICE
 * ========================================
 * Service untuk mengirim email notification
 * menggunakan Nodemailer + Gmail SMTP
 */

const nodemailer = require("nodemailer");

// ========================================
// KONFIGURASI EMAIL TRANSPORTER
// ========================================

let transporter = null;

function initializeEmailService() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Gmail address
      pass: process.env.EMAIL_PASS, // App Password (NOT regular Gmail password!)
    },
  });

  // Verify connection
  transporter.verify(function (error) {
    if (error) {
      console.error("❌ Email service failed to initialize:", error.message);
    } else {
      console.log("✅ Email service is ready");
    }
  });

  return transporter;
}

// ========================================
// FUNGSI UTAMA: KIRIM EMAIL ALERT
// ========================================

/**
 * Kirim email notification untuk water quality alert
 *
 * @param {Object} alertData - Data alert dari Firestore
 * @param {Array<string>} recipients - Array of email addresses
 * @returns {Promise<Object>} Send result
 */
async function sendWaterQualityAlert(alertData, recipients = []) {
  try {
    const emailTransporter = initializeEmailService();

    if (!emailTransporter) {
      throw new Error("Email service not initialized");
    }

    if (!recipients || recipients.length === 0) {
      console.log("⚠️  No recipients specified, skipping email");
      return { success: false, message: "No recipients" };
    }

    console.log("📧 Preparing email notification...");
    console.log(`   Recipients: ${recipients.join(", ")}`);

    // Generate email content
    const emailContent = generateAlertEmailHTML(alertData);

    // Email options
    const mailOptions = {
      from: {
        name: "IPAL Monitoring System",
        address: process.env.EMAIL_USER || "noreply@ipal-monitoring.com",
      },
      to: recipients.join(", "),
      subject: `🚨 ALERT: ${alertData.rule} - IPAL ${alertData.ipal_id}`,
      html: emailContent,
      priority: alertData.severity === "critical" ? "high" : "normal",
    };

    // Send email
    const info = await emailTransporter.sendMail(mailOptions);

    console.log("✅ Email sent successfully!");
    console.log(`   Message ID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
      recipients: recipients,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("💥 Failed to send email:", error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Generate HTML email content
 * UPDATED: Support multiple violations in 1 email
 */
function generateAlertEmailHTML(alertData) {
  const severityColor = {
    critical: "#dc3545",
    high: "#fd7e14",
    medium: "#ffc107",
    low: "#28a745",
  };

  const severityLabel = {
    critical: "KRITIS",
    high: "TINGGI",
    medium: "SEDANG",
    low: "RENDAH",
  };

  const color = severityColor[alertData.severity] || "#6c757d";
  const label = severityLabel[alertData.severity] || "UNKNOWN";

  const timestamp = alertData.timestamp?.toDate
    ? alertData.timestamp.toDate()
    : new Date();

  // Check if multiple violations (array)
  const hasMultipleViolations =
    alertData.violations && alertData.violations.length > 0;
  const violationCount = hasMultipleViolations
    ? alertData.violations.length
    : 1;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      color: #333; 
      background-color: #f4f4f4; 
      margin: 0; 
      padding: 0; 
    }
    .container { 
      max-width: 600px; 
      margin: 20px auto; 
      background-color: #ffffff; 
      border-radius: 8px; 
      overflow: hidden; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
    }
    .header { 
      background-color: ${color}; 
      color: white; 
      padding: 20px; 
      text-align: center; 
    }
    .header h1 { 
      margin: 0; 
      font-size: 24px; 
    }
    .severity-badge { 
      display: inline-block; 
      background-color: rgba(255,255,255,0.2); 
      padding: 5px 15px; 
      border-radius: 20px; 
      margin-top: 10px; 
      font-weight: bold; 
    }
    .content { 
      padding: 30px; 
    }
    .alert-info { 
      background-color: #f8f9fa; 
      border-left: 4px solid ${color}; 
      padding: 15px; 
      margin-bottom: 20px; 
    }
    .alert-info h2 { 
      margin-top: 0; 
      color: ${color}; 
      font-size: 18px; 
    }
    .violation-card {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 4px;
    }
    .violation-card.critical {
      background-color: #f8d7da;
      border-left-color: #dc3545;
    }
    .violation-card.high {
      background-color: #ffe5d0;
      border-left-color: #fd7e14;
    }
    .violation-card.medium {
      background-color: #fff3cd;
      border-left-color: #ffc107;
    }
    .violation-card.low {
      background-color: #d1e7dd;
      border-left-color: #28a745;
    }
    .violation-card h4 {
      margin: 0 0 10px 0;
      color: #333;
      font-size: 16px;
    }
    .violation-card p {
      margin: 5px 0;
      font-size: 14px;
    }
    .value-high { 
      color: #dc3545; 
      font-weight: bold; 
    }
    .data-table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 20px 0; 
    }
    .data-table th, .data-table td { 
      padding: 12px; 
      text-align: left; 
      border-bottom: 1px solid #ddd; 
    }
    .data-table th { 
      background-color: #f8f9fa; 
      font-weight: bold; 
      color: #495057; 
    }
    .cta-button { 
      display: inline-block; 
      background-color: #007bff; 
      color: white; 
      padding: 12px 30px; 
      text-decoration: none; 
      border-radius: 5px; 
      margin-top: 20px; 
    }
    .footer { 
      background-color: #f8f9fa; 
      padding: 20px; 
      text-align: center; 
      font-size: 12px; 
      color: #6c757d; 
    }
    .count-badge {
      display: inline-block;
      background-color: ${color};
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 PERINGATAN KUALITAS AIR</h1>
      <div class="severity-badge">TINGKAT: ${label}</div>
      ${
        violationCount > 1
          ? `<div style="margin-top: 10px; font-size: 16px;">${violationCount} Parameter Violations</div>`
          : ""
      }
    </div>
    
    <div class="content">
      <div class="alert-info">
        <h2>${alertData.rule}</h2>
        <p><strong>Pesan:</strong> ${alertData.message}</p>
      </div>

      <h3>📊 Detail Alert:</h3>
      <table class="data-table">
        <tr><th>IPAL ID</th><td>${alertData.ipal_id}</td></tr>
        <tr><th>Waktu</th><td>${timestamp.toLocaleString("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}</td></tr>
        ${
          violationCount > 1
            ? `<tr><th>Jumlah Violations</th><td><span class="count-badge">${violationCount}</span></td></tr>`
            : ""
        }
      </table>

      ${
        hasMultipleViolations
          ? `
        <h3>⚠️ Parameter Violations <span class="count-badge">${violationCount}</span>:</h3>
        ${alertData.violations
          .map((v, index) => {
            const vColor = severityColor[v.severity] || "#6c757d";
            const vLabel = severityLabel[v.severity] || "UNKNOWN";

            return `
          <div class="violation-card ${v.severity}">
            <h4>
              ${index + 1}. ${v.parameter.toUpperCase()} 
              <span style="float: right; color: ${vColor}; font-size: 14px;">
                ${vLabel}
              </span>
            </h4>
            <p><strong>📍 Lokasi:</strong> ${
              v.location === "inlet" ? "Inlet (Masuk)" : "Outlet (Keluar)"
            }</p>
            <p><strong>📊 Nilai:</strong> <span class="value-high">${
              typeof v.value === "number" ? v.value.toFixed(2) : v.value
            }</span></p>
            <p><strong>⚖️ Batas Baku Mutu:</strong> ${v.threshold}</p>
            <p style="color: #856404; margin-top: 10px;">
              <strong>💬 Detail:</strong> ${v.message}
            </p>
          </div>
          `;
          })
          .join("")}
      `
          : `
        <h3>📈 Pembacaan Sensor:</h3>
        <table class="data-table">
          <tr><th>Parameter</th><td><strong>${
            alertData.parameter ? alertData.parameter.toUpperCase() : "N/A"
          }</strong></td></tr>
          <tr><th>Lokasi</th><td>${
            alertData.location === "inlet"
              ? "Inlet (Masuk)"
              : alertData.location === "outlet"
                ? "Outlet (Keluar)"
                : alertData.location
          }</td></tr>
          ${
            alertData.inlet_value !== null &&
            alertData.inlet_value !== undefined
              ? `<tr><td>Inlet</td><td>${alertData.inlet_value}</td></tr>`
              : ""
          }
          ${
            alertData.outlet_value !== null &&
            alertData.outlet_value !== undefined
              ? `<tr><td>Outlet</td><td class="value-high">${alertData.outlet_value}</td></tr>`
              : ""
          }
          ${
            alertData.threshold
              ? `<tr><td>Batas Baku Mutu</td><td>${alertData.threshold}</td></tr>`
              : ""
          }
          ${
            alertData.reduction
              ? `<tr><td>Efisiensi Reduksi</td><td class="value-high">${alertData.reduction}%</td></tr>`
              : ""
          }
        </table>
      `
      }

      <div style="background-color: #e7f3ff; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0;">
        <h4 style="margin-top: 0; color: #007bff;">📌 Tindakan yang Disarankan:</h4>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Segera periksa sistem IPAL</li>
          <li>Verifikasi pembacaan sensor</li>
          <li>Lakukan tindakan korektif sesuai SOP</li>
          <li>Dokumentasikan temuan dan tindakan</li>
        </ul>
      </div>

      <div style="text-align: center;">
        <a href="${
          process.env.FRONTEND_URL ||
          "https://ipal-monitoring-teklingundip.vercel.app"
        }/alerts?from=email" class="cta-button">
          🖥️ Lihat Detail di Dashboard
        </a>
      </div>
    </div>
    
    <div class="footer">
      <p><strong>Email ini dikirim otomatis oleh IPAL Monitoring System</strong></p>
      <p>Departemen Teknik Lingkungan</p>
      <p>Universitas Diponegoro</p>
      <p style="margin-top: 10px; color: #999;">
        Harap tidak membalas email ini. Untuk bantuan, hubungi administrator sistem.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  sendWaterQualityAlert,
  sendTestEmail,
  initializeEmailService,
};

console.log("📦 emailService loaded");
