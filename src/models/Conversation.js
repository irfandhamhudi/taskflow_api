import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    isGroup: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      trim: true,
      // Optional: Only used if isGroup is true and users want a custom name
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      // Optional: To link a chat specifically to a project
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    acceptedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    rejectedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    deletedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

// Indexes for faster querying
conversationSchema.index({ participants: 1 });
conversationSchema.index({ projectId: 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
