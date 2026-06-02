import express from "express";
import { 
  initiateAuth, 
  handleCallback, 
  createMeeting, 
  getMeetings,
  deleteMeeting,
  disconnectPlatform
} from "../controllers/meetingController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// OAuth routes (initiateAuth is protected because it needs userId, handleCallback is public)
router.get("/auth/:platform", protect, initiateAuth);
router.get("/callback/:platform", handleCallback);

// Meeting CRUD routes
router.get("/", protect, getMeetings);
router.post("/", protect, createMeeting);
router.delete("/:id", protect, deleteMeeting);
router.delete("/disconnect/:platform", protect, disconnectPlatform);

export default router;
