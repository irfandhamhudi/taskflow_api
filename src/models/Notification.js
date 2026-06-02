import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "TASK_ASSIGNED",
        "TASK_UPDATED",
        "TASK_CREATED",
        "TASK_DELETED",
        "TASK_COMPLETED",
        "TASK_REMINDER",
        "COMMENT_ADDED",
        "MENTION",
        "PROJECT_INVITE",
        "PROJECT_JOINED",
        "PROJECT_CREATED",
        "PROJECT_UPDATED",
        "PROJECT_DELETED",
        "SHARE_LINK_COPIED",
        "ATTACHMENT_UPLOADED",
        "MEETING_SCHEDULED",
        "MEETING_DELETED",
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Could be Task ID, Project ID, etc.
      refPath: 'relatedModel'
    },
    relatedModel: {
      type: String,
      required: false,
      enum: ['Task', 'Project', 'Comment', 'File', 'Meeting']
    },
    link: {
      type: String, // Frontend route path, e.g., /app/projects/123/tasks/456
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-delete notifications older than 30 days to save space
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
