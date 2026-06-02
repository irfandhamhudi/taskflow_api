import express from "express";
import {
  createWorkspace,
  getWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace,
} from "../controllers/workspaceController.js";
import { protect } from "../middleware/auth.js";

import { validate } from "../middleware/validations.js";

const router = express.Router();

router.use(protect);

router.post("/", validate("createWorkspace"), createWorkspace);
router.get("/", getWorkspaces);
router.get("/:id", validate("getWorkspace"), getWorkspaceById);
router.put("/:id", validate("updateWorkspace"), updateWorkspace);
router.delete("/:id", validate("deleteWorkspace"), deleteWorkspace);

export default router;
