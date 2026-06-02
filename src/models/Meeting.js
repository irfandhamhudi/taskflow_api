import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Meeting title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: Date,
      required: [true, "End time is required"],
    },
    platform: {
      type: String,
      enum: ["zoom", "google_meet", "other"],
      required: true,
    },
    platformMeetingId: {
      type: String,
      required: true,
    },
    joinUrl: {
      type: String,
      required: true,
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    attendees: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        email: String,
        name: String,
      },
    ],
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed", "cancelled"],
      default: "scheduled",
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
  },
  { timestamps: true }
);

meetingSchema.index({ host: 1, startTime: 1 });
meetingSchema.index({ projectId: 1 });

const Meeting = mongoose.model("Meeting", meetingSchema);

export default Meeting;
