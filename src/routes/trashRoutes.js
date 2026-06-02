import express from "express";
import {
  getTrashItems,
  restoreTask,
  restoreProject,
  permanentlyDeleteTask,
  permanentlyDeleteProject,
  emptyTrash,
} from "../controllers/trashController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/", getTrashItems);
router.delete("/empty", emptyTrash);

router.patch("/tasks/:id/restore", restoreTask);
router.delete("/tasks/:id", permanentlyDeleteTask);

router.patch("/projects/:id/restore", restoreProject);
router.delete("/projects/:id", permanentlyDeleteProject);

export default router;
