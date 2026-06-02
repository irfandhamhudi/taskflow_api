// controllers/fileController.js
import { v2 as cloudinary } from "cloudinary";
import File from "../models/File.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import ActivityLog from "../models/ActivityLog.js";
import { emitSocketEvent, emitToUser, emitToMultipleUsers } from "../utils/socketHandler.js";
import { createProjectNotification } from "./notificationController.js";
import https from "https";

// Cloudinary config (only once)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  // Dev-only bypass (remove in production!)
  agent: new https.Agent({ rejectUnauthorized: false }),
});

// Helper: safely validate MongoDB ObjectId
const getValidId = (val) =>
  val && val !== "undefined" && val !== "null" && val?.length === 24
    ? val
    : null;

/**
 * @desc    Upload new file(s) or replace existing file(s) - supports multiple files
 * @route   POST /api/files
 * @access  Private
 */
export const uploadFile = async (req, res) => {
  try {
    const userId = req.user._id;
    const projectId = getValidId(req.body.projectId);
    const taskId = getValidId(req.body.taskId);
    const isPublic = req.body.isPublic === "true" || req.body.isPublic === true;

    let replaceFileIds = [];
    if (req.body.replaceFileIds) {
      try {
        replaceFileIds = JSON.parse(req.body.replaceFileIds);
      } catch {
        return res.status(400).json({
          success: false,
          message: "replaceFileIds must be a valid JSON array",
        });
      }
    }

    if (!req.files?.length) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }

    if (replaceFileIds.length && replaceFileIds.length !== req.files.length) {
      return res.status(400).json({
        success: false,
        message: "Number of files must match number of replaceFileIds",
      });
    }

    // ── Access validation ────────────────────────────────────────
    let project = null;
    let task = null;

    if (taskId) {
      task = await Task.findById(taskId).select("projectId assignedTo");
      if (!task)
        return res
          .status(404)
          .json({ success: false, message: "Task not found" });

      project = await Project.findById(task.projectId);
      if (!project?.isMember(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to upload to this task",
        });
      }
    } else if (projectId) {
      project = await Project.findById(projectId);
      if (!project?.isMember(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to upload to this project",
        });
      }
    }

    const results = [];
    const errors = [];

    // Process each uploaded file
    await Promise.all(
      req.files.map(async (file, index) => {
        try {
          const isReplace = !!replaceFileIds.length;
          let existingFile = null;

          if (isReplace) {
            existingFile = await File.findById(replaceFileIds[index]);
            if (!existingFile) throw new Error("Replacement file not found");
            if (existingFile.uploadedBy.toString() !== userId.toString()) {
              throw new Error(
                "Only the original uploader can replace this file"
              );
            }
          }

          const originalName = file.originalname.trim();
          let sanitizedName =
            originalName
              .replace(/[^a-zA-Z0-9._-]/g, "_")
              .replace(/_+/g, "_")
              .replace(/^_+|_+$/g, "") || `file_${Date.now()}`;

          const folder = `taskflow/${projectId || taskId || "general"}`;

          const uploadOptions = {
            folder,
            resource_type: "auto",
            invalidate: true,
          };

          if (isReplace && existingFile) {
            const urlParts = existingFile.fileUrl.split("/upload/");
            if (urlParts.length < 2) throw new Error("Invalid Cloudinary URL");
            const oldPublicId = urlParts[1]
              .replace(/^v\d+\//, "")
              .replace(/\.[^.]+$/, "");
            uploadOptions.public_id = oldPublicId;
            uploadOptions.overwrite = true;
          } else {
            uploadOptions.public_id = sanitizedName.replace(/\.[^.]+$/, "");
            uploadOptions.use_filename = true;
            uploadOptions.unique_filename = false;
          }

          const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader
              .upload_stream(uploadOptions, (err, result) =>
                err ? reject(err) : resolve(result)
              )
              .end(file.buffer);
          });

          let fileRecord;

          if (isReplace) {
            fileRecord = await File.findByIdAndUpdate(
              replaceFileIds[index],
              {
                fileName: originalName,
                originalName,
                fileUrl: uploadResult.secure_url,
                thumbnailUrl:
                  uploadResult.resource_type === "image"
                    ? cloudinary.url(uploadResult.public_id, {
                        width: 300,
                        height: 200,
                        crop: "fill",
                      })
                    : null,
                fileType: file.mimetype.split("/")[0],
                mimeType: file.mimetype,
                fileSize: file.size,
                isPublic,
              },
              { new: true }
            ).populate("uploadedBy", "name profilePicture");

            if (taskId) {
              await Task.updateOne(
                { _id: taskId, "attachments._id": replaceFileIds[index] },
                {
                  $set: {
                    "attachments.$.fileName": originalName,
                    "attachments.$.fileUrl": uploadResult.secure_url,
                    "attachments.$.fileType": file.mimetype.split("/")[0],
                    "attachments.$.fileSize": file.size,
                    "attachments.$.thumbnailUrl": fileRecord.thumbnailUrl,
                  },
                }
              );
            }
          } else {
            fileRecord = new File({
              fileName: originalName,
              originalName,
              fileUrl: uploadResult.secure_url,
              thumbnailUrl:
                uploadResult.resource_type === "image"
                  ? cloudinary.url(uploadResult.public_id, {
                      width: 300,
                      height: 200,
                      crop: "fill",
                    })
                  : null,
              fileType: file.mimetype.split("/")[0],
              mimeType: file.mimetype,
              fileSize: file.size,
              uploadedBy: userId,
              projectId: projectId || null,
              taskId: taskId || null,
              isPublic,
            });

            await fileRecord.save();
            await fileRecord.populate("uploadedBy", "name profilePicture");

            if (taskId) {
              await Task.findByIdAndUpdate(taskId, {
                $push: {
                  attachments: {
                    _id: fileRecord._id,
                    fileName: fileRecord.fileName,
                    fileUrl: fileRecord.fileUrl,
                    fileType: fileRecord.fileType,
                    fileSize: fileRecord.fileSize,
                    uploadedBy: userId,
                    uploadedAt: new Date(),
                    thumbnailUrl: fileRecord.thumbnailUrl,
                  },
                },
              });
            }
          }

          results.push(fileRecord);
        } catch (err) {
          console.error(`Error processing file ${file.originalname}:`, err);
          errors.push({
            fileName: file.originalname,
            error: err.message || "Failed to process file",
          });
        }
      })
    );

    // ── Activity Logging ─────────────────────────────────────────
    if (results.length > 0 && (project || task)) {
      const targetProject =
        project || (task && (await Project.findById(task.projectId)));
      const entityId = taskId || projectId;
      const entityType = taskId ? "task" : "project";

      if (targetProject && entityId && entityType) {
        const fileNames = results.map((f) => f.fileName);
        const isReplace = replaceFileIds.length > 0;

        if (isReplace) {
          await ActivityLog.fileReplaced(
            userId,
            entityId,
            entityType,
            targetProject,
            fileNames,
            replaceFileIds
          );
        } else {
          await ActivityLog.fileUploaded(
            userId,
            entityId,
            entityType,
            targetProject,
            fileNames
          );
        }
      }
    }

    // ── Real-time updates (Socket + Notifications) ───────────────
    if (results.length > 0 && (projectId || taskId)) {
      const projectIdLog = projectId || task?.projectId;
      const targetProject = await Project.findById(projectIdLog);
      if (!targetProject) return;

      const memberIdsSet = new Set(
        targetProject.members
          .filter((m) => m.user.toString() !== userId.toString())
          .map((m) => m.user.toString())
      );

      if (taskId && task) {
        task.assignedTo.forEach((id) => {
          const strId = id.toString();
          if (strId !== userId.toString()) memberIdsSet.add(strId);
        });
      }

      const memberIds = Array.from(memberIdsSet);
      const count = results.length;
      const isReplace = replaceFileIds.length > 0;
      const eventName = isReplace ? "file_replaced" : "file_uploaded";

      // Emit socket granularly or broadcast
      const eventData = {
        projectId: projectIdLog,
        taskId: taskId || null,
        files: results.map((f) => ({
          _id: f._id.toString(),
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          thumbnailUrl: f.thumbnailUrl,
          fileType: f.fileType,
          fileSize: f.fileSize,
          uploadedBy: f.uploadedBy?._id?.toString() || userId.toString(),
          uploadedAt: new Date().toISOString(),
        })),
        count,
        replacedFileIds: isReplace ? replaceFileIds : undefined,
        uploadedBy: userId.toString(),
      };

      if (taskId && task) {
        // Enforce visibility for task-specific files
        const adminIds = targetProject.members
          .filter((m) => m.role === "admin")
          .map((m) => m.user.toString());
        
        const authorizedUserIds = new Set([
          targetProject.owner.toString(),
          ...adminIds,
          ...(task.assignedTo || []).map(id => id.toString())
        ]);
        
        emitToMultipleUsers(Array.from(authorizedUserIds), eventName, eventData);
      } else {
        // Global project files: broadcast to all members
        emitSocketEvent(`project:${projectIdLog}`, eventName, eventData);
      }

      // Notifikasi
      const fileNames = results.map((f) => f.fileName);
      // const isReplace = replaceFileIds.length > 0;
      
      await createProjectNotification({
        project: targetProject,
        sender: userId,
        type: "ATTACHMENT_UPLOADED",
        message: `${req.user.name} ${isReplace ? "replaced" : "uploaded"} ${count} file(s) in project "${targetProject.name}": ${fileNames.join(", ")}`,
        relatedId: taskId || projectIdLog,
        relatedModel: taskId ? "Task" : "Project",
        link: taskId 
          ? `/app/projects/${projectIdLog}/tasks/${taskId}`
          : `/app/projects/${projectIdLog}`,
        details: {
            files: results.map(f => ({
                name: f.fileName,
                url: f.fileUrl,
                type: f.fileType,
                size: f.fileSize
            }))
        }
      });
    }

    // Final response
    res.status(results.length ? 201 : 207).json({
      success: !!results.length,
      message: results.length
        ? `${results.length} file(s) successfully ${
            replaceFileIds.length ? "replaced" : "uploaded"
          }`
        : "All files failed to upload",
      data: results,
      failed: errors.length ? errors : undefined,
    });
  } catch (error) {
    console.error("Upload/Replace file error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error during file upload" });
  }
};

/**
 * @desc    Delete a file
 * @route   DELETE /api/files/:id
 * @access  Private
 */
export const deleteFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user._id;

    const file = await File.findById(fileId);
    if (!file)
      return res
        .status(404)
        .json({ success: false, message: "File not found" });

    // Permission check
    let hasAccess = file.uploadedBy.toString() === userId.toString();

    if (!hasAccess) {
      if (file.taskId) {
        const task = await Task.findById(file.taskId)
          .select("projectId assignedTo")
          .lean();
        if (task) {
          if (task.assignedTo?.some((a) => a.toString() === userId.toString()))
            hasAccess = true;
          else {
            const project = await Project.findById(task.projectId);
            if (project?.isMember(userId)) hasAccess = true;
          }
        }
      } else if (file.projectId) {
        const project = await Project.findById(file.projectId);
        if (project?.isMember(userId)) hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this file",
      });
    }

    // Delete from Cloudinary (non-blocking)
    try {
      const urlParts = file.fileUrl.split("/upload/");
      if (urlParts.length >= 2) {
        const publicId = urlParts[1].replace(/^v\d+\//, "").split("?")[0];
        cloudinary.uploader
          .destroy(publicId, { invalidate: true })
          .catch(console.warn);
      }
    } catch (err) {
      console.warn("Failed to delete from Cloudinary:", err.message);
    }

    // Remove from task attachments if applicable
    if (file.taskId) {
      await Task.findByIdAndUpdate(file.taskId, {
        $pull: { attachments: { _id: file._id } },
      });
    }

    // ── Activity Log ─────────────────────────────────────────────
    const entityId = file.taskId || file.projectId;
    const entityType = file.taskId ? "task" : file.projectId ? "project" : null;

    let targetProject = null;
    if (entityId && entityType) {
      targetProject = file.projectId
        ? await Project.findById(file.projectId)
        : file.taskId
        ? (await Task.findById(file.taskId))?.projectId
          ? await Project.findById((await Task.findById(file.taskId)).projectId)
          : null
        : null;

      if (targetProject) {
        await ActivityLog.fileDeleted(
          userId,
          file._id,
          file.fileName,
          entityId,
          entityType,
          targetProject
        );
      }
    }

    // ── Real-time Socket & Notification ──────────────────────────
    const projectIdLog =
      file.projectId || (await Task.findById(file.taskId))?.projectId;
    if (projectIdLog) {
      const project = await Project.findById(projectIdLog);
      if (project) {
        let memberIds = project.members
          .filter((m) => m.user.toString() !== userId.toString())
          .map((m) => m.user.toString());

        if (file.taskId) {
          const task = await Task.findById(file.taskId);
          if (task) {
            task.assignedTo.forEach((id) => {
              const strId = id.toString();
              if (strId !== userId.toString() && !memberIds.includes(strId)) {
                memberIds.push(strId);
              }
            });
          }
        }

        // Notifikasi removed

        // Socket emission
        const eventData = {
          projectId: projectIdLog,
          taskId: file.taskId || null,
          fileId: file._id.toString(),
          fileName: file.fileName,
          fileType: file.fileType,
          deletedBy: userId.toString(),
          deletedAt: new Date().toISOString(),
        };

        if (file.taskId) {
           const task = await Task.findById(file.taskId).select("assignedTo");
           const adminIds = project.members
            .filter((m) => m.role === "admin")
            .map((m) => m.user.toString());
          
          const authorizedUserIds = new Set([
            project.owner.toString(),
            ...adminIds,
            ...(task?.assignedTo || []).map(id => id.toString())
          ]);
          
          emitToMultipleUsers(Array.from(authorizedUserIds), "file_deleted", eventData);
        } else {
          emitSocketEvent(`project:${projectIdLog}`, "file_deleted", eventData);
        }
      }
    }

    // Delete from database
    await file.deleteOne();

    res.json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({ success: false, message: "Failed to delete file" });
  }
};

// ── Other endpoints (cleaned up) ────────────────────────────────────────

export const getFiles = async (req, res) => {
  try {
    const userId = req.user._id;
    const { projectId, taskId, page = 1, limit = 20 } = req.query;

    const query = { uploadedBy: userId };

    if (projectId) {
      const project = await Project.findById(projectId);
      if (!project?.isMember(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view project files",
        });
      }
      query.projectId = projectId;
    }

    if (taskId) {
      const task = await Task.findById(taskId);
      if (task) {
        const project = await Project.findById(task.projectId);
        if (!project?.isMember(userId)) {
          return res.status(403).json({
            success: false,
            message: "Not authorized to view task files",
          });
        }
      }
      query.taskId = taskId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const files = await File.find(query)
      .populate("uploadedBy", "name profilePicture")
      .populate("projectId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await File.countDocuments(query);

    res.json({
      success: true,
      data: files,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get files error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id)
      .populate("uploadedBy", "name profilePicture")
      .populate("projectId", "name");

    if (!file)
      return res
        .status(404)
        .json({ success: false, message: "File not found" });

    const userId = req.user._id;
    if (file.uploadedBy._id.toString() !== userId.toString()) {
      if (file.projectId) {
        const project = await Project.findById(file.projectId);
        if (!project?.isMember(userId)) {
          return res.status(403).json({
            success: false,
            message: "Not authorized to access this file",
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access this file",
        });
      }
    }

    file.incrementDownload();
    await file.save();

    res.json({ success: true, data: file });
  } catch (error) {
    console.error("Get file error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
