// routes/comment.js
import express from "express";
import { protect } from "../middleware/auth.js"; // sesuaikan path jika berbeda
import {
  addComment,
  addReaction,
  editComment,
  deleteComment,
  getComments,
} from "../controllers/commentController.js";
const router = express.Router();

// Semua route di bawah ini memerlukan taskId sebagai parameter
// Contoh URL: /api/tasks/123abc/comments

// GET semua comments pada task
router.get("/:taskId/comments", protect, getComments);

// POST   /api/tasks/:taskId/comments              → Tambah comment utama atau reply
router.post("/:taskId/comments", protect, addComment);

// POST   /api/tasks/:taskId/comments/:commentId/reactions   → Tambah/toggle reaction (like emoji)
router.post("/:taskId/comments/:commentId/reactions", protect, addReaction);

// PUT    /api/tasks/:taskId/comments/:commentId   → Edit comment/reply
router.put("/:taskId/comments/:commentId", protect, editComment);

// DELETE /api/tasks/:taskId/comments/:commentId   → Hapus comment/reply
router.delete("/:taskId/comments/:commentId", protect, deleteComment);

export default router;
