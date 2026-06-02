import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  markNotificationsAsRead,
  deleteNotification,
  deleteNotifications,
  deleteAllNotifications,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(protect);

router.get("/", getUserNotifications);
router.put("/mark-all-read", markAllAsRead);
router.put("/:id/read", markAsRead);
router.post("/read-many", markNotificationsAsRead);
router.post("/delete-many", deleteNotifications); // Use POST since we send body
router.delete("/delete-all", deleteAllNotifications);
router.delete("/:id", deleteNotification);

export default router;
