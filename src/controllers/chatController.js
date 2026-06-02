import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { emitToUser, emitSocketEvent } from "../utils/socketHandler.js";

// Helper to strip privacy info for rejected or blocked conversations
const stripPrivacyInfo = (convObj, userId) => {
  const userIdStr = userId.toString();
  
  if (convObj.participants) {
    convObj.participants = convObj.participants.map(p => {
      // If p is not populated, we can't check
      if (!p._id) return p;
      
      const participantId = p._id.toString();
      
      // 1. Check Rejection
      const hasRejected = convObj.rejectedBy && convObj.rejectedBy.some(rId => rId.toString() === participantId);
      
      // 2. Check if this participant has blocked the current user
      const hasBlockedMe = p.blockedUsers && p.blockedUsers.some(bId => bId.toString() === userIdStr);

      // If they rejected/blocked and it's not the current user themselves
      if ((hasRejected || hasBlockedMe) && participantId !== userIdStr) {
        return {
          ...p,
          profilePicture: null,
          isOnline: false,
          lastSeen: null
        };
      }
      return p;
    });
  }
  return convObj;
};

// Get all conversations for a user
export const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({ 
      participants: userId,
      rejectedBy: { $ne: userId },
      deletedBy: { $ne: userId }
    })
      .populate("participants", "name email profilePicture isOnline lastSeen blockedUsers")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "name profilePicture" },
      })
      .sort({ updatedAt: -1 });

    // Calculate unread count for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        let convObj = conv.toObject();
        
        // Hide info of users who rejected the chat
        convObj = stripPrivacyInfo(convObj, userId);

        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          sender: { $ne: userId },
          "readBy.user": { $ne: userId },
          deletedFor: { $ne: userId }
        });

        // Hide lastMessage if it was deleted for this user (e.g. sent while blocked)
        if (convObj.lastMessage && convObj.lastMessage.deletedFor && 
            convObj.lastMessage.deletedFor.some(dId => dId.toString() === userId.toString())) {
          convObj.lastMessage = null;
        }

        return { ...convObj, unreadCount };
      })
    );

    res.json(conversationsWithUnread);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Server error fetching conversations" });
  }
};

// Get messages for a conversation
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Check if user is part of the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(403).json({ message: "Access denied or conversation not found" });
    }

    const messages = await Message.find({ 
      conversationId,
      deletedFor: { $ne: userId }
    })
      .populate("sender", "name email profilePicture blockedUsers")
      .populate("poll.options.votes", "name profilePicture")
      .sort({ createdAt: 1 });

    // Mark messages as delivered for this user (messages they didn't send)
    await Message.updateMany(
      { 
        conversationId, 
        sender: { $ne: userId },
        "deliveredTo.user": { $ne: userId },
        deletedFor: { $ne: userId }
      },
      { $addToSet: { deliveredTo: { user: userId, deliveredAt: new Date() } } }
    );

    // Notify sender(s) that messages were delivered
    const undeliveredMessages = messages.filter(m => 
      m.sender._id.toString() !== userId.toString() && 
      !m.deliveredTo.some(d => d.user.toString() === userId.toString())
    );
    
    if (undeliveredMessages.length > 0) {
      conversation.participants.forEach(pId => {
        if (pId.toString() !== userId.toString()) {
          emitToUser(pId.toString(), "messages_delivered", { 
            conversationId, 
            userId, 
            messageIds: undeliveredMessages.map(m => m._id) 
          });
        }
      });
    }

    // Hide profile info in messages if rejected or blocked
    const messagesWithPrivacy = messages.map(msg => {
      const msgObj = msg.toObject();
      if (!msgObj.sender) return msgObj;
      
      const senderId = msgObj.sender._id.toString();
      const userIdStr = userId.toString();
      
      const hasRejected = conversation.rejectedBy && conversation.rejectedBy.some(rId => rId.toString() === senderId);
      const hasBlockedMe = msgObj.sender.blockedUsers && msgObj.sender.blockedUsers.some(bId => bId.toString() === userIdStr);
      
      if ((hasRejected || hasBlockedMe) && senderId !== userIdStr) {
        msgObj.sender.profilePicture = null;
        // Other info is already limited by select
      }
      return msgObj;
    });

    res.json(messagesWithPrivacy);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Server error fetching messages" });
  }
};

// Create a new conversation or get existing direct conversation
export const createOrGetConversation = async (req, res) => {
  try {
    const { participantId } = req.body;
    const userId = req.user.id;

    // Check if a direct conversation already exists between these two users
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [userId, participantId], $size: 2 },
    })
      .populate("participants", "name email profilePicture")
      .populate("lastMessage");

    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        participants: [userId, participantId],
        isGroup: false,
        acceptedBy: [userId],
      });
      await conversation.save();
      conversation = await conversation.populate("participants", "name email profilePicture");
    }

    else {
      // Existing conversation - check if the current user had rejected it
      if (conversation.rejectedBy.includes(userId)) {
        // "Un-reject" and "Accept" if they are explicitly getting/creating it again
        conversation.rejectedBy = conversation.rejectedBy.filter(rId => rId.toString() !== userId.toString());
        if (!conversation.acceptedBy.includes(userId)) {
          conversation.acceptedBy.push(userId);
        }
        await conversation.save();
        
        // Notify others that this user is back/accepted
        conversation.participants.forEach((p) => {
          const pId = p._id ? p._id.toString() : p.toString();
          if (pId !== userId.toString()) {
            emitToUser(pId, "conversation_accepted", {
              conversationId: conversation._id,
              user: { _id: userId, name: req.user.name }
            });
          }
        });
      }

      let convObj = conversation.toObject();
      convObj = stripPrivacyInfo(convObj, userId);
      return res.json(convObj);
    }

    res.json(conversation);
  } catch (error) {
    console.error("Error creating/getting conversation:", error);
    res.status(500).json({ message: "Server error creating conversation" });
  }
};

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text, attachments, type, poll } = req.body;
    const senderId = req.user.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.some(p => p.toString() === senderId.toString())) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if any participant has blocked the sender or if sender has blocked any participant
    const sender = await User.findById(senderId);
    const otherParticipants = conversation.participants.filter(p => p.toString() !== senderId.toString());
    
    const participantsWhoBlocked = [];
    for (const pId of otherParticipants) {
      const pIdStr = pId.toString();
      const participant = await User.findById(pIdStr);
      
      // If the sender has blocked this participant, prevent sending
      if (sender && sender.blockedUsers.includes(pIdStr)) {
        return res.status(403).json({ message: "You have blocked this user. Unblock to send messages." });
      }

      // If the participant has blocked the sender, track it for "silent" delivery
      if (participant && participant.blockedUsers.includes(senderId)) {
        participantsWhoBlocked.push(pIdStr);
      }
    }

    const newMessage = new Message({
      conversationId,
      sender: senderId,
      text,
      attachments: attachments || [],
      type: type || "text",
      poll: poll || undefined,
      deletedFor: participantsWhoBlocked // Hidden from those who blocked the sender
    });

    await newMessage.save();
    
    // Populate sender info and poll votes before emitting
    await newMessage.populate([
      { path: "sender", select: "name email profilePicture" },
      { path: "poll.options.votes", select: "name profilePicture" }
    ]);

    // Update conversation lastMessage and updatedAt ONLY if at least one participant 
    // (other than sender) has NOT blocked the sender.
    // This prevents the conversation from jumping to the top for the blocker.
    if (participantsWhoBlocked.length < otherParticipants.length) {
      conversation.lastMessage = newMessage._id;
      conversation.updatedAt = new Date();
      await conversation.save();
    }

    // Emit real-time event ONLY to participants who didn't block the sender
    conversation.participants.forEach((participantId) => {
      const pIdStr = participantId.toString();
      if (!participantsWhoBlocked.includes(pIdStr)) {
        emitToUser(pIdStr, "receive_message", newMessage);
      }
    });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Server error sending message", error: error.message });
  }
};

// Accept a conversation request
export const acceptConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is a participant
    if (!conversation.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: "Not a participant in this conversation" });
    }

    // Add user to acceptedBy if not already there
    if (!conversation.acceptedBy.includes(userId)) {
      conversation.acceptedBy.push(userId);
      await conversation.save();
      await conversation.populate("participants", "name email profilePicture");
    }

    // Emit event to the other participant(s)
    conversation.participants.forEach((participantId) => {
      if (participantId.toString() !== userId.toString()) {
        emitToUser(participantId.toString(), "conversation_accepted", { 
          conversation: conversation, 
          user: { _id: req.user.id, name: req.user.name, profilePicture: req.user.profilePicture } 
        });
      }
    });

    res.json(conversation);
  } catch (error) {
    console.error("Error accepting conversation:", error);
    res.status(500).json({ message: "Server error accepting conversation" });
  }
};

// Reject a conversation request
export const rejectConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if user is a participant
    if (!conversation.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: "Not a participant in this conversation" });
    }

    // Add user to rejectedBy if not already there
    if (!conversation.rejectedBy.includes(userId)) {
      conversation.rejectedBy.push(userId);
      await conversation.save();
    }

    // Emit event to the other participant(s)
    conversation.participants.forEach((participantId) => {
      if (participantId.toString() !== userId.toString()) {
        emitToUser(participantId.toString(), "conversation_rejected", { 
          conversationId, 
          user: { _id: req.user.id, name: req.user.name } 
        });
      }
    });

    res.json({ success: true, message: "Conversation rejected" });
  } catch (error) {
    console.error("Error rejecting conversation:", error);
    res.status(500).json({ message: "Server error rejecting conversation" });
  }
};

// Edit a message
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message || message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized or message not found" });
    }

    if (message.isDeletedForAll) {
      return res.status(400).json({ message: "Cannot edit a deleted message" });
    }

    message.text = text;
    message.isEdited = true;
    await message.save();
    await message.populate("sender", "name email profilePicture");

    // Emit event
    const conversation = await Conversation.findById(message.conversationId);
    conversation.participants.forEach((participantId) => {
      emitToUser(participantId.toString(), "message_updated", message);
    });

    res.json(message);
  } catch (error) {
    console.error("Error editing message:", error);
    res.status(500).json({ message: "Server error editing message" });
  }
};

// Delete message for me
export const deleteMessageForMe = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    if (!message.deletedFor.includes(userId)) {
      message.deletedFor.push(userId);
      await message.save();
    }

    // Emit event to sync across tabs for the current user
    emitToUser(userId, "message_deleted", { 
      messageId: message._id, 
      conversationId: message.conversationId,
      isDeletedForMe: true 
    });

    res.json({ success: true, messageId });
  } catch (error) {
    console.error("Error deleting message for me:", error);
    res.status(500).json({ message: "Server error deleting message" });
  }
};

// Delete message for everyone
export const deleteMessageForEveryone = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message || message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized or message not found" });
    }

    message.isDeletedForAll = true;
    message.text = "This message was deleted";
    message.attachments = [];
    await message.save();
    await message.populate("sender", "name email profilePicture");

    // Emit event
    const conversation = await Conversation.findById(message.conversationId);
    conversation.participants.forEach((participantId) => {
      emitToUser(participantId.toString(), "message_deleted", { 
        messageId: message._id, 
        conversationId: message.conversationId,
        isDeletedForAll: true,
        message: message 
      });
    });

    res.json(message);
  } catch (error) {
    console.error("Error deleting message for everyone:", error);
    res.status(500).json({ message: "Server error deleting message" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    await Message.updateMany(
      { conversationId, sender: { $ne: userId }, "readBy.user": { $ne: userId }, deletedFor: { $ne: userId } },
      { 
        $addToSet: { 
          readBy: { user: userId, readAt: new Date() },
          deliveredTo: { user: userId, deliveredAt: new Date() } // Also ensure delivered
        } 
      }
    );

    // Emit event to sync unread status
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.participants.forEach((participantId) => {
        emitToUser(participantId.toString(), "mark_as_read", { conversationId, userId });
      });
    }

    res.json({ success: true, conversationId });
  } catch (error) {
    console.error("Error marking as read:", error);
    res.status(500).json({ message: "Server error marking as read" });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    // Mark all messages as read for this user across all conversations
    const conversations = await Conversation.find({ participants: userId });
    const conversationIds = conversations.map(c => c._id);

    const result = await Message.updateMany(
      { 
        conversationId: { $in: conversationIds }, 
        sender: { $ne: userId },
        "readBy.user": { $ne: userId },
        deletedFor: { $ne: userId }
      },
      { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all as read:", error);
    res.status(500).json({ message: "Server error marking all as read" });
  }
};

// Search messages in a conversation
export const searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { q } = req.query;
    const userId = req.user.id;

    if (!q) return res.json([]);

    const messages = await Message.find({
      conversationId,
      text: { $regex: q, $options: "i" },
      deletedFor: { $ne: userId },
      isDeletedForAll: false
    })
      .populate("sender", "name email profilePicture")
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (error) {
    console.error("Error searching messages:", error);
    res.status(500).json({ message: "Server error searching messages" });
  }
};

// Delete conversation for me
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    if (!conversation.deletedBy.includes(userId)) {
      conversation.deletedBy.push(userId);
      await conversation.save();
    }

    // Also mark all messages as deleted for me (optional but good practice)
    await Message.updateMany(
      { conversationId, deletedFor: { $ne: userId } },
      { $addToSet: { deletedFor: userId } }
    );

    res.json({ success: true, message: "Conversation deleted" });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ message: "Server error deleting conversation" });
  }
};

// Block a user
export const blockUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user.id;

    if (targetUserId === userId) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const user = await User.findById(userId);
    if (!user.blockedUsers.includes(targetUserId)) {
      user.blockedUsers.push(targetUserId);
      await user.save();
    }

    res.json({ success: true, message: "User blocked" });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "Server error blocking user" });
  }
};

// Unblock a user
export const unblockUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== targetUserId.toString());
    await user.save();

    // Find conversations between these two users
    const conversations = await Conversation.find({
      participants: { $all: [userId, targetUserId] },
      isGroup: false
    });

    for (const conv of conversations) {
      // Find the latest message that was hidden from the unblocker
      const latestHiddenMessage = await Message.findOne({
        conversationId: conv._id,
        sender: targetUserId,
        deletedFor: userId
      }).sort({ createdAt: -1 });

      // Remove userId from deletedFor of all messages (restore messages sent while blocked)
      await Message.updateMany(
        { conversationId: conv._id, deletedFor: userId },
        { 
          $pull: { deletedFor: userId },
          // Mark as delivered now that they are unblocked and can see them
          $addToSet: { deliveredTo: { user: userId, deliveredAt: new Date() } }
        }
      );

      // Notify the unblocker (User 2) of the "newly arrived" messages via socket
      // This will trigger the invitation toast/popup in the UI
      if (latestHiddenMessage) {
        await latestHiddenMessage.populate("sender", "name email profilePicture");
        emitToUser(userId, "receive_message", latestHiddenMessage);
      }

      // Emit event to both users to refresh UI (privacy info, messages)
      conv.participants.forEach(pId => {
        emitToUser(pId.toString(), "user_unblocked", { 
          unblockerId: userId, 
          unblockedId: targetUserId,
          conversationId: conv._id 
        });
      });
    }

    res.json({ success: true, message: "User unblocked" });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Server error unblocking user" });
  }
};

export const markAsDelivered = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    await Message.updateMany(
      { 
        conversationId, 
        sender: { $ne: userId }, 
        "deliveredTo.user": { $ne: userId },
        deletedFor: { $ne: userId }
      },
      { $addToSet: { deliveredTo: { user: userId, deliveredAt: new Date() } } }
    );

    // Emit event to sync
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.participants.forEach((pId) => {
        if (pId.toString() !== userId.toString()) {
          emitToUser(pId.toString(), "messages_delivered", { conversationId, userId });
        }
      });
    }

    res.json({ success: true, conversationId });
  } catch (error) {
    console.error("Error marking as delivered:", error);
    res.status(500).json({ message: "Server error marking as delivered" });
  }
};

// Vote in a poll
export const voteInPoll = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message || message.type !== "poll") {
      return res.status(404).json({ message: "Poll not found" });
    }

    if (message.poll.isClosed) {
      return res.status(400).json({ message: "Poll is closed" });
    }

    const option = message.poll.options[optionIndex];
    if (!option) {
      return res.status(404).json({ message: "Option not found" });
    }

    const voteIndex = option.votes.findIndex(vId => vId.toString() === userId.toString());

    if (voteIndex > -1) {
      // Remove vote (unvote)
      option.votes.splice(voteIndex, 1);
    } else {
      // Add vote
      option.votes.push(userId);
    }

    await message.save();
    await message.populate([
      { path: "sender", select: "name email profilePicture" },
      { path: "poll.options.votes", select: "name profilePicture" }
    ]);

    // Emit real-time event to all participants
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation) {
      conversation.participants.forEach((pId) => {
        emitToUser(pId.toString(), "poll_updated", message);
      });
    }

    res.json(message);
  } catch (error) {
    console.error("Error voting in poll:", error);
    res.status(500).json({ message: "Server error voting in poll" });
  }
};
