import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { emitToUser, emitToMultipleUsers } from "../utils/socketHandler.js";
import emailService from "../service/emailService.js";

// Get user notifications
export const getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const query = { recipient: req.user._id };

    if (unreadOnly === "true") {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("sender", "name email profilePicture");

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      data: notifications,
      meta: {
        current_page: Number(page),
        total_pages: Math.ceil(total / limit),
        total_items: total,
        unread_count: unreadCount,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching notifications",
    });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Error updating notification",
    });
  }
};

// Mark multiple notifications as read
export const markNotificationsAsRead = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No notification IDs provided",
      });
    }

    await Notification.updateMany(
      { _id: { $in: ids }, recipient: req.user._id },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: "Notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Error updating notifications",
    });
  }
};

// Mark all as read
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all as read:", error);
    res.status(500).json({
      success: false,
      message: "Error updating notifications",
    });
  }
};

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting notification",
    });
  }
};

// Delete multiple notifications
export const deleteNotifications = async (req, res) => {
  try {
    const { ids } = req.body; // Expect array of IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No notification IDs provided",
      });
    }

    const result = await Notification.deleteMany({
      _id: { $in: ids },
      recipient: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} notifications deleted`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting notifications",
    });
  }
};

// Delete ALL notifications for user
export const deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "All notifications deleted",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting all notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting all notifications",
    });
  }
};

// Helper to map notification type to preference key
const getPreferenceType = (type) => {
  if (type.startsWith("TASK_")) return "task";
  if (type.startsWith("COMMENT_") || type === "MENTION") return "comment";
  if (type.startsWith("PROJECT_")) return "project";
  if (type.startsWith("MEETING_")) return "meeting";
  return "system"; // Default for others like ATTACHMENT_UPLOADED
};

// Helper to send email based on notification
const sendNotificationEmail = async (user, notification) => {
  try {
    // 1. Check master switch
    if (user.settings?.emailNotifications === false) return;

    // 2. Check specific type preference
    const prefType = getPreferenceType(notification.type);
    if (user.settings?.notificationTypes?.[prefType] === false) return;

    const email = user.email;
    if (!email) return;

    // 3. Dispatch to correct email template
    const { type, message, link, details } = notification;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const fullLink = link?.startsWith("http") ? link : `${frontendUrl}${link}`;

    switch (type) {
      case "TASK_ASSIGNED":
        await emailService.sendTaskAssignmentEmail(
          email,
          notification.sender?.name || "A team member",
          details?.taskTitle || "a new task",
          details?.projectName || "TaskFlow Project",
          fullLink
        );
        break;
      
      case "TASK_COMPLETED":
        await emailService.sendTaskCompletionEmail(
          email,
          notification.sender?.name || "A team member",
          details?.taskTitle || "a task",
          details?.projectName || "TaskFlow Project",
          fullLink
        );
        break;

      case "MEETING_SCHEDULED":
      case "MEETING_DELETED":
        // For now, use a generic notification or simple email
        await emailService.sendGenericNotification?.(
          email,
          notification.sender?.name || "TaskFlow",
          message,
          fullLink
        ) || console.log("Email service doesn't support generic notifications yet");
        break;

      case "COMMENT_ADDED":
      case "MENTION":
        await emailService.sendCommentNotification(
          email,
          notification.sender?.name || "A team member",
          details?.taskTitle || "a task",
          details?.projectName || "TaskFlow Project",
          details?.commentText || message,
          fullLink
        );
        break;

      case "PROJECT_INVITE":
        // Handled in projectController usually, but here for completeness if needed
        break;

      default:
        // Generic email could be added here
        break;
    }
  } catch (error) {
    console.error("Error in sendNotificationEmail:", error);
  }
};

// Helper function to create notification (internal use)
export const createNotification = async ({
  recipient,
  sender,
  type,
  message,
  relatedId,
  relatedModel,
  link,
  details,
}) => {
  try {
    // recipient and sender are both included now as per user request

    // Check user preferences
    const user = await User.findById(recipient).select("email settings");
    if (user && user.settings && user.settings.notificationTypes) {
       const prefType = getPreferenceType(type);
       // If preference is explicitly false, do not create notification
       if (user.settings.notificationTypes[prefType] === false) {
          console.log(`Notification suppressed for user ${recipient} due to preference: ${prefType}`);
          return null;
       }
    }

    const notification = await Notification.create({
      recipient,
      sender,
      type,
      message,
      relatedId,
      relatedModel,
      link,
      details,
    });

    // Populate sender info for frontend display
    await notification.populate("sender", "name profilePicture");

    console.log(`Sending notification to user:${recipient} - data:`, notification);
    emitToUser(recipient.toString(), "new_notification", notification);

    // Send Email asynchronously
    if (user) {
      sendNotificationEmail(user, notification);
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    // Don't throw, just log error so main flow doesn't break
  }
};

// Create notification for all members of a project
export const createProjectNotification = async ({
  project,
  sender: senderId,
  type,
  message,
  relatedId,
  relatedModel,
  link,
  details,
}) => {
  try {
    if (!project) return null;

    // Get sender info for socket emission
    const sender = await User.findById(senderId).select("name profilePicture");

    // All members including owner (deduplicated)
    let recipientIds = [...new Set([
      project.owner.toString(),
      ...project.members.map((m) => m.user.toString()),
    ])];

    if (recipientIds.length === 0) return null;

    // Filter by preferences
    const prefType = getPreferenceType(type);
    const users = await User.find({ 
      _id: { $in: recipientIds } 
    }).select("email settings");

    const usersMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    recipientIds = recipientIds.filter(id => {
       const user = usersMap[id];
       if (user && user.settings && user.settings.notificationTypes) {
          if (user.settings.notificationTypes[prefType] === false) {
             return false;
          }
       }
       return true;
    });

    if (recipientIds.length === 0) return null;

    // Bulk create notifications
    const notificationsData = recipientIds.map((recipientId) => ({
      recipient: recipientId,
      sender: senderId,
      type,
      message,
      relatedId,
      relatedModel,
      link,
      details,
    }));

    const notifications = await Notification.insertMany(notificationsData);

    console.log(`Sending project notification '${type}' to ${recipientIds.length} members`);
    
    // Emit individually to each user so they get their unique notification _id
    notifications.forEach(notif => {
      const notifObj = notif.toObject();
      // Attach populated sender info
      notifObj.sender = sender || { _id: senderId, name: "Someone" };
      
      emitToUser(notif.recipient.toString(), "new_notification", notifObj);

      // Send Email asynchronously
      const recipientUser = usersMap[notif.recipient.toString()];
      if (recipientUser) {
        sendNotificationEmail(recipientUser, notifObj);
      }
    });

    return notifications;
  } catch (error) {
    console.error("Error creating project notification:", error);
  }
};
