// controllers/commentController.js

import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import ActivityLog from "../models/ActivityLog.js";
import { emitSocketEvent, emitToUser, emitToMultipleUsers } from "../utils/socketHandler.js";
import { createNotification, createProjectNotification } from "./notificationController.js";

// Helper: Cari comment berdasarkan ID (bisa nested di replies)
const findCommentById = (comments, commentId) => {
  for (const comment of comments) {
    if (comment._id.toString() === commentId.toString()) {
      return { comment, parentArray: comments };
    }
    if (comment.replies && comment.replies.length > 0) {
      const found = findCommentById(comment.replies, commentId);
      if (found) return found;
    }
  }
  return null;
};

// @desc    Get all comments for a task
// @route   GET /api/tasks/:taskId/comments
// @access  Private
export const getComments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(taskId)
      .populate("projectId", "name visibility members owner")
      .populate({
        path: "comments.user comments.replies.user",
        select: "name username profilePicture",
      })
      .populate({
        path: "comments.reactions.user comments.replies.reactions.user",
        select: "name profilePicture",
      });

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const project = task.projectId;
    if (!project.isMember(userId)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to view comments" });
    }

    if (
      project.visibility !== "public" &&
      !project.hasPermission(userId, "viewer")
    ) {
      return res
        .status(403)
        .json({ success: false, message: "You need at least viewer role" });
    }

    res.json({
      success: true,
      message: "Comments retrieved successfully",
      data: task.comments,
      total: task.comments.length,
    });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Add comment or reply to task
// @route   POST /api/tasks/:taskId/comments
// @access  Private
export const addComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user._id;
    const { comment, parentCommentId } = req.body;

    if (!comment || comment.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Comment text is required",
      });
    }

    const task = await Task.findById(taskId)
      .populate("projectId", "name visibility members owner")
      .populate("assignedTo", "name _id profilePicture")
      .populate("createdBy", "_id");

    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const project = task.projectId;

    // Authorization check
    if (!project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to comment on this task",
      });
    }

    if (
      project.visibility !== "public" &&
      !project.hasPermission(userId, "viewer")
    ) {
      return res.status(403).json({
        success: false,
        message: "You need at least viewer role to comment",
      });
    }

    // === Validasi depth reply (maksimal 1 level) ===
    if (parentCommentId) {
      const found = findCommentById(task.comments, parentCommentId);
      if (!found) {
        return res.status(404).json({
          success: false,
          message: "Parent comment not found",
        });
      }

      // Cek apakah parent sudah di level reply (depth 1)
      const parentDepth = task.comments.some((mainComment) =>
        mainComment.replies?.some(
          (reply) => reply._id.toString() === parentCommentId,
        ),
      )
        ? 1
        : 0;

      if (parentDepth >= 1) {
        return res.status(400).json({
          success: false,
          message: "Replies are limited to one level only.",
        });
      }
    }

    // === DETEKSI MENTION YANG AKURAT (support spasi & nama lengkap) ===
    const mentionRegex = /@([^@\n\r]+?)(?:\s|$)/g; // tangkap semua setelah @ sampai spasi/akhir
    const potentialMentions = [];
    let match;
    while ((match = mentionRegex.exec(comment.trim())) !== null) {
      const mentionedName = match[1].trim();
      if (mentionedName) potentialMentions.push(mentionedName);
    }

    // Kumpulkan semua user yang relevan (bisa di-mention)
    const candidateUserIds = new Set();

    // Owner project
    if (project.owner) candidateUserIds.add(project.owner.toString());

    // Members project
    project.members?.forEach((m) => candidateUserIds.add(m.user.toString()));

    // Creator task
    if (task.createdBy?._id)
      candidateUserIds.add(task.createdBy._id.toString());

    // Assignees task
    task.assignedTo?.forEach((a) => candidateUserIds.add(a._id.toString()));

    // Ambil data user sekaligus
    const candidateUsers = await User.find({
      _id: { $in: Array.from(candidateUserIds) },
    }).select("name username _id");

    // Mapping lowercase name → user
    const userMap = new Map();
    candidateUsers.forEach((user) => {
      userMap.set(user.name.toLowerCase(), user);
      if (user.username) {
        userMap.set(user.username.toLowerCase(), user);
      }
    });

    // Cari user yang cocok dengan teks mention
    const mentionedUserIds = new Set();
    for (const name of potentialMentions) {
      const lowerName = name.toLowerCase();

      // Prioritas 1: exact match nama atau username
      let matchedUser = userMap.get(lowerName);

      // Prioritas 2: partial match pada nama (misal @John cocok dengan "John Doe")
      if (!matchedUser) {
        matchedUser = candidateUsers.find(
          (u) =>
            u.name.toLowerCase().includes(lowerName) ||
            lowerName.includes(u.name.toLowerCase()),
        );
      }

      if (matchedUser && matchedUser._id.toString() !== userId.toString()) {
        mentionedUserIds.add(matchedUser._id.toString());
      }
      // console.log(
      //   `Mention detected: "${name}" → matched user: ${matchedUser?.name} (${matchedUser?._id})`
      // );
    }

    // === TAMBAH COMMENT KE TASK ===
    task.addComment(userId, comment.trim(), parentCommentId || null);
    await task.save();

    // Populate comment baru untuk response & socket
    const populatedTask = await Task.findById(taskId).populate({
      path: "comments.user comments.replies.user",
      select: "name username profilePicture",
    });

    let newComment;
    if (parentCommentId) {
      const parent = findCommentById(populatedTask.comments, parentCommentId);
      newComment = parent.comment.replies[parent.comment.replies.length - 1];
    } else {
      newComment = populatedTask.comments[populatedTask.comments.length - 1];
    }

    if (!newComment) {
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve new comment",
      });
    }

    // Build descriptive message
    const preview = comment.trim().length > 50 ? comment.trim().substring(0, 47) + "..." : comment.trim();
    let notificationMessage = `${req.user.name} commented on task "${task.title}": "${preview}"`;
    if (parentCommentId) {
      notificationMessage = `${req.user.name} replied in task "${task.title}": "${preview}"`;
    }

    // Send project-wide notification
    await createProjectNotification({
      project,
      sender: userId,
      type: "COMMENT_ADDED",
      message: notificationMessage,
      relatedId: task._id,
      relatedModel: "Task",
      link: `/projects/${project._id}/tasks/${task._id}`,
      details: {
        taskTitle: task.title,
        projectName: project.name,
        commentText: comment.trim()
      }
    });

    // Send MENTION notifications
    if (mentionedUserIds.size > 0) {
      const mentionPromises = Array.from(mentionedUserIds).map((mentionedUserId) =>
        createNotification({
          recipient: mentionedUserId,
          sender: userId,
          type: "MENTION",
          message: `${req.user.name} mentioned you in a comment on "${task.title}"`,
          relatedId: task._id,
          relatedModel: "Task",
          link: `/projects/${project._id}/tasks/${task._id}`,
          details: {
            taskTitle: task.title,
            projectName: project.name,
            commentText: comment.trim()
          }
        })
      );
      await Promise.all(mentionPromises);
    }

    // === ACTIVITY LOG ===
    // await ActivityLog.logTaskActivity(
    //   userId,
    //   parentCommentId ? "reply" : "comment",
    //   task._id,
    //   project._id,
    //   {
    //     taskTitle: task.title,
    //     projectName: project.name,
    //     commentText: text.trim().substring(0, 200),
    //     mentionedUsers:
    //       mentionedUserIds.size > 0 ? Array.from(mentionedUserIds) : undefined,
    //   }
    // );
    if (parentCommentId) {
      // Reply
      await ActivityLog.replyAdded(
        userId,
        task,
        project,
        parentCommentId,
        comment.trim(),
      );
    } else {
      // Comment utama
      await ActivityLog.commentAdded(
        userId,
        task,
        project,
        comment.trim(),
        Array.from(mentionedUserIds), // array user ID yang di-mention
      );
    }

    // === REALTIME SOCKET granularly ===
    const adminIds = project.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      project.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id._id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "comment_added", {
      projectId: project._id.toString(),
      taskId: task._id.toString(),
      comment: newComment.toObject(),
      parentCommentId: parentCommentId || null,
      addedBy: userId,
    });

    res.json({
      success: true,
      message: parentCommentId
        ? "Reply added successfully"
        : "Comment added successfully",
      data: newComment,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// === REACTION, EDIT, DELETE (dengan fix projectId string) ===

export const addReaction = async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const userId = req.user._id;
    const { emoji } = req.body;

    if (!emoji)
      return res
        .status(400)
        .json({ success: false, message: "Emoji is required" });

    const task = await Task.findById(taskId).populate("projectId");
    if (!task)
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    if (!task.projectId.isMember(userId))
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    const found = findCommentById(task.comments, commentId);
    if (!found)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });

    const comment = found.comment;
    if (!comment.reactions) comment.reactions = [];

    // DETEKSI: Apakah reaction ini akan ditambahkan atau dihapus?
    const existing = comment.reactions.find(
      (r) => r.emoji === emoji && r.user.toString() === userId.toString(),
    );

    // Tentukan status: true = akan ditambahkan, false = akan dihapus
    const isAdding = !existing; // ← BARIS INI YANG HILANG!

    if (existing) {
      comment.reactions.pull(existing._id);
    } else {
      comment.reactions.push({ emoji, user: userId });
    }

    await task.save();

    // Populate ulang untuk response
    const populatedTask = await Task.findById(taskId).populate({
      path: "comments.reactions.user comments.replies.reactions.user",
      select: "name profilePicture",
    });

    const updatedComment = findCommentById(
      populatedTask.comments,
      commentId,
    ).comment;

    // Send project-wide notification for reaction
    if (isAdding && comment.user.toString() !== userId.toString()) {
      await createProjectNotification({
        project: task.projectId,
        sender: userId,
        type: "COMMENT_ADDED",
        message: `${req.user.name} reacted to a comment on task: "${task.title}"`,
        relatedId: task._id,
        relatedModel: "Task",
        link: `/app/projects/${task.projectId._id}/tasks/${task._id}`,
      });
    }

    // ================== ACTIVITY LOG – SUDAH BENAR, SEKARANG isAdding TERDEFINISI ==================
    await ActivityLog.commentReaction(
      userId,
      task,
      task.projectId,
      commentId,
      emoji,
      isAdding, // true = added, false = removed
    );

    const projectIdString =
      typeof task.projectId._id === "object"
        ? task.projectId._id.toString()
        : task.projectId._id;

    // Emit socket granularly
    const adminIds = task.projectId.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      task.projectId.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "comment_reaction_updated", {
      taskId: task._id.toString(),
      commentId,
      reactions: updatedComment.reactions,
      reactedBy: userId,
      emoji,
    });

    res.json({
      success: true,
      message: isAdding ? "Reaction added" : "Reaction removed",
      data: { reactions: updatedComment.reactions },
    });
  } catch (error) {
    console.error("Add reaction error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const editComment = async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const userId = req.user._id;
    const { comment: commentText } = req.body;

    if (!commentText || commentText.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Comment text is required" });
    }

    const task = await Task.findById(taskId).populate("projectId");
    if (!task)
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    if (!task.projectId.isMember(userId))
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    const found = findCommentById(task.comments, commentId);
    if (!found)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });

    const comment = found.comment;
    if (comment.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own comments",
      });
    }

    comment.comment = commentText.trim();
    comment.isEdited = true;
    comment.editedAt = new Date();

    await task.save();

    const populatedTask = await Task.findById(taskId).populate({
      path: "comments.user comments.replies.user",
      select: "name username profilePicture",
    });

    const updatedComment = findCommentById(
      populatedTask.comments,
      commentId,
    ).comment;

    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "edit_comment",
    //   task._id,
    //   task.projectId,
    //   {
    //     taskTitle: task.title,
    //     projectName: task.projectId.name,
    //     commentText: text.trim().substring(0, 200),
    //   }
    // );
    // ================== ACTIVITY LOG – SUDAH SESUAI MODEL ==================
    await ActivityLog.commentEdited(
      userId,
      task,
      task.projectId,
      commentId,
      commentText.trim(),
    );

    const projectIdString =
      typeof task.projectId._id === "object"
        ? task.projectId._id.toString()
        : task.projectId._id;

    // Emit socket granularly
    const adminIds = task.projectId.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      task.projectId.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "comment_edited", {
      taskId: task._id.toString(),
      commentId,
      comment: updatedComment.toObject(),
      editedBy: userId,
    });

    res.json({
      success: true,
      message: "Comment edited successfully",
      data: updatedComment,
    });
  } catch (error) {
    console.error("Edit comment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(taskId).populate("projectId");
    if (!task)
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    if (!task.projectId.isMember(userId))
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    const found = findCommentById(task.comments, commentId);
    if (!found)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });

    const comment = found.comment;
    const isOwnerOrAdmin =
      task.projectId.hasPermission(userId, "admin") ||
      task.projectId.owner.toString() === userId.toString();
    const isAuthor = comment.user.toString() === userId.toString();

    if (!isAuthor && !isOwnerOrAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own comments or as admin",
      });
    }

    found.parentArray.pull(comment._id);
    await task.save();

    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "delete_comment",
    //   task._id,
    //   task.projectId,
    //   {
    //     taskTitle: task.title,
    //     projectName: task.projectId.name,
    //   }
    // );
    // ================== ACTIVITY LOG – SUDAH SESUAI MODEL ==================
    await ActivityLog.commentDeleted(
      userId,
      task,
      task.projectId,
      commentId,
      comment.comment.substring(0, 280), // optional: simpan preview teks yang dihapus
    );

    const projectIdString =
      typeof task.projectId._id === "object"
        ? task.projectId._id.toString()
        : task.projectId._id;

    // Emit socket granularly
    const adminIds = task.projectId.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      task.projectId.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "comment_deleted", {
      taskId: task._id.toString(),
      commentId,
      deletedBy: userId,
    });

    res.json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
