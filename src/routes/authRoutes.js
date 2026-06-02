import express from "express";
import {
  register,
  verifyOTP,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  changePassword,
  logout,
  getSessions,
  revokeSession,
  resendOTP,
  deleteAccount,
  searchUserByEmail,
  googleLogin,
  githubLogin,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validations.js";

const router = express.Router();

// Public routes
router.post("/register", validate("register"), register);
router.post("/verify-otp", validate("verifyOTP"), verifyOTP);
router.post("/login", validate("login"), login);
router.post("/forgot-password", validate("forgotPassword"), forgotPassword);
router.post("/reset-password/:token", validate("resetPassword"), resetPassword);
router.post("/resend-otp", validate("resendOTP"), resendOTP);
router.post("/google-login", googleLogin);
router.post("/github-login", githubLogin);

// Protected routes
router.get("/me", protect, getMe);
router.put(
  "/update-profile",
  protect,
  validate("updateProfile"),
  updateProfile
);
router.put(
  "/change-password",
  protect,
  validate("changePassword"),
  changePassword
);
router.post("/logout", protect, logout);
router.get("/sessions", protect, getSessions);
router.delete("/sessions/:sessionToken", protect, revokeSession);
router.delete("/delete-account", protect, deleteAccount);
router.get("/search-user", protect, searchUserByEmail);

export default router;
