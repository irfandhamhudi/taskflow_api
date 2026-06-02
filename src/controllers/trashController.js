import Task from "../models/Task.js";
import Project from "../models/Project.js";
import ActivityLog from "../models/ActivityLog.js";

// @desc    Get all trashed items
// @route   GET /api/trash
// @access  Private
export const getTrashItems = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get trashed projects where user is owner
    const trashedProjects = await Project.find({
      owner: userId,
      isDeleted: true,
    }).populate("owner", "name email profilePicture")
      .populate("members.user", "name email profilePicture")
      .sort({ deletedAt: -1 });

    // Get trashed tasks created by user or assigned to user
    const trashedTasks = await Task.find({
      $or: [{ createdBy: userId }, { assignedTo: userId }],
      isDeleted: true,
    })
      .populate("projectId", "name color")
      .sort({ deletedAt: -1 });

    res.json({
      success: true,
      data: {
        projects: trashedProjects,
        tasks: trashedTasks,
      },
    });
  } catch (error) {
    console.error("Get trash items error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Restore task from trash
// @route   PATCH /api/trash/tasks/:id/restore
// @access  Private
export const restoreTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // Check project (if the project is also deleted, user might need to restore project first or we restore it too?)
    // For now, let's just restore the task.
    const project = await Project.findById(task.projectId);
    if (project && project.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot restore task because its project is in trash. Restore the project first.",
      });
    }

    task.isDeleted = false;
    task.deletedAt = undefined;
    await task.save();

    await ActivityLog.taskUpdated(userId, task, project, [{ field: "isDeleted", oldValue: true, newValue: false }]);

    res.json({ success: true, message: "Task restored successfully", data: task });
  } catch (error) {
    console.error("Restore task error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Restore project from trash
// @route   PATCH /api/trash/projects/:id/restore
// @access  Private
export const restoreProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    if (project.owner.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Only owner can restore project" });
    }

    project.isDeleted = false;
    project.deletedAt = undefined;
    await project.save();

    // Also restore tasks that were deleted along with the project? 
    // Usually, we only restore tasks that were marked deleted at the same time as the project.
    // But for simplicity, let's just restore the project.

    await ActivityLog.projectUpdated(userId, project, ["isDeleted"]);

    // Populate before returning
    await project.populate([
      { path: "owner", select: "name email profilePicture" },
      { path: "members.user", select: "name email profilePicture" },
    ]);

    res.json({ success: true, message: "Project restored successfully", data: project });
  } catch (error) {
    console.error("Restore project error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Permanently delete task
// @route   DELETE /api/trash/tasks/:id
// @access  Private
export const permanentlyDeleteTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user._id;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // Must be in trash to permanently delete here
    if (!task.isDeleted) {
      return res.status(400).json({ success: false, message: "Task is not in trash" });
    }

    const title = task.title;
    await task.deleteOne();

    res.json({ success: true, message: `Task "${title}" permanently deleted` });
  } catch (error) {
    console.error("Permanent delete task error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Permanently delete project
// @route   DELETE /api/trash/projects/:id
// @access  Private
export const permanentlyDeleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user._id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    if (project.owner.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Only owner can permanently delete project" });
    }

    const name = project.name;
    
    // Delete all tasks in project permanently
    await Task.deleteMany({ projectId: project._id });
    await project.deleteOne();

    res.json({ success: true, message: `Project "${name}" and all its tasks permanently deleted` });
  } catch (error) {
    console.error("Permanent delete project error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Empty trash
// @route   DELETE /api/trash/empty
// @access  Private
export const emptyTrash = async (req, res) => {
  try {
    const userId = req.user._id;

    // Permanently delete all trashed projects where user is owner
    const trashedProjects = await Project.find({ owner: userId, isDeleted: true });
    for (const project of trashedProjects) {
      await Task.deleteMany({ projectId: project._id });
      await project.deleteOne();
    }

    // Permanently delete all trashed tasks where user is creator/assigned
    // But be careful not to delete tasks from projects user doesn't own? 
    // Usually, if a user can see it in trash, they can delete it permanently.
    await Task.deleteMany({
      $or: [{ createdBy: userId }, { assignedTo: userId }],
      isDeleted: true,
    });

    res.json({ success: true, message: "Trash emptied successfully" });
  } catch (error) {
    console.error("Empty trash error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
