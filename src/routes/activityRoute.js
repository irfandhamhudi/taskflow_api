import express from "express";
import {
  getProjectActivityLogs,
  getMyRecentActivity,
  getGlobalActivity,
} from "../controllers/activityLog.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/project/:projectId", getProjectActivityLogs);
router.get("/me", getMyRecentActivity);
router.get("/global", getGlobalActivity); // optional: tambahkan admin middleware jika perlu

export default router;
