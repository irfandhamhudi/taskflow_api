// src/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const sessionSchema = new mongoose.Schema(
  {
    token: String,
    ip: String,
    userAgent: String,
    lastActive: Date,
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: false, // Optional for OAuth users
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null/undefined values
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    profilePicture: {
      type: String,
      default: "",
    },
    otp: {
      type: String,
      select: false, // OTP tidak di-select secara default
    },
    otpExpires: {
      type: Date,
      select: false, // OTP expiry tidak di-select secara default
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    // theme: {
    //   type: String,
    //   enum: ["light", "dark", "system"],
    //   default: "light",
    // },
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    phone: {
      type: String,
      trim: true,
      match: [
        /^(?:\+?62|0)[1-9]\d{8,12}$/,
        "Please enter a valid phone number",
      ],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, "Address cannot exceed 200 characters"],
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, "Bio tidak boleh lebih dari 500 karakter"],
    },

    jobTitle: {
      type: String,
      trim: true,
      maxlength: [100, "Jabatan tidak boleh lebih dari 100 karakter"],
    },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function (value) {
          return value < new Date(); // Tidak boleh di masa depan
        },
        message: "Date of birth cannot be in the future",
      },
    },
    sessions: [sessionSchema],
    lastActive: Date,
    settings: {
      emailNotifications: { type: Boolean, default: true },
      desktopNotifications: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: true },
      timezone: { type: String, default: "UTC" },
      dateFormat: { type: String, default: "MM/DD/YYYY" },
      timeFormat: { type: String, default: "12h" },
      notificationTypes: {
        task: { type: Boolean, default: true },
        comment: { type: Boolean, default: true },
        project: { type: Boolean, default: true },
        meeting: { type: Boolean, default: true },
        system: { type: Boolean, default: true },
        email: { type: Boolean, default: true }, // General master switch for email if needed
      },
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedAt: Date,
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    externalAccounts: {
      google: {
        accessToken: String,
        refreshToken: String,
        expiryDate: Date,
        email: String,
      },
      zoom: {
        accessToken: String,
        refreshToken: String,
        expiryDate: Date,
        zoomId: String,
      },
    },
    favoriteProjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.otp;
        delete ret.otpExpires;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.sessions;
        return ret;
      },
    },
  },
);

// Indexes
// userSchema.index({ email: 1 }, { unique: true }); // Hapus 'unique: true' dari schema di atas
userSchema.index({ isVerified: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Hash password before saving - VERSION FIXED
userSchema.pre("save", async function () {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return;

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Update lastActive timestamp before save
userSchema.pre("save", function () {
  if (this.isModified("lastActive") || this.isNew) {
    this.lastActive = new Date();
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP method
userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  // Ubah dari 10 menit jadi 60 menit (1 jam)
  this.otpExpires = Date.now() + 60 * 60 * 1000; // 60 menit dari sekarang

  // Atau kalau mau 30 menit: Date.now() + 30 * 60 * 1000

  console.log(
    `Generated OTP for ${this.email}: ${otp}, expires: ${new Date(
      this.otpExpires,
    ).toISOString()} (in ${(this.otpExpires - Date.now()) / 60000} minutes)`,
  );
  return otp;
};

userSchema.methods.isValidOTP = function (enteredOtp) {
  if (!this.otp || !this.otpExpires) {
    return false;
  }

  if (this.otpExpires < Date.now()) {
    return false; // expired
  }

  return this.otp === enteredOtp;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  return resetToken;
};

// Clear reset token
userSchema.methods.clearResetToken = function () {
  this.resetPasswordToken = undefined;
  this.resetPasswordExpires = undefined;
  return this;
};

// Add session
userSchema.methods.addSession = function (token, ip, userAgent) {
  this.sessions.push({
    token,
    ip,
    userAgent,
    lastActive: new Date(),
  });

  // Keep only last 10 sessions
  if (this.sessions.length > 10) {
    this.sessions = this.sessions.slice(-10);
  }

  return this;
};

// Remove session
userSchema.methods.removeSession = function (token) {
  this.sessions = this.sessions.filter((session) => session.token !== token);
  return this;
};

// Check if session exists
userSchema.methods.hasSession = function (token) {
  return this.sessions.some((session) => session.token === token);
};

// Soft delete
userSchema.methods.softDelete = function () {
  this.isActive = false;
  this.deletedAt = new Date();
  this.email = `${this.email}.deleted.${Date.now()}`;
  return this;
};

const User = mongoose.model("User", userSchema);

export default User;
