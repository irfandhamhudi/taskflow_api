import express from "express";
import {
  getConversations,
  getMessages,
  createOrGetConversation,
  sendMessage,
  acceptConversation,
  rejectConversation,
  editMessage,
  deleteMessageForMe,
  deleteMessageForEveryone,
  markAsRead,
  markAllAsRead,
  searchMessages,
  deleteConversation,
  blockUser,
  unblockUser,
  markAsDelivered,
  voteInPoll,
} from "../controllers/chatController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.route("/")
  .get(getConversations)
  .post(createOrGetConversation);

router.route("/:conversationId/messages")
  .get(getMessages)
  .post(sendMessage);

router.put("/messages/:messageId", editMessage);
router.post("/messages/:messageId/vote", voteInPoll);
router.delete("/messages/:messageId/me", deleteMessageForMe);
router.delete("/messages/:messageId/all", deleteMessageForEveryone);

router.post("/:conversationId/accept", acceptConversation);
router.post("/:conversationId/reject", rejectConversation);
router.post("/:conversationId/read", markAsRead);
router.post("/:conversationId/delivered", markAsDelivered);
router.post("/read-all", markAllAsRead);

router.get("/:conversationId/search", searchMessages);
router.delete("/:conversationId", deleteConversation);
router.post("/users/:userId/block", blockUser);
router.post("/users/:userId/unblock", unblockUser);

export default router;
