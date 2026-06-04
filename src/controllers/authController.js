import User from "../models/User.js";
import Workspace from "../models/Workspace.js";
import { generateToken, clearToken } from "../utils/generateToken.js";
import {
  sendOTPEmail,
  sendPasswordResetEmail,
} from "../service/emailService.js";
import crypto from "crypto";
import { emitSocketEvent } from "../utils/socketHandler.js";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to ensure user has a default workspace
const ensureDefaultWorkspace = async (userId, userName) => {
  const existingDefault = await Workspace.findOne({ owner: userId, isDefault: true });
  if (!existingDefault) {
    const defaultWorkspace = new Workspace({
      name: "My Workspace",
      owner: userId,
      isDefault: true,
      icon: "🏠",
    });
    await defaultWorkspace.save();
    return defaultWorkspace;
  }
  return existingDefault;
};


// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Create user
    const user = new User({
      name,
      email,
      password,
    });

    // Generate OTP
    const otp = user.generateOTP();
    await user.save();

    // Send OTP email
    await sendOTPEmail(email, name, otp);

    // Don't send password in response
    user.password = undefined;

    res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your email.",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: "Email and 6-digit OTP are required",
        errorCode: "INVALID_INPUT",
      });
    }

    const user = await User.findOne({ email }).select("+otp +otpExpires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
        // errorCode: "INVALID_OTP",
      });
    }

    // Case 1: OTP sudah kadaluarsa
    if (user.otpExpires && user.otpExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
        // errorCode: "OTP_EXPIRED",
      });
    }

    // Case 2: OTP salah (masih ada tapi tidak cocok)
    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Verified OTP does not match.",
        // errorCode: "INVALID_OTP",
      });
    }

    // Success path
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = generateToken(res, user._id);

    res.json({
      success: true,
      message: "Email verified successfully",
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: true,
        profilePicture: user.profilePicture || null,
        theme: user.theme,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong on our server",
      // errorCode: "SERVER_ERROR",
    });
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    // Security: jangan kasih tahu apakah email terdaftar atau tidak
    if (!user) {
      return res.json({
        success: true,
        message:
          "If your email is registered and not verified, a new OTP has been sent.",
      });
    }

    // Jika sudah verified, tidak perlu kirim OTP lagi
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account is already verified",
      });
    }

    // Generate OTP baru (overwrite yang lama)
    const newOtp = user.generateOTP();
    await user.save();

    // Kirim email OTP baru
    await sendOTPEmail(email, user.name, newOtp);

    res.json({
      success: true,
      message: "New OTP has been sent to your email",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email with password
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate token and set cookie
    const token = generateToken(res, user._id);

    // Update session → PERBAIKAN DI SINI
    user.addSession(
      token,
      req.headers["x-forwarded-for"] || req.ip || req.connection.remoteAddress,
      req.get("User-Agent"),
    );
    await user.save();

    // Remove sensitive data
    user.password = undefined;
    user.sessions = undefined;

    res.json({
      success: true,
      message: "Login successful",
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        theme: user.theme,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isActive: true });

    if (!user) {
      // Return success even if user not found (security best practice)
      return res.json({
        success: true,
        message:
          "If your email is registered, you will receive a password reset link",
      });
    }

    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send reset email
    await sendPasswordResetEmail(email, user.name, resetUrl);

    res.json({
      success: true,
      message: "Password reset email sent",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // Invalidate all sessions
    user.sessions = [];

    await user.save();

    res.json({
      success: true,
      message:
        "Password reset successful. Please login with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -sessions -__v",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/update-profile
// @access  Private
export const updateProfile = async (req, res) => {
  try {
    const { name, profilePicture, theme, notificationPreferences } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (name) updateData.name = name;
    if (profilePicture) updateData.profilePicture = profilePicture;
    if (theme) updateData.theme = theme;

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -sessions -__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    // Get user with password
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check current password
    const isPasswordMatch = await user.comparePassword(currentPassword);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Invalidate all sessions except current
    const currentToken = req.cookies.token;
    user.sessions = user.sessions.filter(
      (session) => session.token === currentToken,
    );
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      // Remove current session
      const token = req.cookies.token;
      if (token) {
        user.removeSession(token);
        await user.save();
      }
    }

    // Clear cookie
    clearToken(res);

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get user sessions
// @route   GET /api/auth/sessions
// @access  Private
export const getSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("sessions");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user.sessions,
    });
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Revoke session
// @route   DELETE /api/auth/sessions/:sessionToken
// @access  Private
export const revokeSession = async (req, res) => {
  try {
    const { sessionToken } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Cannot revoke current session from this endpoint
    const currentToken = req.cookies.token;
    if (sessionToken === currentToken) {
      return res.status(400).json({
        success: false,
        message: "Cannot revoke current session. Please use logout endpoint.",
      });
    }

    // Remove the session
    user.removeSession(sessionToken);
    await user.save();

    res.json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    console.error("Revoke session error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Delete user account (soft delete)
// @route   DELETE /api/auth/delete-account
// @access  Private
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Soft delete the user
    user.softDelete();
    await user.save();

    // Clear authentication token
    clearToken(res);

    // Emit global socket event for real-time update
    emitSocketEvent("global", "user_deleted", {
      userId: userId,
      message: `User ${user.name} has been deleted.`,
    });

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
// @desc    Search user by email or name (for invitation hints)
// @route   GET /api/auth/search-user
// @access  Private
export const searchUserByEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email query is required",
      });
    }

    // Ambil bagian depan sebelum @ jika ada (example@gmail.com -> example)
    const searchTerm = email.split("@")[0];

    // Find users by partial match on name or email
    const users = await User.find({ 
      $or: [
        { name: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } }
      ],
      isActive: true 
    })
    .limit(5)
    .select("name email profilePicture");

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Search user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Google Login
// @route   POST /api/auth/google-login
// @access  Public
export const googleLogin = async (req, res) => {
  try {
    const { credential, access_token } = req.body;
    let googleId, email, name, profilePicture;
    
    if (credential) {
      // Verify Google Token (ID Token flow)
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      profilePicture = payload.picture;
    } else if (access_token) {
      // Fetch user profile (Access Token flow)
      const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const payload = response.data;
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      profilePicture = payload.picture;
    } else {
      return res.status(400).json({ success: false, message: "No Google token provided" });
    }
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.isVerified = true;
        await user.save();
      }
    } else {
      user = new User({
        name,
        email,
        googleId,
        profilePicture,
        isVerified: true,
      });
      await user.save();
    }
    
    // Generate token and set session
    const token = generateToken(res, user._id);
    
    user.addSession(
      token,
      req.headers["x-forwarded-for"] || req.ip || req.connection.remoteAddress,
      req.get("User-Agent")
    );
    await user.save();
    
    res.json({
      success: true,
      message: "Google login successful",
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        theme: user.theme,
      },
    });
    
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};

// @desc    GitHub Login
// @route   POST /api/auth/github-login
// @access  Public
export const githubLogin = async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, message: "No code provided" });
    }
    
    // 1. Exchange code for access token
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      {
        headers: { Accept: "application/json" },
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    
    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Failed to get access token from GitHub" });
    }
    
    // 2. Fetch user profile
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const githubUser = userResponse.data;
    const githubId = githubUser.id.toString();
    const name = githubUser.name || githubUser.login;
    const profilePicture = githubUser.avatar_url;
    let email = githubUser.email;
    
    // 3. Fetch emails if email is private
    if (!email) {
      const emailResponse = await axios.get("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const primaryEmail = emailResponse.data.find(e => e.primary && e.verified);
      email = primaryEmail ? primaryEmail.email : emailResponse.data[0].email;
    }
    
    if (!email) {
      return res.status(400).json({ success: false, message: "No explicit email attached to this GitHub account." });
    }
    
    // 4. Find or create user
    let user = await User.findOne({ email });
    
    if (user) {
      if (!user.githubId) {
        user.githubId = githubId;
        user.isVerified = true;
        await user.save();
      }
    } else {
      user = new User({
        name,
        email,
        githubId,
        profilePicture,
        isVerified: true,
      });
      await user.save();
    }
    
    // 5. Generate token and session
    const token = generateToken(res, user._id);
    
    user.addSession(
      token,
      req.headers["x-forwarded-for"] || req.ip || req.connection.remoteAddress,
      req.get("User-Agent")
    );
    await user.save();
    
    res.json({
      success: true,
      message: "GitHub login successful",
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        theme: user.theme,
      },
    });
    
  } catch (error) {
    console.error("GitHub login error:", error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "GitHub authentication failed",
      error: error?.response?.data || error.message,
    });
  }
};
