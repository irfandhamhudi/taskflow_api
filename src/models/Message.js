import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      trim: true,
    },
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
      },
    ],
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deliveredTo: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        deliveredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isSystemMessage: {
      type: Boolean,
      default: false,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeletedForAll: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    type: {
      type: String,
      enum: ["text", "poll", "system"],
      default: "text",
    },
    poll: {
      question: { type: String, trim: true },
      options: [
        {
          text: { type: String, trim: true },
          votes: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
          ],
        },
      ],
      isClosed: { type: Boolean, default: false },
      expiresAt: Date,
    },
  },
  { timestamps: true }
);

// Pre-save to ensure either text, attachments, or poll exists (unless it's a system message)
messageSchema.pre("save", async function () {
  const hasText = this.text && this.text.trim() !== "";
  const hasAttachments = this.attachments && this.attachments.length > 0;
  const hasPoll = this.type === "poll" && this.poll && this.poll.question;

  if (!this.isSystemMessage && !hasText && !hasAttachments && !hasPoll) {
    throw new Error("Message must contain text, attachments, or a poll");
  }
});

messageSchema.index({ conversationId: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
