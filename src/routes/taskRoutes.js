import express from "express";
import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  addSubtask,
  toggleSubtask,
  archiveTask,
  deleteSubtask,
  getTaskStats,
  getTaskActivity,
  addReminder,
  removeReminder,
} from "../controllers/taskController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validations.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Task CRUD
router.post("/", validate("createTask"), createTask);
router.get("/", getTasks);
router.get("/stats", getTaskStats);
router.get("/:id", validate("getTask"), getTask);
router.put("/:id", validate("updateTask"), updateTask);
router.delete("/:id", validate("deleteTask"), deleteTask);

// Task status update (for drag & drop)
router.patch(
  "/:id/status",
  validate("updateTaskStatus"),

  updateTaskStatus
);
// Task archive/unarchive
router.patch("/:id/archive", validate("archiveTask"), archiveTask);

// Activity logs for a task
router.get("/:id/activity", getTaskActivity);

// Subtasks
router.post("/:id/subtasks", validate("addSubtask"), addSubtask);
router.patch(
  "/:taskId/subtasks/:subtaskId/toggle",
  validate("toggleSubtask"),

  toggleSubtask
);
router.delete(
  "/:taskId/subtasks/:subtaskId",
  validate("deleteSubtask"),

  deleteSubtask
);

// Reminders
router.post("/:id/reminders", addReminder);
router.delete("/:id/reminders/:reminderId", removeReminder);

export default router;
