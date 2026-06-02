import Task from "../models/Task.js";
import { createNotification } from "../controllers/notificationController.js";
import { emitToUser } from "./socketHandler.js";
import { sendEmail } from "../service/emailService.js";

export const checkReminders = async () => {
  const now = new Date();
  try {
    // Find tasks with pending reminders
    const tasks = await Task.find({
      "reminders.time": { $lte: now },
      "reminders.notified": false
    }).populate('assignedTo createdBy', 'name email settings');

    for (const task of tasks) {
      for (const reminder of task.reminders) {
        if (reminder.time <= now && !reminder.notified) {
          // Send notification to all assigned users
          const recipients = task.assignedTo.length > 0 
            ? task.assignedTo 
            : [task.createdBy];

          for (const recipient of recipients) {
            const recipientId = recipient._id;
            const recipientEmail = recipient.email;
            const recipientName = recipient.name;

            await createNotification({
              recipient: recipientId,
              sender: task.createdBy._id,
              type: "TASK_REMINDER",
              message: `Reminder: Task "${task.title}" is due soon or has a scheduled alert.`,
              relatedId: task._id,
              relatedModel: "Task",
              link: `/projects/${task.projectId}/tasks/${task._id}`
            });

            // Optional: socket emit for real-time alert
            emitToUser(recipientId.toString(), "notification_received", {
              type: "TASK_REMINDER",
              message: `Reminder: Task "${task.title}"`
            });

            // Send Email
            if (recipientEmail && recipient.settings?.emailNotifications !== false) {
              const taskUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/projects/${task.projectId}/tasks/${task._id}`;
              const html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: #f59e0b; padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">Task Reminder</h1>
                  </div>
                  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p>Hello <strong>${recipientName}</strong>,</p>
                    <p>This is a reminder for your task: <strong>${task.title}</strong>.</p>
                    <p>Please check the task details for more information.</p>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${taskUrl}" style="background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Task</a>
                    </div>
                  </div>
                </div>
              `;
              try {
                await sendEmail({
                  to: recipientEmail,
                  subject: `Reminder: ${task.title}`,
                  html
                });
              } catch (emailErr) {
                console.error(`Failed to send reminder email to ${recipientEmail}:`, emailErr.message);
              }
            }
          }

          reminder.notified = true;
        }
      }
      await task.save();
    }
  } catch (error) {
    console.error("Reminder job error:", error);
  }
};

export const startReminderJob = () => {
  // Check every minute
  setInterval(checkReminders, 60000);
  console.log("Reminder job started (checks every minute)");
};
