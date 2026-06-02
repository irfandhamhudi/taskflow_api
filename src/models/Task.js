import mongoose from "mongoose";

// Subtask Schema
const subtaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Subtask title is required"],
      trim: true,
      minlength: [1, "Subtask title must be at least 1 character"],
      maxlength: [200, "Subtask title cannot exceed 200 characters"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// Attachment Schema
const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedAt: { type: Date, default: Date.now },
    thumbnailUrl: String,
  },
  { _id: true }
);

// History Schema
const historySchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// === COMMENT SCHEMA ===
const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comment: {
      type: String,
      required: [true, "Comment content is required"],
      trim: true,
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    text: { type: String }, // Temporarily keep to migrate old data
    attachments: [String],
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

    // === TAMBAHKAN REACTIONS DI SINI (sebelum recursive replies) ===
    reactions: [
      {
        emoji: { type: String, required: true },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        // optional: createdAt untuk reaction
        // createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    _id: true,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

// === MIGRATION HOOK: Handle old 'text' field ===
commentSchema.pre("validate", function () {
  if (this.text && !this.comment) {
    this.comment = this.text;
  }
});

// === SETELAH SCHEMA DIBUAT, TAMBAHKAN REPLIES SECARA RECURSIVE ===
// Ini akan membuat replies juga memiliki semua field termasuk reactions
commentSchema.add({
  replies: {
    type: [commentSchema],
    default: [],
  },
});

// Task Schema
const taskSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      minlength: [2, "Task title must be at least 2 characters"],
      maxlength: [200, "Task title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
      default: "",
    },

    status: {
      type: String,
      enum: ["todo", "inprogress", "done", "review"],
      default: "todo",
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    startDate: Date,
    dueDate: Date,
    completedAt: Date,
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subtasks: [subtaskSchema],
    attachments: [attachmentSchema],
    comments: [commentSchema], // Fully nested & recursive dengan reactions
    history: [historySchema],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    isArchived: { type: Boolean, default: false },
    archivedAt: Date,
    order: { type: Number, default: 0 },
    reminders: [
      {
        time: { type: Date, required: true },
        notified: { type: Boolean, default: false },
        type: { type: String, enum: ['system', 'email'], default: 'system' }
      }
    ],
    lastReminderSent: Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ projectId: 1, priority: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ projectId: 1, isArchived: 1 });
taskSchema.index({ projectId: 1, isDeleted: 1 });
taskSchema.index({ projectId: 1, order: 1 });

// Pre-save middleware
taskSchema.pre("save", async function () {
  this.updatedAt = new Date();

  if (this.isModified("status")) {
    if (this.status === "done" && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status !== "done" && this.completedAt) {
      this.completedAt = undefined;
    }
  }
});

// Instance methods
taskSchema.methods.isAssignedTo = function (userId) {
  return this.assignedTo.some((id) => id.toString() === userId.toString());
};

taskSchema.methods.addSubtask = function (title) {
  this.subtasks.push({ title });
  return this;
};

taskSchema.methods.toggleSubtask = function (subtaskId, userId) {
  const subtask = this.subtasks.id(subtaskId);
  if (subtask) {
    subtask.completed = !subtask.completed;
    subtask.updatedAt = new Date();
    if (subtask.completed) {
      subtask.completedAt = new Date();
      subtask.completedBy = userId;
    } else {
      subtask.completedAt = undefined;
      subtask.completedBy = undefined;
    }
  }
  return this;
};

taskSchema.methods.addComment = function (
  userId,
  comment,
  parentCommentId = null
) {
  const newComment = {
    user: userId,
    comment: comment.trim(),
    createdAt: new Date(),
    updatedAt: new Date(),
    replies: [],
    reactions: [], // pastikan reactions juga diinisialisasi
  };

  if (parentCommentId) {
    const findAndAddReply = (comments) => {
      for (const comment of comments) {
        if (
          comment._id &&
          comment._id.toString() === parentCommentId.toString()
        ) {
          comment.replies.push(newComment);
          comment.updatedAt = new Date();
          return true;
        }
        if (comment.replies && comment.replies.length > 0) {
          if (findAndAddReply(comment.replies)) return true;
        }
      }
      return false;
    };

    const found = findAndAddReply(this.comments);
    if (!found) {
      throw new Error("Parent comment not found");
    }
  } else {
    this.comments.push(newComment);
  }

  return this;
};

taskSchema.methods.addHistory = function (field, oldValue, newValue, userId) {
  this.history.push({
    field,
    oldValue,
    newValue,
    changedBy: userId,
    changedAt: new Date(),
  });
  return this;
};

taskSchema.methods.calculateProgress = function () {
  if (this.subtasks.length === 0) return 0;
  const completed = this.subtasks.filter((s) => s.completed).length;
  return Math.round((completed / this.subtasks.length) * 100);
};

taskSchema.methods.isOverdue = function () {
  if (!this.dueDate || this.status === "done") return false;
  return new Date(this.dueDate) < new Date();
};

const Task = mongoose.model("Task", taskSchema);

export default Task;
