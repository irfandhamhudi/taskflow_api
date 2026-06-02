import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import ActivityLog from "../models/ActivityLog.js";
import { emitSocketEvent, emitToUser, emitToMultipleUsers } from "../utils/socketHandler.js";
import { createNotification, createProjectNotification } from "./notificationController.js";

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
export const createTask = async (req, res) => {
  try {
    const {
      projectId,
      title,
      description,
      status,
      priority,
      tags,
      startDate,
      dueDate,
      assignedTo,
      subtasks,
      isArchived = false, // ← BARIS BARU
    } = req.body;

    const userId = req.user._id;

    // Check if project exists and user has access
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (project.visibility !== "public") {
      // Private atau limited → minimal harus editor
      if (!project.hasPermission(userId, "editor")) {
        return res.status(403).json({
          success: false,
          message:
            "You need at least editor role to create tasks in this project",
        });
      }
    }

    // Create task
    const task = new Task({
      projectId,
      title,
      description,
      status: status || project.settings?.defaultTaskStatus || "todo",
      priority: priority || project.settings?.defaultTaskPriority || "medium",
      tags,
      startDate,
      dueDate,
      assignedTo,
      createdBy: userId,
      subtasks: subtasks || [],
      isArchived, // ← BARIS BARU
    });

    // Set order (last position)
    const lastTask = await Task.findOne({ projectId })
      .sort({ order: -1 })
      .limit(1);

    task.order = lastTask ? lastTask.order + 1 : 0;

    await task.save();

    // Populate task data
    const populatedTask = await Task.findById(task._id)
      .populate("projectId", "name color")
      .populate("assignedTo", "name email profilePicture")
      .populate("createdBy", "name email profilePicture")
      .lean(); // penting agar bisa modifikasi

    // Tambahkan field yang tidak dipopulate
    populatedTask.isArchived = task.isArchived;
    populatedTask.order = task.order;
    populatedTask.archivedAt = task.archivedAt;

    // Notifikasi ke assigned users
    if (assignedTo && assignedTo.length > 0) {
      const roleMap = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
      const userRole = project.getUserRole(userId);
      const roleName = roleMap[userRole] || "Member";
      
      const priorityMap = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
      const priorityName = priorityMap[task.priority] || task.priority;
      const dueDateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { day: 'numeric', month: 'long', year: 'numeric' }) : "None";

      await Promise.all(
        assignedTo.map(async (assigneeId) => {
          if (assigneeId.toString() !== userId.toString()) {
            await createNotification({
              recipient: assigneeId,
              sender: userId,
              type: "TASK_ASSIGNED",
              message: `You were assigned to task: '${task.title}' by ${req.user.name} (${roleName}). Due date: ${dueDateStr}. Priority: ${priorityName}.`,
              relatedId: task._id,
              relatedModel: "Task",
              link: `/projects/${projectId}/tasks/${task._id}`,
              details: { 
                taskTitle: task.title, 
                projectName: project.name 
              }
            });
          }
        }),
      );
    }

    // 1. Notifikasi ke creator sendiri (Removed)
    /*
    await Notification.createTaskNotification(...)
    */

    // 2. Notifikasi ke semua member project lain (opsional, kalau ingin semua tahu ada task baru)
    const memberIds = project.members
      .map((m) => m.user.toString())
      .filter((id) => id !== userId.toString());

    // Notifikasi ke semua member project
    await createProjectNotification({
      project,
      sender: userId,
      type: "TASK_CREATED",
      message: `${req.user.name} created a new task: "${task.title}" in project "${project.name}".`,
      relatedId: task._id,
      relatedModel: "Task",
      link: `/projects/${projectId}/tasks/${task._id}`,
      details: {
        taskTitle: task.title,
        status: task.status,
        priority: task.priority
      },
    });

    // Log activity
    // await ActivityLog.logTaskActivity(userId, "create", task._id, projectId, {
    //   taskTitle: task.title,
    //   projectName: project.name,
    //   assignedTo: assignedTo || [],
    // });
    await ActivityLog.taskCreated(userId, task, project);

    // Emit socket event
    emitSocketEvent(`project:${projectId}`, "task_created", {
      projectId,
      task: populatedTask,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: populatedTask,
    });
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get tasks with filtering
// @route   GET /api/tasks
// @access  Private
export const getTasks = async (req, res) => {
  try {
    const {
      projectId,
      status,
      priority,
      assignedTo,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      overdue = false,
      includeArchived = false,
    } = req.query;

    const userId = req.user._id;

    // Build query
    const query = {};
    const { workspaceId } = req.query;

    if (projectId) {
      // Check if user has access to this project
      const project = await Project.findById(projectId);
      if (!project || !project.isMember(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access tasks in this project",
        });
      }
      query.projectId = projectId;
    } else {
      // Get all projects user has access to, optionally filtered by workspace
      const projectFilter = {
        $or: [{ owner: userId }, { "members.user": userId }],
        isDeleted: { $ne: true },
      };

      if (workspaceId) {
        projectFilter.workspaceId = workspaceId;
      }

      const userProjects = await Project.find(projectFilter).select("_id");
      const projectIds = userProjects.map((p) => p._id);
      
      query.projectId = { $in: projectIds };
    }

    // Additional filters
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (overdue === "true") {
      query.dueDate = { $lt: new Date() };
      query.status = { $ne: "done" };
    }
    if (includeArchived !== "true") {
      query.isArchived = false;
    }
    // Always filter out deleted items unless specifically requested (though trash has its own controller)
    query.isDeleted = { $ne: true };

    // Search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute query
    const tasks = await Task.find(query)
      .populate("projectId", "name color icon")
      .populate("assignedTo", "name email profilePicture")
      .populate("createdBy", "name email profilePicture")
      .populate("subtasks.completedBy", "name")
      .populate("comments.user", "name profilePicture")
      .populate("attachments.uploadedBy", "name profilePicture")
      .populate({
        path: "comments.replies.user", // ← ini yang benar!
        select: "name profilePicture",
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Task.countDocuments(query);

    // Calculate task statistics
    const stats = {
      total,
      todo: await Task.countDocuments({ ...query, status: "todo" }),
      inprogress: await Task.countDocuments({ ...query, status: "inprogress" }),
      done: await Task.countDocuments({ ...query, status: "done" }),
      review: await Task.countDocuments({ ...query, status: "review" }),
      low: await Task.countDocuments({ ...query, priority: "low" }),
      medium: await Task.countDocuments({ ...query, priority: "medium" }),
      high: await Task.countDocuments({ ...query, priority: "high" }),
      urgent: await Task.countDocuments({ ...query, priority: "urgent" }),
      overdue: await Task.countDocuments({
        ...query,
        dueDate: { $lt: new Date() },
        status: { $ne: "done" },
      }),
    };

    res.json({
      success: true,
      data: tasks,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
export const getTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;

    const task = await Task.findById(taskId)
      .populate("projectId", "name color owner members")
      .populate("assignedTo", "name email profilePicture")
      .populate("createdBy", "name email profilePicture")
      .populate("subtasks.completedBy", "name")
      .populate("comments.user", "name profilePicture")
      .populate("attachments.uploadedBy", "name profilePicture")
      .populate("attachments.uploadedBy", "name profilePicture")
      .populate({
        path: "comments.replies.user",
        select: "name profilePicture",
      });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check if user has access to the project
    const project = task.projectId;
    const userRole = project.getUserRole(userId);

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this task",
      });
    }

    // No visibility restriction: all members can see the task

    // Calculate progress
    const taskObj = task.toObject();
    taskObj.progress = task.calculateProgress();
    taskObj.isOverdue = task.isOverdue();

    res.json({
      success: true,
      data: taskObj,
    });
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
export const updateTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;
    const updateData = req.body;

    // 1. Cari task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // 2. Cari project dan cek akses
    const project = await Project.findById(task.projectId);
    if (!project || !project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this task",
      });
    }

    // 3. Permission check: Minimal editor untuk project private/limited
    if (project.visibility !== "public") {
      if (!project.hasPermission(userId, "editor")) {
        return res.status(403).json({
          success: false,
          message:
            "You need at least editor role to edit tasks in this project",
        });
      }
    }

    // 3.1. Circular dependency check
    if (updateData.dependencies && updateData.dependencies.length > 0) {
      // Pastikan tidak ada ID diri sendiri
      if (updateData.dependencies.includes(taskId)) {
        return res.status(400).json({
          success: false,
          message: "A task cannot depend on itself",
        });
      }

      // Check for circular dependency (simple path check)
      const checkCircular = async (targetId, visited = new Set()) => {
        if (targetId.toString() === taskId.toString()) return true;
        if (visited.has(targetId.toString())) return false;
        visited.add(targetId.toString());

        const depTask = await Task.findById(targetId).select("dependencies");
        if (!depTask || !depTask.dependencies) return false;

        for (const nextId of depTask.dependencies) {
          if (await checkCircular(nextId, visited)) return true;
        }
        return false;
      };

      for (const depId of updateData.dependencies) {
        if (await checkCircular(depId)) {
          return res.status(400).json({
            success: false,
            message: "Circular dependency detected",
          });
        }
      }
    }

    // 4. Deteksi perubahan (changes array)
    const changes = [];
    // Fix: Convert assignedTo ObjectIds to strings for comparison
    const oldAssignedTo = (task.assignedTo || []).map(id => id.toString());

    // Proses hanya field yang dikirim di body
    for (const key of Object.keys(updateData)) {
      // Lewati field sistem
      if (["_id", "projectId", "createdBy", "__v"].includes(key)) continue;

      const oldValue = task[key];
      const newValue = updateData[key];

      let isDifferent = false;

      // Khusus tanggal: bandingkan format yyyy-mm-dd
      if (key === "startDate" || key === "dueDate") {
        const oldDate = oldValue
          ? new Date(oldValue).toISOString().split("T")[0]
          : null;
        const newDate = newValue
          ? new Date(newValue).toISOString().split("T")[0]
          : null;
        isDifferent = oldDate !== newDate;
      }
      // Array (assignedTo, tags)
      else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        if (key === "assignedTo") {
           // Special handling for assignedTo: compare arrays of strings
           const oldSorted = [...oldAssignedTo].sort();
           const newSorted = [...newValue].map(id => id.toString()).sort();
           isDifferent = JSON.stringify(oldSorted) !== JSON.stringify(newSorted);
        } else {
           const oldSorted = [...oldValue].sort();
           const newSorted = [...newValue].sort();
           isDifferent = JSON.stringify(oldSorted) !== JSON.stringify(newSorted);
        }
      }
      // Lainnya
      else {
        isDifferent = JSON.stringify(oldValue) !== JSON.stringify(newValue);
      }

      if (isDifferent) {
        let enrichedChange = {
          field: key,
          oldValue,
          newValue,
        };

        // Khusus assignedTo: enrich dengan nama user added/removed
        if (key === "assignedTo") {
          // Compare strings strict
          const oldIds = oldAssignedTo; // Already strings
          const newIds = newValue.map(id => id.toString());

          const addedIds = newIds.filter(id => !oldIds.includes(id));
          const removedIds = oldIds.filter(id => !newIds.includes(id));

          console.log(`Debug assignedTo: Old=[${oldIds}], New=[${newIds}]`);
          console.log(`Debug assignedTo: Added=[${addedIds}], Removed=[${removedIds}]`);

          const addedUsers = await User.find({ _id: { $in: addedIds } }).select(
            "name profilePicture",
          );
          const removedUsers = await User.find({
            _id: { $in: removedIds },
          }).select("name profilePicture");

          console.log(`[DEBUG] Task Update - AssignedTo Change Detected:`);
          console.log(` - Old: [${oldIds}]`);
          console.log(` - New: [${newIds}]`);
          console.log(` - Added: [${addedIds}]`);
          console.log(` - Removed: [${removedIds}]`);

          enrichedChange = {
            ...enrichedChange,
            addedUsers: addedUsers.map((u) => ({
              id: u._id.toString(),
              name: u.name,
              profilePicture: u.profilePicture,
            })),
            removedUsers: removedUsers.map((u) => ({
              id: u._id.toString(),
              name: u.name,
              profilePicture: u.profilePicture,
            })),
          };
        }

        changes.push(enrichedChange);

        // Simpan history untuk field penting
        if (
          [
            "title",
            "description",
            "status",
            "priority",
            "dueDate",
            "startDate",
            "assignedTo",
            "tags",
            "reminders",
          ].includes(key)
        ) {
          task.addHistory(key, oldValue, newValue, userId);
        }

        // Terapkan perubahan ke task
        task[key] = newValue;
      }
    }

    // Handle status change → set completedAt jika status jadi "done"
    if (updateData.status && updateData.status !== task.status) {
      if (updateData.status === "done" && !task.completedAt) {
        task.completedAt = new Date();
      } else if (updateData.status !== "done" && task.completedAt) {
        task.completedAt = undefined;
      }
    }

    await task.save();

    // Populate task terbaru untuk response
    const updatedTask = await Task.findById(task._id)
      .populate("projectId", "name color")
      .populate("assignedTo", "name email profilePicture")
      .populate("createdBy", "name email profilePicture");

    // 1. Notifikasi khusus: User yang BARU ditugaskan
    if (updateData.assignedTo) {
      // Logic notifikasi existing...
      const oldIds = oldAssignedTo;
      const newIds = updateData.assignedTo.map(id => id.toString());
      const addedIds = newIds.filter(id => !oldIds.includes(id));

      if (addedIds.length > 0) {
        await Promise.all(
          addedIds.map(async (assigneeId) => {
            if (assigneeId.toString() !== userId.toString()) {
               await createNotification({
                recipient: assigneeId,
                sender: userId,
                type: "TASK_ASSIGNED",
                message: `You were assigned to task: '${task.title}' by ${req.user.name}.`,
                relatedId: task._id,
                relatedModel: "Task",
                link: `/projects/${project._id}/tasks/${task._id}`,
                details: { 
                  taskTitle: task.title, 
                  projectName: project.name 
                }
              });
            }
          })
        );
      }
    }

    // 3. Log activity dengan changes yang sudah di-enrich
    if (changes.length > 0) {
      await ActivityLog.taskUpdated(
        userId,
        task,
        project,
        changes, // sudah punya addedUsers/removedUsers jika assignedTo
      );

      // Build detailed message
      const changesSummary = changes
        .map((c) => {
          const fieldName = c.field.charAt(0).toUpperCase() + c.field.slice(1);
          if (c.field === "assignedTo") {
            const added = c.addedUsers?.map((u) => u.name).join(", ");
            const removed = c.removedUsers?.map((u) => u.name).join(", ");
            let msg = "";
            if (added) msg += `added ${added}`;
            if (removed) msg += (msg ? " and " : "") + `removed ${removed}`;
            return `${fieldName}: ${msg}`;
          }
          if (c.field === "reminders") {
            const oldCount = Array.isArray(c.oldValue) ? c.oldValue.length : 0;
            const newCount = Array.isArray(c.newValue) ? c.newValue.length : 0;
            return `Reminders: ${oldCount} -> ${newCount}`;
          }
          return `${fieldName}: changed to "${c.newValue}"`;
        })
        .join("; ");

      // Notifikasi ke semua member project
      await createProjectNotification({
        project,
        sender: userId,
        type: "TASK_UPDATED",
        message: `${req.user.name} updated task "${task.title}" in project "${project.name}"`,
        relatedId: task._id,
        relatedModel: "Task",
        link: `/projects/${project._id}/tasks/${task._id}`,
        details: { changes }
      });
    }

    // 4. Emit socket
    emitSocketEvent(`project:${project._id}`, "task_updated", {
      projectId: task.projectId.toString(),
      taskId: task._id.toString(),
      task: updatedTask,
      updatedBy: userId,
      changes: changes.map((c) => c.field),
    });

    res.json({
      success: true,
      message: "Task updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating task",
      error: error.message,
    });
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
export const deleteTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check project access and permissions
    const project = await Project.findById(task.projectId);
    if (!project || !project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this task",
      });
    }

    // Only admins and task creator can delete
    const userRole = project.getUserRole(userId);
    const isCreator = task.createdBy.toString() === userId.toString();

    if (userRole !== "admin" && userRole !== "owner" && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this task",
      });
    }

    // Store task info for activity log
    const taskInfo = {
      title: task.title,
      projectName: project.name,
    };

    // Soft delete task
    task.isDeleted = true;
    task.deletedAt = new Date();
    await task.save();

    // // Log activity
    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "delete",
    //   taskId,
    //   task.projectId,
    //   taskInfo
    // );
    // Menjadi:
    await ActivityLog.taskDeleted(
      userId,
      task._id, // atau taskId
      task.title,
      project,
    );

    // Notifikasi ke semua member project
    await createProjectNotification({
      project,
      sender: userId,
      type: "TASK_DELETED",
      message: `Task "${task.title}" in project "${project.name}" was moved to trash by ${req.user.name}.`,
      relatedId: task._id,
      relatedModel: "Task",
    });

    // Emit socket event
    emitSocketEvent(`project:${project._id}`, "task_deleted", {
      projectId: task.projectId,
      taskId,
      deletedBy: userId,
    });

    res.json({
      success: true,
      message: "Task moved to trash successfully",
    });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update task status
// @route   PATCH /api/tasks/:id/status
// @access  Private
export const updateTaskStatus = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;
    const { status, order } = req.body;

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const project = await Project.findById(task.projectId);
    if (!project || !project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this task",
      });
    }

    // === PERMISSION CHECK UNTUK UBAH STATUS ===
    if (project.visibility !== "public") {
      if (!project.hasPermission(userId, "editor")) {
        return res.status(403).json({
          success: false,
          message: "You need at least editor role to update task status",
        });
      }
    }

    // Update status
    const oldStatus = task.status;
    task.status = status;

    // Update order if provided (for drag & drop)
    if (order !== undefined) {
      task.order = order;
    }

    // Handle completion
    if (status === "done" && !task.completedAt) {
      task.completedAt = new Date();
    } else if (status !== "done" && task.completedAt) {
      task.completedAt = undefined;
    }

    // Add to history
    task.addHistory("status", oldStatus, status, userId);

    await task.save();

    // Populate updated task
    const updatedTask = await Task.findById(task._id)
      .populate("projectId", "name color")
      .populate("assignedTo", "name email profilePicture");

    // Send specific notifications
    const statusMap = { todo: "Todo", inprogress: "In Progress", review: "Review", done: "Done" };
    const statusName = statusMap[status] || status;

    // 1. Notifikasi Perubahan Status (Umum)
    if (status !== oldStatus) {
      const notifyUserIds = new Set();
      // Notify creator
      notifyUserIds.add(task.createdBy.toString());
      // Notify assignees
      task.assignedTo.forEach(a => {
        notifyUserIds.add(a.toString());
      });

      await Promise.all(Array.from(notifyUserIds).map(async (targetId) => {
        await createNotification({
          recipient: targetId,
          sender: userId,
          type: "TASK_UPDATED",
          message: `Task "${task.title}" status changed to "${statusName}" by ${req.user.name}.`,
          relatedId: task._id,
          relatedModel: "Task",
          link: `/projects/${project._id}/tasks/${task._id}`,
          details: { 
            taskTitle: task.title,
            status: status,
            oldStatus: oldStatus
          },
        });
      }));
    }

    // 2. Notifikasi Task Selesai & Dependencies
    if (status === "done" && oldStatus !== "done") {
      // Notify followers (and creator)
      const followerIds = new Set(task.followers?.map(f => f.toString()) || []);
      if (task.createdBy.toString() !== userId.toString()) followerIds.add(task.createdBy.toString());

      await Promise.all(Array.from(followerIds).map(async (targetId) => {
        await createNotification({
          recipient: targetId,
          sender: userId,
          type: "TASK_COMPLETED",
          message: `Task "${task.title}" has been completed by ${req.user.name}! 🎉`,
          relatedId: task._id,
          relatedModel: "Task",
          link: `/projects/${project._id}/tasks/${task._id}`,
          details: { 
            taskTitle: task.title,
            projectName: project.name
          }
        });
      }));
      
      /*
      await Promise.all(Array.from(followerIds).map(async (targetId) => {
        await createNotification({
          recipient: targetId,
          sender: userId,
          type: "task_completed",
          message: `Task '${task.title}' telah diselesaikan oleh ${req.user.name}. Semua checklist sudah centang. Anda diberitahu.`,
          data: { taskId: task._id, projectId: project._id },
        });
      }));
      */

      // NOTIFY SUCCESSORS (Tasks that depend on this one)
      const successors = await Task.find({ dependencies: task._id, isArchived: false }).populate("assignedTo");
      await Promise.all(successors.map(async (successor) => {
        /*
        await Promise.all(successor.assignedTo.map(async (assignee) => {
          if (assignee._id.toString() !== userId.toString()) {
            await createNotification({
              recipient: assignee._id,
              sender: userId,
              type: "task_predecessor_completed",
              message: `Task predecessor '${task.title}' telah selesai. Task Anda '${successor.title}' sekarang bisa dikerjakan.`,
              data: { taskId: successor._id, projectId: project._id, predecessorId: task._id },
            });
          }
        }));
        */
      }));
    }

    // Log activity
    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "update",
    //   task._id,
    //   task.projectId,
    //   {
    //     taskTitle: task.title,
    //     projectName: project.name,
    //     field: "status",
    //     oldValue: oldStatus,
    //     newValue: status,
    //   }
    // );
    // Menjadi:
    await ActivityLog.taskStatusChanged(
      userId,
      task,
      project,
      oldStatus,
      status,
    );

    // Emit socket event
    emitSocketEvent(`project:${project._id}`, "task_status_updated", {
      projectId: task.projectId,
      taskId: task._id,
      oldStatus,
      newStatus: status,
      updatedBy: userId,
      task: updatedTask,
    });

    res.json({
      success: true,
      message: "Task status updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Update task status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Add subtask to task
// @route   POST /api/tasks/:id/subtasks
// @access  Private
export const addSubtask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;
    const { title } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Subtask title is required",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // === TAMBAHKAN QUERY PROJECT ===
    const project = await Project.findById(task.projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (!project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to add subtasks to this task",
      });
    }

    // === PERMISSION CHECK ===
    if (project.visibility !== "public") {
      if (!project.hasPermission(userId, "editor")) {
        return res.status(403).json({
          success: false,
          message: "You need at least editor role to add subtasks",
        });
      }
    }

    // Add subtask
    task.addSubtask(title.trim());
    await task.save();

    // Get updated task
    const updatedTask = await Task.findById(taskId)
      .populate("projectId", "name icon")
      .populate("subtasks.completedBy", "name profilePicture");

    const newSubtask = task.subtasks[task.subtasks.length - 1];

    // Log activity
    // // addSubtask
    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "create",
    //   task._id,
    //   task.projectId,
    //   {
    //     taskTitle: task.title,
    //     subtaskTitle: title.trim(),
    //   }
    // );
    // Menjadi:
    await ActivityLog.subtaskCreated(userId, task, project, title.trim());

    // Emit socket event granularly
    const adminIds = project.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      project.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "subtask_added", {
      projectId: task.projectId,
      taskId: task._id,
      subtask: newSubtask.toObject(),
      addedBy: userId,
    });

    res.json({
      success: true,
      message: "Subtask added successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Add subtask error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Delete subtask from task
// @route   DELETE /api/tasks/:taskId/subtasks/:subtaskId
// @access  Private
export const deleteSubtask = async (req, res) => {
  try {
    const { taskId, subtaskId } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const project = await Project.findById(task.projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (!project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to modify this task",
      });
    }

    // Permission check
    if (project.visibility !== "public") {
      if (!project.hasPermission(userId, "editor")) {
        return res.status(403).json({
          success: false,
          message: "You need at least editor role to delete subtasks",
        });
      }
    }

    // Cari subtask
    const subtask = task.subtasks.id(subtaskId);
    if (!subtask) {
      return res.status(404).json({
        success: false,
        message: "Subtask not found",
      });
    }

    const subtaskTitle = subtask.title;

    // Hapus subtask dari array
    task.subtasks.pull(subtaskId);
    await task.save();

    // Populate updated task
    const updatedTask = await Task.findById(taskId)
      .populate("projectId", "name icon")
      .populate("subtasks.completedBy", "name profilePicture");

    // Log activity
    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "delete",
    //   task._id,
    //   task.projectId,
    //   {
    //     taskTitle: task.title,
    //     projectName: project.name,
    //     action: "delete_subtask",
    //     subtaskTitle,
    //   }
    // );
    // Menjadi:
    await ActivityLog.subtaskDeleted(userId, task, project, subtaskTitle);

    // Emit socket event granularly
    const adminIds = project.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      project.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "subtask_deleted", {
      projectId: task.projectId,
      taskId: task._id,
      subtaskId,
      deletedBy: userId,
    });

    res.json({
      success: true,
      message: "Subtask deleted successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Delete subtask error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Toggle subtask completion
// @route   PATCH /api/tasks/:taskId/subtasks/:subtaskId/toggle
// @access  Private
export const toggleSubtask = async (req, res) => {
  try {
    const { taskId, subtaskId } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // === TAMBAHKAN INI: Ambil project ===
    const project = await Project.findById(task.projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check access ke project
    if (!project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this task",
      });
    }

    // === PERMISSION CHECK UNTUK TOGGLE SUBTASK ===
    if (project.visibility !== "public") {
      if (!project.hasPermission(userId, "editor")) {
        return res.status(403).json({
          success: false,
          message: "You need at least editor role to toggle subtasks",
        });
      }
    }

    // Toggle subtask
    task.toggleSubtask(subtaskId, userId);
    await task.save();

    // Get updated task dengan populate
    const updatedTask = await Task.findById(taskId)
      .populate("projectId", "name")
      .populate("subtasks.completedBy", "name profilePicture");

    // Cari subtask yang baru di-toggle untuk log & socket
    const subtask = task.subtasks.id(subtaskId);

    // // Log activity
    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "update",
    //   task._id,
    //   task.projectId,
    //   {
    //     taskTitle: task.title,
    //     projectName: project.name,
    //     action: "toggle_subtask",
    //     subtaskTitle: subtask?.title,
    //     completed: subtask?.completed,
    //   }
    // );
    // Ganti blok log lama dengan conditional seperti ini:
    if (subtask.completed) {
      await ActivityLog.subtaskCompleted(userId, task, project, subtask.title);
    } else {
      await ActivityLog.subtaskIncompleted(
        userId,
        task,
        project,
        subtask.title,
      );
    }

    // Emit socket event granularly
    const adminIds = project.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      project.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "subtask_toggled", {
      projectId: task.projectId,
      taskId: task._id,
      subtaskId,
      completed: subtask?.completed,
      toggledBy: userId,
      subtask: subtask?.toObject(),
    });

    res.json({
      success: true,
      message: "Subtask updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Toggle subtask error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Archive/unarchive task
// @route   PATCH /api/tasks/:id/archive
// @access  Private
export const archiveTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;
    const { archive } = req.body; // true atau false

    // Ambil task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Ambil project dari task.projectId ← INI YANG HILANG!
    const project = await Project.findById(task.projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check akses ke project
    if (!project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to archive this task",
      });
    }

    // Permission check: minimal editor untuk private/limited
    if (project.visibility !== "public") {
      if (!project.hasPermission(userId, "editor")) {
        return res.status(403).json({
          success: false,
          message:
            "You need at least editor role to archive tasks in this project",
        });
      }
    }

    // Update status archive
    task.isArchived = archive;
    if (archive) {
      task.archivedAt = new Date();
    } else {
      task.archivedAt = undefined;
    }

    await task.save();

    // // Log activity
    // await ActivityLog.logTaskActivity(
    //   userId,
    //   "update",
    //   task._id,
    //   task.projectId,
    //   {
    //     taskTitle: task.title,
    //     projectName: project.name,
    //     action: archive ? "archived" : "unarchived",
    //   }
    // );
    if (archive) {
      await ActivityLog.taskArchived(userId, task, project);
    } else {
      await ActivityLog.taskUnarchived(userId, task, project);
    }

    // Emit socket event granularly
    const adminIds = project.members
      .filter((m) => m.role === "admin")
      .map((m) => m.user.toString());
    
    const authorizedUserIds = new Set([
      project.owner.toString(),
      ...adminIds,
      ...(task.assignedTo || []).map(id => id.toString())
    ]);

    emitToMultipleUsers(Array.from(authorizedUserIds), "task_archived", {
      projectId: task.projectId,
      taskId: task._id,
      isArchived: task.isArchived,
      updatedBy: userId,
    });

    res.json({
      success: true,
      message: archive
        ? "Task archived successfully"
        : "Task unarchived successfully",
      data: { taskId: task._id, isArchived: task.isArchived },
    });
  } catch (error) {
    console.error("Archive task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get task statistics
// @route   GET /api/tasks/stats
// @access  Private
export const getTaskStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const { projectId } = req.query;

    // Get user's projects
    let projectIds = [];
    if (projectId) {
      // Check if user has access to this project
      const project = await Project.findById(projectId);
      if (!project || !project.isMember(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access this project",
        });
      }
      projectIds = [projectId];
    } else {
      const userProjects = await Project.find({
        $or: [{ owner: userId }, { "members.user": userId }],
        // isArchived: false,
      }).select("_id");

      projectIds = userProjects.map((p) => p._id);
    }

    // Build query
    const query = {
      projectId: { $in: projectIds },
      isArchived: false,
    };

    // Get statistics
    const [
      totalTasks,
      todoTasks,
      inprogressTasks,
      doneTasks,
      reviewTasks,
      lowPriority,
      mediumPriority,
      highPriority,
      urgentPriority,
      overdueTasks,
      tasksDueThisWeek,
      tasksDueToday,
    ] = await Promise.all([
      Task.countDocuments(query),
      Task.countDocuments({ ...query, status: "todo" }),
      Task.countDocuments({ ...query, status: "inprogress" }),
      Task.countDocuments({ ...query, status: "done" }),
      Task.countDocuments({ ...query, status: "review" }),
      Task.countDocuments({ ...query, priority: "low" }),
      Task.countDocuments({ ...query, priority: "medium" }),
      Task.countDocuments({ ...query, priority: "high" }),
      Task.countDocuments({ ...query, priority: "urgent" }),
      Task.countDocuments({
        ...query,
        dueDate: { $lt: new Date() },
        status: { $ne: "done" },
      }),
      Task.countDocuments({
        ...query,
        dueDate: {
          $gte: new Date(),
          $lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        status: { $ne: "done" },
      }),
      Task.countDocuments({
        ...query,
        dueDate: {
          $gte: new Date(),
          $lt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        status: { $ne: "done" },
      }),
    ]);

    const stats = {
      total: totalTasks,
      byStatus: {
        todo: todoTasks,
        inprogress: inprogressTasks,
        done: doneTasks,
        review: reviewTasks,
      },
      byPriority: {
        low: lowPriority,
        medium: mediumPriority,
        high: highPriority,
        urgent: urgentPriority,
      },
      timeline: {
        overdue: overdueTasks,
        dueThisWeek: tasksDueThisWeek,
        dueToday: tasksDueToday,
      },
      completionRate:
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get task stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get activity logs for a specific task
// @route   GET /api/tasks/:id/activity
// @access  Private
export const getTaskActivity = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;

    // Ambil task dengan field yang diperlukan untuk ekstrak ID dan title
    const task = await Task.findById(taskId)
      .select("projectId title subtasks comments attachments")
      .populate("attachments.uploadedBy", "name");

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Cek akses ke project
    const project = await Project.findById(task.projectId);
    if (!project || !project.isMember(userId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view activity for this task",
      });
    }

    // Ekstrak ID dengan aman (hindari error .map() pada undefined)
    const subtaskIds = Array.isArray(task.subtasks)
      ? task.subtasks.map((s) => s._id)
      : [];
    const commentIds = Array.isArray(task.comments)
      ? task.comments.map((c) => c._id)
      : [];
    const attachmentIds = Array.isArray(task.attachments)
      ? task.attachments.map((a) => a._id)
      : [];

    // Query semua activity log terkait task ini
    const activities = await ActivityLog.find({
      projectId: task.projectId,
      $or: [
        { entityType: "task", entityId: taskId },
        { entityType: "subtask", entityId: { $in: subtaskIds } },
        { entityType: "comment", entityId: { $in: commentIds } },
        { entityType: "file", entityId: { $in: attachmentIds } },
      ],
    })
      .populate("user", "name username profilePicture")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Enrich setiap log dengan informasi yang lebih informatif untuk frontend
    const enrichedActivities = activities.map((log) => {
      const enriched = { ...log };

      // Gunakan task title sebagai fallback entityName
      if (!enriched.entityName || enriched.entityName.includes("Unknown")) {
        enriched.entityName = task.title;
      }

      // Preview untuk comment / reply
      if (
        (log.action === "comment" || log.action === "reply") &&
        log.details?.commentText
      ) {
        enriched.previewText = log.details.commentText;
      }

      // Preview untuk upload / replace file (support single & multiple)
      if (
        (log.action === "upload_file" || log.action === "update_file") &&
        Array.isArray(log.details?.fileNames)
      ) {
        enriched.previewText = log.details.fileNames.join(", ");
      } else if (
        (log.action === "upload_file" || log.action === "update_file") &&
        log.details?.fileName
      ) {
        // Backward compatibility untuk log lama yang hanya punya fileName (single)
        enriched.previewText = log.details.fileName;
      }

      // Detail perubahan spesifik (status, priority, assignedTo, dll.)
      if (
        log.details?.field &&
        log.details?.oldValue !== undefined &&
        log.details?.newValue !== undefined
      ) {
        enriched.changeDetail = {
          field: log.details.field,
          oldValue: log.details.oldValue,
          newValue: log.details.newValue,
        };
      }

      return enriched;
    });

    res.json({
      success: true,
      data: enrichedActivities,
    });
  } catch (error) {
    console.error("Get task activity error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// @desc    Add reminder to task
// @route   POST /api/tasks/:id/reminders
// @access  Private
export const addReminder = async (req, res) => {
  try {
    const { time, type } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    if (task.reminders && task.reminders.length >= 2) {
      return res.status(400).json({ success: false, message: "Maximum 2 reminders allowed per task" });
    }

    const reminder = {
      time: new Date(time),
      type: type || 'system',
      notified: false
    };

    task.reminders.push(reminder);
    await task.save();

    const newReminder = task.reminders[task.reminders.length - 1];

    res.json({
      success: true,
      message: "Reminder added",
      data: newReminder
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// @desc    Remove reminder from task
// @route   DELETE /api/tasks/:id/reminders/:reminderId
// @access  Private
export const removeReminder = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    task.reminders = task.reminders.filter(r => r._id.toString() !== req.params.reminderId);
    await task.save();

    res.json({
      success: true,
      message: "Reminder removed"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
