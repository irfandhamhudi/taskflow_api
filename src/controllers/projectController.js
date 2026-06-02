import Project from "../models/Project.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Workspace from "../models/Workspace.js";
import ActivityLog from "../models/ActivityLog.js";
import { sendEmail } from "../service/emailService.js";
import { emitSocketEvent, emitToUser, emitToMultipleUsers } from "../utils/socketHandler.js";
import { createNotification, createProjectNotification } from "./notificationController.js";

// @desc    Create new project
// @route   POST /api/projects
// @access  Private
// export const createProject = async (req, res) => {
//   try {
//     const {
//       name,
//       description,
//       settings,
//       tags,
//       color,
//       icon = "📁",
//       visibility = "private",
//     } = req.body;
//     const userId = req.user._id;

//     // Validasi visibility
//     if (!["private", "limited", "public"].includes(visibility)) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid visibility value. Must be 'private', 'limited', or 'public'",
//       });
//     }

//     const project = new Project({
//       name,
//       description,
//       owner: userId,
//       settings,
//       tags,
//       icon,
//       color,
//       visibility, // langsung pakai dari body
//     });

//     await project.save(); // pre-save akan handle shareLinkToken jika visibility = "link"

//     // Notifikasi owner
//     await Notification.createProjectNotification(
//       userId,
//       "project_created",
//       project._id,
//       { projectName: project.name }
//     );

//     // Log activity
//     // await ActivityLog.logProjectActivity(userId, "create", project._id, {
//     //   projectName: project.name,
//     //   visibility: project.visibility,
//     // });
//     await ActivityLog.projectCreated(userId, project);

//     // Socket event
//     emitSocketEvent(`project:${project._id}`, "project_created", {
//       projectId: project._id,
//       projectName: project.name,
//       visibility: project.visibility,
//       createdBy: userId,
//     });

//     const shareUrl = `${process.env.FRONTEND_URL}/projects/join-link/${project._id}?token=${project.shareLinkToken}`;

//     res.status(201).json({
//       success: true,
//       message: "Project created successfully",
//       data: {
//         ...project.toObject(),
//         shareUrl, // kirim ke frontend jika perlu
//       },
//     });
//   } catch (error) {
//     console.error("Create project error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   }
// };

import { PROJECT_TEMPLATES } from "../utils/projectTemplates.js";

export const createProject = async (req, res) => {
  try {
    const { name, description, settings, tags, color, icon = "📁", visibility = "private", templateKey, workspaceId } = req.body;
    const userId = req.user._id;

    // Find workspace
    let targetWorkspaceId = workspaceId;
    if (!targetWorkspaceId) {
      const defaultWorkspace = await Workspace.findOne({ owner: userId, isDefault: true });
      if (defaultWorkspace) {
        targetWorkspaceId = defaultWorkspace._id;
      } else {
        // Fallback: create default if missing
        const newDefault = new Workspace({
          name: "My Workspace",
          owner: userId,
          isDefault: true,
          icon: "🏠",
        });
        await newDefault.save();
        targetWorkspaceId = newDefault._id;
      }
    }

    // Validasi visibility
    if (!["private", "limited", "public"].includes(visibility)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visibility value",
      });
    }

    const template = templateKey ? PROJECT_TEMPLATES[templateKey] : null;

    const project = new Project({
      name: name || (template ? template.name : "New Project"),
      description: description || (template ? template.description : ""),
      owner: userId,
      settings: settings || {},
      tags: tags || [],
      icon: icon || (template ? template.icon : "📁"),
      color: color || "#3b82f6",
      visibility,
      workspaceId: targetWorkspaceId,
      enableShareLink: true,
    });

    await project.save();

    // Seed tasks if template is selected
    if (template && template.initialTasks) {
      const initialTasks = template.initialTasks.map((task, index) => ({
        ...task,
        projectId: project._id,
        createdBy: userId,
        order: index
      }));
      await Task.insertMany(initialTasks);
    }

    await ActivityLog.projectCreated(userId, project);

    // Notifikasi Owner
    await createNotification({
      recipient: userId,
      sender: userId,
      type: "PROJECT_CREATED",
      message: `You created a new project: "${project.name}"${templateKey ? ` using template "${template.name}"` : ""}.`,
      relatedId: project._id,
      relatedModel: "Project",
      link: `/projects/${project._id}`,
    });

    emitSocketEvent(`project:${project._id}`, "project_created", {
      projectId: project._id,
      projectName: project.name,
      createdBy: userId,
      visibility: project.visibility,
    });

    // Populate before emitting to ensure UI has avatars/names
    await project.populate([
      { path: "owner", select: "name email profilePicture" },
      { path: "members.user", select: "name email profilePicture" },
    ]);

    emitSocketEvent(`workspace:${targetWorkspaceId}`, "project_created", {
      project: project.toObject({ getters: true }),
      createdBy: userId,
    });

    // Notify user to update dashboard task list
    emitToUser(userId, "task_list_updated", { 
      message: "New tasks available from project template",
      projectId: project._id 
    });

    let shareUrl = null;
    if (project.enableShareLink && project.shareLinkToken) {
      shareUrl = `${process.env.FRONTEND_URL}/projects/join-link/${project._id}?token=${project.shareLinkToken}`;
    }

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: {
        ...project.toObject(),
        shareUrl,
      },
    });
  } catch (error) {
    console.error("Create project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get all projects for user
// @route   GET /api/projects
// @access  Private
export const getProjects = async (req, res) => {
  try {
    const userIdStr = req.user._id.toString();
    const pageNum = parseInt(req.query.page) || 1;
    const limitNum = parseInt(req.query.limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const { search, archived, workspaceId } = req.query;
 
    let query = {
      $or: [{ owner: req.user._id }, { "members.user": req.user._id }],
      isArchived: archived === "true",
      isDeleted: { $ne: true },
    };

    if (workspaceId) {
      query.workspaceId = workspaceId;
    }

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      query.$and = [
        {
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { tags: { $in: [searchRegex] } },
          ],
        },
      ];
    }

    const userFavorites = await User.findById(req.user._id).select("favoriteProjects");
    const favoriteProjectIds = userFavorites?.favoriteProjects?.map(id => id.toString()) || [];

    const projects = await Project.find(query)
      .populate("owner", "name email profilePicture")
      .populate("members.user", "name email profilePicture")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Project.countDocuments(query);

    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const taskCount = await Task.countDocuments({
          projectId: project._id,
          isArchived: false,
        });
        const completedTaskCount = await Task.countDocuments({
          projectId: project._id,
          status: "done",
          isArchived: false,
        });

        const projectObj = project.toObject();
        projectObj.taskCount = taskCount;
        projectObj.completedTaskCount = completedTaskCount;
        projectObj.progress =
          taskCount > 0
            ? Math.round((completedTaskCount / taskCount) * 100)
            : 0;

        // === PERBAIKAN UTAMA: HITUNG ROLE SECARA MANUAL ===
        const ownerIdStr = project.owner._id
          ? project.owner._id.toString()
          : project.owner.toString();
        const isOwner = ownerIdStr === userIdStr;

        let userRole = null;
        if (isOwner) {
          userRole = "owner";
        } else {
          const member = project.members.find((m) => {
            if (!m.user) return false;
            const memberUserIdStr = m.user._id
              ? m.user._id.toString()
              : m.user.toString();
            return memberUserIdStr === userIdStr;
          });
          if (member && member.role) {
            userRole = member.role;
          }
        }

        projectObj.isOwner = isOwner;
        projectObj.userRole = userRole;
        projectObj.isFavorite = favoriteProjectIds.includes(project._id.toString());

        // Optional debug
        // console.log(
        //   `[getProjects] Project ${project._id} → User ${userIdStr} → isOwner: ${isOwner}, userRole: ${userRole}`
        // );

        return projectObj;
      })
    );

    res.json({
      success: true,
      data: projectsWithStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Get projects error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
// export const getProject = async (req, res) => {
//   try {
//     const projectId = req.params.id;
//     const userIdStr = req.user._id.toString(); // string untuk comparison aman

//     const project = await Project.findById(projectId)
//       .populate("owner", "name email profilePicture _id")
//       .populate("members.user", "name email profilePicture _id");

//     if (!project) {
//       return res.status(404).json({
//         success: false,
//         message: "Project not found",
//       });
//     }

//     // === LOGIC AKSES (tetap sama, sudah benar) ===
//     const ownerIdStr = project.owner._id
//       ? project.owner._id.toString()
//       : project.owner.toString();

//     const isOwner = ownerIdStr === userIdStr;
//     const isMember = project.members.some(
//       (m) => m.user && m.user._id && m.user._id.toString() === userIdStr
//     );

//     let hasAccess = isOwner || isMember;

//     if (project.visibility === "public") {
//       hasAccess = true;
//     } else if (project.visibility === "limited") {
//       hasAccess = isOwner || isMember;
//     }

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Not authorized to access this project",
//       });
//     }

//     // === STATS (tetap sama) ===
//     const taskCount = await Task.countDocuments({
//       projectId: project._id,
//       isArchived: false,
//     });
//     const completedTaskCount = await Task.countDocuments({
//       projectId: project._id,
//       status: "done",
//       isArchived: false,
//     });
//     const overdueTaskCount = await Task.countDocuments({
//       projectId: project._id,
//       dueDate: { $lt: new Date() },
//       status: { $ne: "done" },
//       isArchived: false,
//     });

//     const projectObj = project.toObject();
//     projectObj.stats = {
//       taskCount,
//       completedTaskCount,
//       overdueTaskCount,
//       progress:
//         taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0,
//     };

//     // === PERBAIKAN UTAMA: HITUNG ROLE SECARA MANUAL & AMAN ===
//     let userRole = null;

//     if (isOwner) {
//       userRole = "owner";
//     } else {
//       const member = project.members.find((m) => {
//         if (!m.user) return false;
//         const memberUserIdStr = m.user._id
//           ? m.user._id.toString()
//           : m.user.toString();
//         return memberUserIdStr === userIdStr;
//       });

//       if (member && member.role) {
//         userRole = member.role;
//       }
//     }

//     projectObj.isOwner = isOwner;
//     projectObj.userRole = userRole;

//     // // Optional debug log (hapus di production)
//     // console.log(
//     //   `[getProject] User ${userIdStr} → isOwner: ${isOwner}, userRole: ${userRole}`
//     // );

//     // Share URL jika limited
//     if (project.visibility === "limited" && project.shareLinkToken) {
//       projectObj.shareUrl = `${process.env.FRONTEND_URL}/projects/join-link/${project._id}?token=${project.shareLinkToken}`;
//     }

//     res.json({
//       success: true,
//       data: projectObj,
//     });
//   } catch (error) {
//     console.error("Get project error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//     });
//   }
// };

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
export const getProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userIdStr = req.user._id.toString();

    const project = await Project.findById(projectId)
      .populate("owner", "name email profilePicture _id")
      .populate("members.user", "name email profilePicture _id");

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // FIX: Handle kalau owner null (edge case)
    const ownerIdStr = project.owner?._id?.toString() || "";
    const isOwner = ownerIdStr === userIdStr;

    const isMember = project.members.some(
      (m) => m.user?._id?.toString() === userIdStr
    );

    // Public projects are joinable via link, but data is only visible to members
    const hasAccess = isOwner || isMember;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this project",
      });
    }

    // Stats task
    const taskCount = await Task.countDocuments({
      projectId: project._id,
      isArchived: false,
    });
    const completedTaskCount = await Task.countDocuments({
      projectId: project._id,
      status: "done",
      isArchived: false,
    });
    const overdueTaskCount = await Task.countDocuments({
      projectId: project._id,
      dueDate: { $lt: new Date() },
      status: { $ne: "done" },
      isArchived: false,
    });

    const userFavorites = await User.findById(req.user._id).select("favoriteProjects");
    const isFavorite = userFavorites?.favoriteProjects?.some(
      (id) => id.toString() === projectId
    );

    const projectObj = project.toObject();
    projectObj.isFavorite = !!isFavorite;

    projectObj.stats = {
      taskCount,
      completedTaskCount,
      overdueTaskCount,
      progress:
        taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0,
    };

    // Role logic
    let userRole = null;
    if (isOwner) {
      userRole = "owner";
    } else {
      const member = project.members.find(
        (m) => m.user?._id?.toString() === userIdStr
      );
      userRole = member?.role || null;
    }

    // Tambahkan field penting ke response
    projectObj.isOwner = isOwner;
    projectObj.userRole = userRole || "viewer";
    projectObj.enableShareLink = project.enableShareLink ?? false;
    projectObj.shareRole = project.shareRole || "viewer"; // tambah ini biar frontend tahu role default join

    // Share URL
    const shareUrl =
      project.visibility !== "private" &&
      (project.visibility === "public" ||
        (project.enableShareLink && project.shareLinkToken))
        ? `${process.env.FRONTEND_URL}/projects/join-link/${
            project._id
          }${project.visibility === "limited" ? `?token=${project.shareLinkToken}` : ""}`
        : null;
    projectObj.shareUrl = shareUrl;

    // // Debug log (bisa dihapus nanti)
    // console.log("[getProject] Debug role:", {
    //   userId: userIdStr,
    //   ownerId: ownerIdStr,
    //   isOwner,
    //   isMember,
    //   userRole,
    //   membersCount: project.members.length,
    // });

    // console.log("[getProject] Share link status:", {
    //   enableShareLink: projectObj.enableShareLink,
    //   hasToken: !!project.shareLinkToken,
    //   shareUrlGenerated: !!shareUrl,
    //   shareRole: projectObj.shareRole,
    // });

    res.json({
      success: true,
      data: projectObj,
    });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
export const updateProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;
    const updateData = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (!project.hasPermission(userId, "admin")) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this project",
      });
    }

    const oldData = { ...project.toObject() };

    // Apply updates (safe keys)
    const allowedKeys = [
      "name",
      "description",
      "icon",
      "color",
      "tags",
      "settings",
      "visibility",
    ];
    const changedFields = [];

    allowedKeys.forEach((key) => {
      if (updateData.hasOwnProperty(key) && updateData[key] !== project[key]) {
        project[key] = updateData[key];
        changedFields.push(key);
      }
    });

    if (changedFields.length === 0) {
      return res.json({
        success: true,
        message: "No changes to apply",
        data: project,
      });
    }

    await project.save();

    // ── Ambil nama user yang mengupdate (INI YANG HILANG) ────────────────────
    const updatedByUser = await User.findById(userId).select("name");

    // ── Notifications ────────────────────────────────────────────────────────
    await createProjectNotification({
      project,
      sender: userId,
      type: "PROJECT_UPDATED",
      message: `Project "${project.name}" was updated by ${updatedByUser?.name || "someone"}.`,
      relatedId: project._id,
      relatedModel: "Project",
      link: `/projects/${project._id}`,
    });

    // ── Activity Log ─────────────────────────────────────────────────────────
    await ActivityLog.projectUpdated(userId, project, changedFields);

    // ── Socket ───────────────────────────────────────────────────────────────
    // Populate before emitting to ensure UI has avatars/names
    await project.populate([
      { path: "owner", select: "name email profilePicture" },
      { path: "members.user", select: "name email profilePicture" },
    ]);

    emitSocketEvent(`project:${project._id}`, "project_updated", {
      projectId: project._id,
      updatedBy: userId,
      updatedByName: updatedByUser?.name || "Someone", // ← sekarang aman
      project: project.toObject({ getters: true }), // full project object
      // changes: updateData, // optional jika masih ingin kirim
    });

    emitSocketEvent(`workspace:${project.workspaceId}`, "project_updated", {
      projectId: project._id,
      updatedBy: userId,
      updatedByName: updatedByUser?.name || "Someone",
      project: project.toObject({ getters: true }),
    });

    res.json({
      success: true,
      message: "Project updated successfully",
      data: project,
    });
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// controllers/projectController.js

export const deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not required",
      });
    }

    // Hanya owner yang boleh hapus
    if (project.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the project owner can delete this project",
      });
    }

    const projectName = project.name; // untuk logging & notifikasi

    // Soft delete project
    project.isDeleted = true;
    project.deletedAt = new Date();
    await project.save();

    // Soft delete all tasks in the project as well
    await Task.updateMany({ projectId: project._id }, { 
      isDeleted: true, 
      deletedAt: new Date() 
    });

    // 3. Notifikasi ke semua member project
    await createProjectNotification({
      project,
      sender: userId,
      type: "PROJECT_DELETED",
      message: `Project "${projectName}" was moved to trash by the owner.`,
      relatedId: project._id,
      relatedModel: "Project",
    });

    // 4. Log activity
    await ActivityLog.projectDeleted(userId, projectId, projectName);

    // 5. Emit ke room project (untuk orang yang masih di halaman)
    emitSocketEvent(`project:${projectId}`, "project_deleted", {
      projectId,
      projectName,
      deletedBy: userId,
      deletedByName: req.user.name,
    });

    emitSocketEvent(`workspace:${project.workspaceId}`, "project_deleted", {
      projectId,
      projectName,
      deletedBy: userId,
      deletedByName: req.user.name,
    });

    return res.json({
      success: true,
      message: "Project moved to trash successfully",
    });
  } catch (error) {
    console.error("Delete project error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete project",
      error: error.message,
    });
  }
};

// @desc    Archive/unarchive project
// @route   PATCH /api/projects/:id/archive
// @access  Private
export const archiveProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;
    const { archive } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if user has permission
    if (!project.hasPermission(userId, "admin")) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to archive this project",
      });
    }

    project.isArchived = archive;
    if (archive) {
      project.archivedAt = new Date();
    } else {
      project.archivedAt = undefined;
    }

    await project.save();

    // Log activity
    // await ActivityLog.logProjectActivity(userId, "update", project._id, {
    //   projectName: project.name,
    //   action: archive ? "archived" : "unarchived",
    // });
    if (archive) {
      await ActivityLog.projectArchived(userId, project);
    } else {
      await ActivityLog.projectUnarchived(userId, project);
    }

    // Emit socket event
    // Populate before emitting
    await project.populate([
      { path: "owner", select: "name email profilePicture" },
      { path: "members.user", select: "name email profilePicture" },
    ]);

    emitSocketEvent(`project:${project._id}`, "project_archived", {
      projectId: project._id,
      isArchived: project.isArchived,
      updatedBy: userId,
    });

    emitSocketEvent(`workspace:${project.workspaceId}`, "project_archived", {
      projectId: project._id,
      isArchived: project.isArchived,
      updatedBy: userId,
    });

    res.json({
      success: true,
      message: archive ? "Project archived" : "Project unarchived",
      data: project,
    });
  } catch (error) {
    console.error("Archive project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Toggle project as favorite
// @route   PATCH /api/projects/:id/favorite
// @access  Private
export const toggleFavoriteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const index = user.favoriteProjects.indexOf(projectId);
    let isFavorite = false;

    if (index === -1) {
      user.favoriteProjects.push(projectId);
      isFavorite = true;
    } else {
      user.favoriteProjects.splice(index, 1);
      isFavorite = false;
    }

    await user.save();

    res.json({
      success: true,
      message: isFavorite ? "Project added to favorites" : "Project removed from favorites",
      isFavorite,
    });
  } catch (error) {
    console.error("Toggle favorite error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Invite user to project
// @route   POST /api/projects/:id/invite
// @access  Private
export const inviteToProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;
    const { email, role = "editor" } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if user has permission to invite
    if (!project.hasPermission(userId, "admin")) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to invite users to this project",
      });
    }

    // Check if user is already a member
    const existingUser = await User.findOne({ email: email.toLowerCase(), isActive: true });
    
    if (existingUser && project.isMember(existingUser._id)) {
      return res.status(400).json({
        success: false,
        message: "User is already a member of this project",
      });
    }

    // Generate invite token (valid for 7 days)
    const { token, expires } = project.generateInviteToken(email, role, 168);
    await project.save();

    // Send invitation email
    const inviteUrl = `${process.env.FRONTEND_URL}/projects/join/${projectId}?token=${token}&email=${email}`;

    await sendEmail({
      to: email,
      subject: `Invitation to join project: ${project.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e293b; margin-top: 0;">You've been invited to join a project!</h2>
          <p style="color: #475569; line-height: 1.6;">${req.user.name} has invited you to join the project "<strong>${project.name}</strong>" as a <strong>${role}</strong>.</p>
          <p style="color: #475569; line-height: 1.6;">Click the button below to accept the invitation and join the project:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">This invitation link will expire on ${expires.toLocaleDateString()}.</p>
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;">
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
      `,
    });

    // Log activity
    await ActivityLog.memberInvited(userId, project, email, role);

    res.json({
      success: true,
      message: "Invitation sent successfully",
      data: {
        email,
        role,
        expires,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Join project via invitation
// @route   POST /api/projects/:id/join
// @access  Private
export const joinProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;
    const { token, email } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validate token
    const invite = project.validateInviteToken(token, email);
    if (!invite) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired invitation token",
      });
    }

    // Check if user email matches invitation email
    const user = await User.findById(userId);
    if (!email || user.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "Email does not match invitation",
      });
    }

    // Check if already a member
    if (project.isMember(userId)) {
      // Remove the token since user is already member
      project.removeInviteToken(token);
      await project.save();

      // Populate before returning
      await project.populate([
        { path: "owner", select: "name email profilePicture" },
        { path: "members.user", select: "name email profilePicture" },
      ]);

      return res.json({
        success: true,
        message: "You are already a member of this project",
        data: project,
      });
    }

    // Add user as member
    project.addMember(userId, invite.role);

    // Remove the used token
    project.removeInviteToken(token);

    await project.save();

    // Ensure user is also a member of the project's workspace
    if (project.workspaceId) {
      const workspace = await Workspace.findById(project.workspaceId);
      if (workspace) {
        workspace.addMember(userId, "member");
        await workspace.save();
      }
    }

    // Notifikasi ke semua member project
    await createProjectNotification({
      project,
      sender: userId,
      type: "PROJECT_JOINED",
      message: `${user.name} joined project "${project.name}".`,
      relatedId: project._id,
      relatedModel: "Project",
      link: `/projects/${project._id}`,
    });

    // Log activity
    // await ActivityLog.logProjectActivity(userId, "join", project._id, {
    //   projectName: project.name,
    //   role: invite.role,
    // });
    await ActivityLog.memberJoined(userId, project, invite.role, false);

    // Emit socket event
    emitSocketEvent(`project:${project._id}`, "member_joined", {
      projectId: project._id,
      member: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture,
        },
        role: invite.role,
        joinedAt: new Date(),
      }
    });

    // Populate before returning
    await project.populate([
      { path: "owner", select: "name email profilePicture" },
      { path: "members.user", select: "name email profilePicture" },
    ]);

    res.json({
      success: true,
      message: "Successfully joined the project",
      data: project,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Remove member from project
// @route   DELETE /api/projects/:id/members/:memberId
// @access  Private
export const removeMember = async (req, res) => {
  try {
    const { id: projectId, memberId } = req.params;
    const userId = req.user._id;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if user has permission
    if (!project.hasPermission(userId, "admin")) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to remove members",
      });
    }

    // Cannot remove owner
    if (project.owner.toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove project owner",
      });
    }

    // Check if member exists
    const memberExists = project.members.some(
      (member) => member.user.toString() === memberId
    );

    if (!memberExists) {
      return res.status(404).json({
        success: false,
        message: "Member not found in project",
      });
    }

    // Remove member
    project.removeMember(memberId);
    await project.save();

    // Notifikasi removed

    // Notifikasi removed

    // Get member info for activity log
    const memberUser = await User.findById(memberId);

    // Log activity
    // await ActivityLog.logProjectActivity(userId, "remove_member", project._id, {
    //   projectName: project.name,
    //   removedMemberId: memberId,
    //   removedMemberName: memberUser?.name || "Unknown",
    // });
    await ActivityLog.memberRemoved(
      userId,
      project,
      memberId,
      memberUser?.name || "Unknown"
    );

    // Emit socket event
    emitSocketEvent(`project:${project._id}`, "member_removed", {
      projectId: project._id,
      memberId,
      removedBy: userId,
    });

    res.json({
      success: true,
      message: "Member removed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update member role
// @route   PATCH /api/projects/:id/members/:memberId/role
// @access  Private
export const updateMemberRole = async (req, res) => {
  try {
    const { id: projectId, memberId } = req.params;
    const userId = req.user._id;
    const { role } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if user has permission
    if (!project.hasPermission(userId, "admin")) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update member roles",
      });
    }

    // Cannot change owner role
    if (project.owner.toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: "Cannot change owner role",
      });
    }

    // Find and update member
    const memberIndex = project.members.findIndex(
      (member) => member.user.toString() === memberId
    );

    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Member not found in project",
      });
    }

    const oldRole = project.members[memberIndex].role;
    project.members[memberIndex].role = role;

    await project.save();

    // Notifikasi removed

    // Notifikasi removed

    // Get member info
    const memberUser = await User.findById(memberId);

    // Log activity
    // await ActivityLog.logProjectActivity(
    //   userId,
    //   "update_member_role",
    //   project._id,
    //   {
    //     projectName: project.name,
    //     memberId,
    //     memberName: memberUser?.name || "Unknown",
    //     oldRole,
    //     newRole: role,
    //   }
    // );
    await ActivityLog.memberRoleUpdated(
      userId,
      project,
      memberId,
      memberUser?.name || "Unknown",
      oldRole,
      role
    );

    // Emit socket event
    emitSocketEvent(`project:${project._id}`, "member_role_updated", {
      projectId: project._id,
      memberId,
      oldRole,
      newRole: role,
      updatedBy: userId,
      message: `Your access level has been updated to ${
        role === "admin"
          ? "Admin (Full access)"
          : role === "editor"
          ? "Editor (Can edit tasks)"
          : "Viewer (Can view only)"
      } by ${req.user.name}.`,
    });

    res.json({
      success: true,
      message: "Member role updated successfully",
      data: project.members[memberIndex],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get project members
// @route   GET /api/projects/:id/members
// @access  Private
export const getProjectMembers = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id.toString(); // Pastikan string

    const project = await Project.findById(projectId)
      .populate("owner", "name email profilePicture _id")
      .populate("members.user", "name email profilePicture _id");

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Manual check akses — DIPERBAIKI (sama seperti getProject)
    const ownerIdStr = project.owner._id
      ? project.owner._id.toString()
      : project.owner.toString();
    const isOwner = ownerIdStr === userId;

    const isMember = project.members.some(
      (member) =>
        member.user && member.user._id && member.user._id.toString() === userId
    );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this project",
      });
    }

    // Format members response (tetap sama)
    const members = [
      {
        user: project.owner,
        role: "owner",
        joinedAt: project.createdAt,
      },
      ...project.members.map((member) => ({
        user: member.user,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
    ];

    res.json({
      success: true,
      data: members,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateShareSettings = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user._id;
    const { enableShareLink, shareRole, regenerate } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    if (!project.hasPermission(userId, "admin")) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    let actionTaken = null;

    // 1. Ubah enable/disable
    if (enableShareLink !== undefined) {
      project.enableShareLink = enableShareLink;
      actionTaken = enableShareLink ? "enabled" : "disabled";
    }

    // 2. Ubah role (jika dikirim)
    if (shareRole) {
      project.shareRole = shareRole;
    }

    // 3. Regenerate token jika diminta DAN link sedang aktif
    if (regenerate && project.enableShareLink) {
      project.regenerateShareLink();
      actionTaken = "regenerated";
    }

    await project.save();

    // ================== ACTIVITY LOG – menggunakan helper baru ==================
    if (actionTaken === "enabled") {
      await ActivityLog.shareLinkEnabled(userId, project);
    } else if (actionTaken === "disabled") {
      await ActivityLog.shareLinkDisabled(userId, project);
    } else if (actionTaken === "regenerated") {
      await ActivityLog.shareLinkRegenerated(userId, project);
    }

    // Jika ada perubahan role tanpa enable/disable/regenerate
    // (opsional - tergantung kebutuhan bisnis Anda)
    // if (shareRole && !actionTaken) {
    //   await ActivityLog.projectUpdated(userId, project, ["shareRole"]);
    // }

    const shareUrl =
      project.visibility !== "private" &&
      (project.visibility === "public" ||
        (project.enableShareLink && project.shareLinkToken))
        ? `${process.env.FRONTEND_URL}/projects/join-link/${
            project._id
          }${project.visibility === "limited" ? `?token=${project.shareLinkToken}` : ""}`
        : null;

    res.json({
      success: true,
      message: "Share link settings updated successfully",
      data: {
        enableShareLink: project.enableShareLink,
        shareRole: project.shareRole,
        shareUrl,
      },
    });
  } catch (error) {
    console.error("Update share settings error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const joinViaShareLink = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { token } = req.query; // Ambil dari query string (?token=...)
    const userId = req.user._id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Missing invitation token",
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validasi berdasarkan visibility
    if (project.visibility === "private") {
      return res.status(403).json({
        success: false,
        message: "Share link is disabled for private projects",
      });
    }

    if (project.visibility === "limited") {
      if (project.shareLinkToken !== token) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired share link",
        });
      }
    }
    // Jika public, abaikan token (boleh ada boleh tidak)

    // Jika sudah menjadi member
    if (project.isMember(userId)) {
      return res.json({
        success: true,
        message: "You are already a member of this project",
        redirectTo: `/projects/${projectId}`,
      });
    }

    // Tambahkan sebagai member
    project.addMember(userId, project.shareRole || "viewer");
    await project.save();

    // Ensure user is also a member of the project's workspace
    if (project.workspaceId) {
      const workspace = await Workspace.findById(project.workspaceId);
      if (workspace) {
        workspace.addMember(userId, "member");
        await workspace.save();
      }
    }

    // Notifikasi ke semua member project
    await createProjectNotification({
      project,
      sender: userId,
      type: "PROJECT_JOINED",
      message: `${req.user.name} joined project "${project.name}" via share link.`,
      relatedId: project._id,
      relatedModel: "Project",
      link: `/projects/${project._id}`,
    });

    // // Optional: log activity, notification, socket
    // await ActivityLog.logProjectActivity(
    //   userId,
    //   "join_via_share_link",
    //   project._id,
    //   {
    //     projectName: project.name,
    //     role: project.shareRole || "viewer",
    //   }
    // );
    await ActivityLog.memberJoined(
      userId,
      project,
      project.shareRole || "viewer",
      true
    );

    emitSocketEvent(`project:${project._id}`, "member_joined", {
      projectId: project._id,
      member: {
        user: {
          _id: userId,
          name: req.user.name,
          email: req.user.email,
          profilePicture: req.user.profilePicture,
        },
        role: project.shareRole || "viewer",
        joinedAt: new Date(),
      }
    });

    res.json({
      success: true,
      message: "Successfully joined the project",
      redirectTo: `/projects/${projectId}`,
    });
  } catch (error) {
    console.error("Join via share link error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Request role upgrade
// @route   POST /api/projects/:id/role-upgrade
// @access  Private
export const requestRoleUpgrade = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { requestedRole, message } = req.body;
    const userId = req.user._id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    // Check if member
    const currentRole = project.getUserRole(userId);
    if (!currentRole) {
      return res.status(403).json({ success: false, message: "Not a member of this project" });
    }

    // Check if already has a higher or equal role
    const roleHierarchy = { viewer: 1, editor: 2, admin: 3, owner: 4 };
    if (roleHierarchy[currentRole] >= roleHierarchy[requestedRole]) {
      return res.status(400).json({ 
        success: false, 
        message: `You already have ${currentRole} role which is higher or equal to ${requestedRole}` 
      });
    }

    // Check if already has a pending request
    const existingRequest = project.roleRequests.find(
      (r) => r.user.toString() === userId.toString() && r.status === "pending"
    );

    if (existingRequest) {
      return res.status(400).json({ success: false, message: "You already have a pending request" });
    }

    // Add request
    project.roleRequests.push({
      user: userId,
      requestedRole,
      message,
      status: "pending",
    });

    await project.save();

    // Re-fetch project to get full request with populated user
    const updatedProject = await Project.findById(projectId).populate("roleRequests.user", "name email profilePicture");
    const newRequest = updatedProject.roleRequests.find(
      (r) => r.user?._id?.toString() === userId.toString() && r.status === "pending"
    );

    // Emit socket event to owner/admins
    emitSocketEvent(`project:${projectId}`, "role_upgrade_requested", {
      projectId,
      request: newRequest,
    });

    res.json({
      success: true,
      message: "Role upgrade request submitted successfully",
    });
  } catch (error) {
    console.error("Request role upgrade error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get all role upgrade requests
// @route   GET /api/projects/:id/role-upgrade/requests
// @access  Private (Owner/Admin)
export const getRoleUpgradeRequests = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user._id;

    const project = await Project.findById(projectId).populate("roleRequests.user", "name email profilePicture");
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    // Check permission (Owner or Admin)
    if (!project.hasPermission(userId, "admin")) {
      return res.status(403).json({ success: false, message: "Not authorized to manage requests" });
    }

    res.json({
      success: true,
      data: project.roleRequests.filter((r) => r.status === "pending"),
    });
  } catch (error) {
    console.error("Get role requests error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Handle role upgrade request (approve/reject)
// @route   PATCH /api/projects/:id/role-upgrade/requests/:requestId
// @access  Private (Owner/Admin)
export const handleRoleUpgradeRequest = async (req, res) => {
  try {
    const { id: projectId, requestId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    const userId = req.user._id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    // Check permission
    if (!project.hasPermission(userId, "admin")) {
      return res.status(403).json({ success: false, message: "Not authorized to manage requests" });
    }

    const request = project.roleRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ success: false, message: "Request is already processed" });
    }

    if (action === "approve") {
      request.status = "approved";
      // Update member role
      const oldRole = project.updateMemberRole(request.user, request.requestedRole);
      
      // Fetch user to get name for logging
      const userToUpgrade = await User.findById(request.user).select("name");
      const memberName = userToUpgrade ? userToUpgrade.name : "Unknown Member";

      // Log activity
      await ActivityLog.memberRoleUpdated(userId, project, request.user, memberName, oldRole, request.requestedRole);

      // Socket event
      emitSocketEvent(`project:${projectId}`, "member_role_updated", {
        projectId,
        memberId: request.user,
        newRole: request.requestedRole,
        message: `Your access level has been updated to ${request.requestedRole} by an admin.`,
      });

    } else if (action === "reject") {
      request.status = "rejected";
    } else {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }

    await project.save();

    // Emit that request was handled (approve/reject)
    emitSocketEvent(`project:${projectId}`, "role_request_handled", {
      projectId,
      requestId,
      status: request.status,
      userId: request.user,
    });

    // Notify specific user if rejected (approve already has role_updated)
    if (action === "reject") {
      emitToUser(request.user.toString(), "role_upgrade_rejected", {
        projectId,
        message: `Your role upgrade request for project "${project.name}" was rejected.`,
      });
    }

    res.json({
      success: true,
      message: `Request ${action}ed successfully`,
    });
  } catch (error) {
    console.error("Handle role request error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Track share link copy
// @route   POST /api/projects/:id/share-link-copied
// @access  Private
export const trackShareLinkCopy = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user._id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    // Notifikasi ke semua member project
    await createProjectNotification({
      project,
      sender: userId,
      type: "SHARE_LINK_COPIED",
      message: `${req.user.name} copied the share link for project "${project.name}".`,
      relatedId: project._id,
      relatedModel: "Project",
      link: `/projects/${project._id}`,
    });

    res.json({ success: true, message: "Share link copy tracked" });
  } catch (error) {
    console.error("Track share link copy error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


