import express from "express";
import {
  getDashboardOverview,
  getActivityFeed,
} from "../controllers/dashboardController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Dashboard data
router.get("/", getDashboardOverview);
router.get("/activity", getActivityFeed);

export default router;
