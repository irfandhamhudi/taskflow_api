import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

// Konfigurasi transporter email yang dinamis & robust
const isSecure = process.env.EMAIL_SECURE === "true" || process.env.EMAIL_PORT === "465";

const transporterConfig = (process.env.EMAIL_SERVICE && !process.env.EMAIL_HOST)
  ? {
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    }
  : {
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: isSecure,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        // Mengizinkan self-signed certificates untuk keandalan koneksi di beberapa server production
        rejectUnauthorized: false,
      },
    };

// Tambahkan timeout options
transporterConfig.connectionTimeout = 15000; // 15 detik
transporterConfig.socketTimeout = 15000;
transporterConfig.greetingTimeout = 15000;

let transporter = null;
let resend = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("🚀 Resend Node SDK is configured and active for sending emails.");
} else {
  console.log("📧 Initializing email transporter with config:", {
    service: transporterConfig.service || "custom",
    host: transporterConfig.host || "N/A",
    port: transporterConfig.port || "N/A",
    secure: transporterConfig.secure || "N/A",
    user: process.env.EMAIL_USER || "N/A",
  });

  transporter = nodemailer.createTransport(transporterConfig);

  // Verifikasi koneksi
  transporter.verify((error, success) => {
    if (error) {
      console.error("❌ Error connecting to email server:", error);
      console.error("❌ Error details:", {
        message: error.message,
        code: error.code,
        hostname: error.hostname,
      });
    } else {
      console.log("✅ Email server is ready to send messages");
      console.log("✅ Connected to:", success);
    }
  });
}

// Fungsi sendEmail dengan error handling yang lebih baik
export const sendEmail = async ({ to, subject, html }) => {
  try {
    // Validasi input
    if (!to || !subject || !html) {
      throw new Error("Missing email parameters");
    }

    // Jika menggunakan Resend API
    if (process.env.RESEND_API_KEY) {
      console.log(`📧 Sending email to: ${to} via Resend Node SDK`);
      const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";
      
      console.log(`📧 Using sender: ${fromEmail}`);

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: to,
        subject: subject,
        html: html,
      });

      if (error) {
        throw error;
      }

      console.log("✅ Email sent successfully via Resend Node SDK!");
      console.log("📧 Resend Message ID:", data.id);
      return data;
    }

    // Jika menggunakan Nodemailer SMTP
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("❌ Email credentials missing in .env file");
      console.error("EMAIL_USER:", process.env.EMAIL_USER ? "Set" : "NOT SET");
      console.error("EMAIL_PASS:", process.env.EMAIL_PASS ? "Set" : "NOT SET");
      throw new Error("Email configuration missing");
    }

    console.log(`📧 Sending email to: ${to} via SMTP`);
    console.log(`📧 Using sender: ${process.env.EMAIL_USER}`);

    const mailOptions = {
      from: process.env.EMAIL_FROM || `"TaskFlow" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      // Tambahan untuk debugging
      headers: {
        "X-Mailer": "TaskFlow API",
        "X-Priority": "3",
      },
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent successfully!");
    console.log("📧 Message ID:", info.messageId);
    console.log("📧 Response:", info.response);

    return info;
  } catch (error) {
    console.error("❌ Failed to send email:");
    if (process.env.RESEND_API_KEY) {
      console.error("Active configuration: Resend HTTP SDK");
    } else {
      console.error("Active transporter configuration:", {
        service: transporterConfig.service || "custom",
        host: transporterConfig.host || "N/A",
        port: transporterConfig.port || "N/A",
        secure: transporterConfig.secure || "N/A",
        user: process.env.EMAIL_USER || "N/A",
      });
    }
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code || "N/A");
    console.error("Error stack:", error.stack);

    // Berikan pesan error yang lebih spesifik
    let errorMessage = "Failed to send email";

    if (process.env.RESEND_API_KEY) {
      errorMessage = error.message || "Resend SDK Error";
    } else {
      if (error.code === "EDNS" || error.code === "ENOTFOUND") {
        errorMessage =
          "DNS lookup failed. Check your internet connection or SMTP server settings.";
      } else if (error.code === "EAUTH") {
        errorMessage = "Authentication failed. Check your email and password.";
      } else if (error.code === "ECONNECTION") {
        errorMessage = "Connection failed. Check your network or SMTP server.";
      } else if (error.code === "ETIMEDOUT") {
        errorMessage = "Connection timed out. Try again later.";
      }
    }

    throw new Error(errorMessage);
  }
};

// Send OTP email
export const sendOTPEmail = async (email, name, otp) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Modern Task Management</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Email Verification</h2>
        <p style="color: #666; line-height: 1.6;">
          Hello <strong>${name}</strong>,<br><br>
          Thank you for registering with TaskFlow! Please use the verification code below to complete your registration.
        </p>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #667eea; margin-bottom: 10px;">
            ${otp}
          </div>
          <p style="color: #666; font-size: 14px; margin: 0;">
            This code will expire in 10 minutes
          </p>
        </div>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          If you didn't create an account with TaskFlow, please ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message, please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: "TaskFlow - Email Verification",
    html,
  });
};

// Send password reset email
export const sendPasswordResetEmail = async (email, name, resetUrl) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Password Reset Request</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Reset Your Password</h2>
        <p style="color: #666; line-height: 1.6;">
          Hello <strong>${name}</strong>,<br><br>
          We received a request to reset your TaskFlow password. Click the button below to create a new password.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                    display: inline-block;
                    transition: transform 0.2s;">
            Reset Password
          </a>
        </div>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <span style="color: #667eea; word-break: break-all;">${resetUrl}</span>
        </p>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          This password reset link will expire in 15 minutes.<br>
          If you didn't request a password reset, please ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          For security reasons, this link can only be used once.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: "TaskFlow - Password Reset",
    html,
  });
};

// Send project invitation email
export const sendProjectInvitation = async (
  email,
  inviterName,
  projectName,
  inviteUrl,
  role
) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Project Invitation</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">You're Invited!</h2>
        <p style="color: #666; line-height: 1.6;">
          <strong>${inviterName}</strong> has invited you to join the project:<br>
          <span style="font-size: 18px; color: #667eea; font-weight: bold;">${projectName}</span>
        </p>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #666; margin: 0;">
            <strong>Role:</strong> ${role}<br>
            <strong>Invited by:</strong> ${inviterName}
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                    display: inline-block;
                    transition: transform 0.2s;">
            Accept Invitation
          </a>
        </div>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          This invitation will expire in 7 days.<br>
          If you don't have a TaskFlow account yet, you'll be prompted to create one.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated invitation, please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `Invitation to join project: ${projectName}`,
    html,
  });
};

// Send task assignment notification
export const sendTaskAssignmentEmail = async (
  email,
  assignerName,
  taskTitle,
  projectName,
  taskUrl
) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">New Task Assignment</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">New Task Assigned</h2>
        <p style="color: #666; line-height: 1.6;">
          <strong>${assignerName}</strong> has assigned you a new task:<br>
          <span style="font-size: 18px; color: #10b981; font-weight: bold;">${taskTitle}</span>
        </p>
        
        <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
          <p style="color: #666; margin: 0;">
            <strong>Project:</strong> ${projectName}<br>
            <strong>Assigned by:</strong> ${assignerName}<br>
            <strong>Assigned on:</strong> ${new Date().toLocaleDateString()}
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${taskUrl}" 
             style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                    display: inline-block;">
            View Task
          </a>
        </div>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          You can view and update this task from your TaskFlow dashboard.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          Manage your notification preferences in your TaskFlow account settings.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `New Task: ${taskTitle}`,
    html,
  });
};

// Send task completion notification
export const sendTaskCompletionEmail = async (
  email,
  completerName,
  taskTitle,
  projectName,
  taskUrl
) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Task Completed</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Task Marked as Complete</h2>
        <p style="color: #666; line-height: 1.6;">
          <strong>${completerName}</strong> has marked this task as complete:<br>
          <span style="font-size: 18px; color: #8b5cf6; font-weight: bold;">${taskTitle}</span>
        </p>
        
        <div style="background: #faf5ff; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
          <div style="font-size: 48px; color: #8b5cf6; margin-bottom: 10px;">✓</div>
          <p style="color: #666; font-size: 16px; margin: 0;">
            Task completed successfully!
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${taskUrl}" 
             style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                    display: inline-block;">
            Review Task
          </a>
        </div>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          If this task requires approval, please review and confirm completion.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          Great work! 🎉
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `Task Completed: ${taskTitle}`,
    html,
  });
};

// Send due date reminder
export const sendDueDateReminder = async (
  email,
  userName,
  taskTitle,
  projectName,
  dueDate,
  taskUrl
) => {
  const formattedDueDate = new Date(dueDate).toLocaleDateString();
  const daysUntilDue = Math.ceil(
    (new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24)
  );

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, ${
        daysUntilDue <= 1 ? "#ef4444" : "#f59e0b"
      } 0%, ${
    daysUntilDue <= 1 ? "#dc2626" : "#d97706"
  } 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Due Date Reminder</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Task Due Soon</h2>
        <p style="color: #666; line-height: 1.6;">
          Hello <strong>${userName}</strong>,<br><br>
          This task is due ${
            daysUntilDue <= 1 ? "tomorrow" : `in ${daysUntilDue} days`
          }:
        </p>
        
        <div style="background: ${daysUntilDue <= 1 ? "#fef2f2" : "#fffbeb"}; 
                    border-left: 4px solid ${
                      daysUntilDue <= 1 ? "#ef4444" : "#f59e0b"
                    }; 
                    padding: 20px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">${taskTitle}</h3>
          <p style="color: #666; margin: 5px 0;">
            <strong>Project:</strong> ${projectName}<br>
            <strong>Due Date:</strong> ${formattedDueDate}<br>
            <strong>Status:</strong> ${
              daysUntilDue <= 1 ? "URGENT" : "Upcoming"
            }
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${taskUrl}" 
             style="background: linear-gradient(135deg, ${
               daysUntilDue <= 1 ? "#ef4444" : "#f59e0b"
             } 0%, ${daysUntilDue <= 1 ? "#dc2626" : "#d97706"} 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                    display: inline-block;">
            ${daysUntilDue <= 1 ? "Complete Now" : "View Task"}
          </a>
        </div>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          Please update the task status or request an extension if needed.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          You're receiving this because you're assigned to this task.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `${
      daysUntilDue <= 1 ? "URGENT" : "Reminder"
    }: "${taskTitle}" due ${formattedDueDate}`,
    html,
  });
};

// Send comment notification
export const sendCommentNotification = async (
  email,
  commenterName,
  taskTitle,
  projectName,
  commentText,
  taskUrl
) => {
  const truncatedComment =
    commentText.length > 150
      ? commentText.substring(0, 150) + "..."
      : commentText;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">New Comment</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">New Comment Added</h2>
        <p style="color: #666; line-height: 1.6;">
          <strong>${commenterName}</strong> commented on:<br>
          <span style="font-size: 18px; color: #3b82f6; font-weight: bold;">${taskTitle}</span>
        </p>
        
        <div style="background: #eff6ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #666; margin: 0 0 10px;">
            <strong>Comment:</strong>
          </p>
          <p style="color: #4b5563; font-style: italic; margin: 0; padding-left: 15px; border-left: 3px solid #3b82f6;">
            "${truncatedComment}"
          </p>
          <p style="color: #6b7280; font-size: 14px; margin: 10px 0 0; text-align: right;">
            - ${commenterName}
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${taskUrl}" 
             style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                    display: inline-block;">
            View Discussion
          </a>
        </div>
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          Reply to this comment directly in TaskFlow to continue the discussion.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          You're receiving this because you're following or assigned to this task.
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `New comment on "${taskTitle}"`,
    html,
  });
};

export const sendGenericNotification = async (email, senderName, message, link) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">TaskFlow</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">Notification</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">New Notification</h2>
        <p style="color: #666; line-height: 1.6;">
          ${message}
        </p>
        
        ${link ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" 
             style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
                    color: white; 
                    padding: 15px 30px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                    display: inline-block;">
            View Details
          </a>
        </div>
        ` : ''}
        
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          Sent by ${senderName}
        </p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          TaskFlow © ${new Date().getFullYear()}
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `TaskFlow: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
    html,
  });
};

// Simple version for testing
export const sendTestEmail = async () => {
  return await sendEmail({
    to: "test@example.com",
    subject: "Test Email from TaskFlow",
    html: "<h1>This is a test email</h1><p>If you see this, email service is working!</p>",
  });
};

export default {
  sendEmail,
  sendOTPEmail,
  sendPasswordResetEmail,
  sendProjectInvitation,
  sendTaskAssignmentEmail,
  sendTaskCompletionEmail,
  sendDueDateReminder,
  sendCommentNotification,
  sendGenericNotification,
  sendTestEmail,
};
