import mongoose from "mongoose";

const workspaceMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Workspace name is required"],
      trim: true,
      maxlength: [100, "Workspace name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [workspaceMemberSchema],
    icon: {
      type: String,
      default: "🏢",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    type: {
      type: String,
      enum: ["personal", "team", "project", "client", "enterprise"],
      default: "personal",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ "members.user": 1 });
workspaceSchema.index({ slug: 1 });
workspaceSchema.index({ isDefault: 1 });

workspaceSchema.pre("save", async function () {
  if (this.isNew) {
    const ownerId = this.owner.toString();
    const isOwnerMember = this.members.some(
      (member) => member.user.toString() === ownerId
    );

    if (!isOwnerMember) {
      this.members.push({
        user: this.owner,
        role: "admin",
        joinedAt: new Date(),
      });
    }
  }
});

// Instance methods
workspaceSchema.methods.isUserMember = function (userId) {
  if (!userId) return false;
  const userIdStr = userId.toString();
  return (
    this.owner.toString() === userIdStr ||
    this.members.some((m) => m.user && m.user.toString() === userIdStr)
  );
};

workspaceSchema.methods.addMember = function (userId, role = "member") {
  if (!this.isUserMember(userId)) {
    this.members.push({
      user: userId,
      role,
      joinedAt: new Date(),
    });
  }
  return this;
};

const Workspace = mongoose.model("Workspace", workspaceSchema);

export default Workspace;
