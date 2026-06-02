import mongoose from "mongoose";
import crypto from "crypto";

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["viewer", "editor", "admin"],
      default: "editor",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const inviteTokenSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
    },
    expires: {
      type: Date,
      required: true,
    },
    role: {
      type: String,
      enum: ["viewer", "editor", "admin"],
      default: "editor",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    allowGuestComments: {
      type: Boolean,
      default: false,
    },
    taskCompletionRequiresApproval: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const roleRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedRole: {
      type: String,
      enum: ["editor", "admin"],
      required: true,
    },
    message: {
      type: String,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      minlength: [2, "Project name must be at least 2 characters"],
      maxlength: [100, "Project name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },
    visibility: {
      type: String,
      enum: ["private", "limited", "public"],
      default: "private",
    },
    shareRole: {
      type: String,
      enum: ["viewer", "editor", "admin"],
      default: "viewer", // role default untuk yang join via share link
    },
    shareLinkToken: {
      type: String,
      unique: true,
      sparse: true,
      default: () => crypto.randomBytes(32).toString("hex"), // ← OTOMATIS dibuat setiap project baru
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    icon: {
      type: String,
      default: "📁", // default emoji (folder) – cocok untuk project
      trim: true,
      maxlength: [10, "Icon emoji too long"], // emoji biasanya 1-4 karakter Unicode
    },
    members: [memberSchema],
    inviteTokens: [inviteTokenSchema],
    settings: {
      type: settingsSchema,
      default: () => ({}),
    },
    roleRequests: [roleRequestSchema],
    isArchived: {
      type: Boolean,
      default: false,
    },
    enableShareLink: {
      type: Boolean,
      default: false, // default mati dulu
    },
    archivedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
projectSchema.index({ owner: 1 });
projectSchema.index({ "members.user": 1 });
projectSchema.index({ isArchived: 1 });
projectSchema.index({ isDeleted: 1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ shareLinkToken: 1 });
projectSchema.index({ icon: 1 });

// Pre-save — hanya update timestamp & owner jadi admin
projectSchema.pre("save", function () {
  this.updatedAt = new Date();

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

// Pre-remove
projectSchema.pre("remove", async function () {
  const Task = mongoose.model("Task");
  await Task.deleteMany({ projectId: this._id });
});

// Instance methods (tetap sama)
projectSchema.methods.isMember = function (userId) {
  return (
    this.members.some(
      (member) => member.user.toString() === userId.toString()
    ) || this.owner.toString() === userId.toString()
  );
};

projectSchema.methods.getUserRole = function (userId) {
  userId = userId.toString();

  // Owner selalu owner
  if (this.owner.toString() === userId) {
    return "owner";
  }

  // Cari member — gunakan comparison yang aman
  const member = this.members.find((m) => {
    if (!m.user) return false;
    return m.user.toString() === userId;
  });

  return member ? member.role : null;
};

projectSchema.methods.hasPermission = function (userId, requiredRole) {
  const userRole = this.getUserRole(userId);
  if (!userRole) return false;
  if (userRole === "owner") return true;

  const roleHierarchy = { viewer: 1, editor: 2, admin: 3 };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

projectSchema.methods.addMember = function (userId, role = "viewer") {
  if (!this.members.some((m) => m.user.toString() === userId.toString())) {
    this.members.push({
      user: userId,
      role,
      joinedAt: new Date(),
    });
  }
  return this;
};

projectSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter(
    (m) => m.user.toString() !== userId.toString()
  );
  return this;
};

projectSchema.methods.updateMemberRole = function (userId, newRole) {
  const member = this.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (member) {
    const oldRole = member.role;
    member.role = newRole;
    return oldRole;
  }
  return null;
};

projectSchema.methods.generateInviteToken = function (
  email,
  role = "editor",
  expiresInHours = 72
) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  this.inviteTokens = this.inviteTokens.filter((t) => t.email !== email);

  this.inviteTokens.push({
    email,
    token,
    expires,
    role,
    createdAt: new Date(),
  });

  return { token, expires };
};

projectSchema.methods.validateInviteToken = function (token, email) {
  const invite = this.inviteTokens.find(
    (t) => t.token === token && t.email === email && t.expires > new Date()
  );
  return invite || null;
};

projectSchema.methods.removeInviteToken = function (token) {
  this.inviteTokens = this.inviteTokens.filter((t) => t.token !== token);
  return this;
};

// Method regenerate token (untuk kalau bocor)
projectSchema.methods.regenerateShareLink = function () {
  this.shareLinkToken = crypto.randomBytes(32).toString("hex");
  return this.shareLinkToken;
};

const Project = mongoose.model("Project", projectSchema);

export default Project;
