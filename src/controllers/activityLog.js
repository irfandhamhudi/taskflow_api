// controllers/activityLogController.js

import ActivityLog from "../models/ActivityLog.js";
import Project from "../models/Project.js";
// import Task from "../models/Task.js";
// import User from "../models/User.js";

// @desc    Get activity logs for a project
// @route   GET /api/activity-logs/project/:projectId
// @access  Private (harus menjadi member project)
export const getProjectActivityLogs = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;
    const pageNum = parseInt(req.query.page) || 1;
    const limitNum = parseInt(req.query.limit) || 20;
    const {
      action,
      entityType,
      user: filterUserId,
    } = req.query;

    // Cek akses ke project
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const hasAccess =
      project.owner.toString() === userId.toString() ||
      project.members.some((m) => m.user.toString() === userId.toString());

    if (!hasAccess && project.visibility !== "public") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view activity in this project",
      });
    }

    // Build query
    const query = { projectId };

    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    if (filterUserId) query.user = filterUserId;

    const skip = (pageNum - 1) * limitNum;

    const logs = await ActivityLog.find(query)
      .populate("user", "name username profilePicture")
      .populate({
        path: "entityId",
        select: "title name", // title untuk task, name untuk project/user
        populate:
          entityType === "task"
            ? { path: "projectId", select: "name color" }
            : null,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await ActivityLog.countDocuments(query);

    // Format response agar lebih mudah dibaca di frontend
    const formattedLogs = logs.map((log) => {
      const logObj = log.toObject();

      let entityName = "";
      if (log.entityType === "task" && log.entityId?.title) {
        entityName = log.entityId.title;
      } else if (log.entityType === "project" && log.entityId?.name) {
        entityName = log.entityId.name;
      } else if (log.entityType === "user" && log.entityId?.name) {
        entityName = log.entityId.name;
      }

      return {
        ...logObj,
        entityName,
      };
    });

    res.json({
      success: true,
      data: formattedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Get project activity logs error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get recent activity logs for current user (across all projects)
// @route   GET /api/activity-logs/me
// @access  Private
export const getMyRecentActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const limitNum = parseInt(limit) || 15;

    const logs = await ActivityLog.find({ user: userId })
      .populate("user", "name profilePicture")
      .populate({
        path: "entityId",
        select: "title name",
      })
      .populate("projectId", "name color icon")
      .sort({ createdAt: -1 })
      .limit(limitNum);

    const formattedLogs = logs.map((log) => {
      const logObj = log.toObject();
      let entityName = "";
      if (log.entityType === "task" && log.entityId?.title) {
        entityName = log.entityId.title;
      } else if (log.entityType === "project" && log.projectId?.name) {
        entityName = log.projectId.name;
      }

      return {
        ...logObj,
        entityName,
        projectName: log.projectId?.name,
        projectColor: log.projectId?.color,
        projectIcon: log.projectId?.icon,
      };
    });

    res.json({
      success: true,
      data: formattedLogs,
    });
  } catch (error) {
    console.error("Get my activity error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get global activity feed (admin only atau untuk dashboard)
// @route   GET /api/activity-logs/global
// @access  Private (optional: tambahkan role check jika perlu admin only)
export const getGlobalActivity = async (req, res) => {
  try {
    const pageNum = parseInt(req.query.page) || 1;
    const limitNum = parseInt(req.query.limit) || 30;
    const { action, entityType, projectId } = req.query;

    const query = {};
    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    if (projectId) query.projectId = projectId;

    const skip = (pageNum - 1) * limitNum;

    const logs = await ActivityLog.find(query)
      .populate("user", "name username profilePicture")
      .populate("projectId", "name color icon")
      .populate({
        path: "entityId",
        select: "title name",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await ActivityLog.countDocuments(query);

    const formattedLogs = logs.map((log) => {
      let entityName = "";
      if (log.entityType === "task" && log.entityId?.title) {
        entityName = log.entityId.title;
      } else if (log.entityType === "project" && log.projectId?.name) {
        entityName = log.projectId.name;
      }

      return {
        ...log.toObject(),
        entityName,
        projectName: log.projectId?.name,
        projectColor: log.projectId?.color,
      };
    });

    res.json({
      success: true,
      data: formattedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Get global activity error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
