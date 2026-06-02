import Project from "../models/Project.js";
import Task from "../models/Task.js";
import ActivityLog from "../models/ActivityLog.js";

// @desc    Get dashboard overview
// @route   GET /api/dashboard
// @access  Private
export const getDashboardOverview = async (req, res) => {
  try {
    const { workspaceId } = req.query;
    const userId = req.user._id;

    // 1. Ambil semua project user yang aktif (tidak di-archive)
    const projectFilter = {
      $or: [{ owner: userId }, { "members.user": userId }],
      isArchived: false,
      isDeleted: { $ne: true },
    };

    if (workspaceId) {
      projectFilter.workspaceId = workspaceId;
    }

    const projects = await Project.find(projectFilter).select("_id name icon");

    const projectIds = projects.map((p) => p._id);

    if (projectIds.length === 0) {
      return res.json({
        success: true,
        data: {
          overview: {
            totalProjects: 0,
            totalTasks: 0,
            completedTasks: 0,
            overdueTasks: 0,
            urgentTasks: 0,
            tasksDueToday: 0,
            productivity: {
              tasksCompletedThisWeek: 0,
              tasksCreatedThisWeek: 0,
              completionRate: 0,
            },
          },
          taskDistribution: {
            byStatus: { todo: 0, inprogress: 0, review: 0, done: 0 },
            byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
          },
          recentActivity: [],
          myTasks: [],
          projectStats: [],
        },
      });
    }

    // 2. Query dasar untuk task di project user (hanya task aktif)
    const taskQuery = {
      projectId: { $in: projectIds },
      isArchived: false,
      isDeleted: { $ne: true },
    };

    // 3. Hitung semua statistik penting (termasuk review & urgent)
    const [
      totalTasks,
      todoTasks,
      inprogressTasks,
      reviewTasks, // ← Tambah ini
      doneTasks,
      overdueTasks,
      urgentTasks,
      tasksDueToday,
      lowPriority,
      mediumPriority,
      highPriority,
      todayTasks,
    ] = await Promise.all([
      Task.countDocuments(taskQuery),
      Task.countDocuments({ ...taskQuery, status: "todo" }),
      Task.countDocuments({ ...taskQuery, status: "inprogress" }),
      Task.countDocuments({ ...taskQuery, status: "review" }),
      Task.countDocuments({ ...taskQuery, status: "done" }),
      Task.countDocuments({
        ...taskQuery,
        dueDate: { $lt: new Date() },
        status: { $ne: "done" },
      }),
      Task.countDocuments({ ...taskQuery, priority: "urgent" }),
      Task.countDocuments({
        ...taskQuery,
        dueDate: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(24, 0, 0, 0)),
        },
        status: { $ne: "done" },
      }),
      Task.countDocuments({ ...taskQuery, priority: "low" }),
      Task.countDocuments({ ...taskQuery, priority: "medium" }),
      Task.countDocuments({ ...taskQuery, priority: "high" }),
      Task.find({
        ...taskQuery,
        dueDate: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(24, 0, 0, 0)),
        },
        status: { $ne: "done" },
      })
        .populate("projectId", "name icon")
        .populate("assignedTo", "name profilePicture")
        .lean(),
    ]);

    // 4. Recent activity (limit 10 terbaru, filtered by projectIds)
    const recentActivity = await ActivityLog.find({
      projectId: { $in: projectIds },
    })
      .populate("user", "name profilePicture")
      .populate("projectId", "name icon")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 5. My Tasks (task yang ditugaskan ke user, max 5 terbaru)
    const myTasksRaw = await Task.find({
      assignedTo: userId,
      isArchived: false,
      projectId: { $in: projectIds },
    })
      .populate({
        path: "projectId",
        select: "name icon",
      })
      .populate({
        path: "assignedTo",
        select: "name profilePicture",
      })
      .select("title startDate dueDate priority projectId status assignedTo subtasks attachments")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const myTasks = myTasksRaw.map((task) => {
      // Hitung progress berdasarkan subtask
      let progress = 0;
      if (task.subtasks && task.subtasks.length > 0) {
        const completed = task.subtasks.filter((s) => s.completed).length;
        progress = Math.round((completed / task.subtasks.length) * 100);
      } else if (task.status === "done") {
        progress = 100;
      } else if (task.status === "inprogress" || task.status === "review") {
        progress = 50;
      }

      return {
        ...task,
        progress,
        projectId: task.projectId,
        assignees: task.assignedTo || [],
        attachments: task.attachments || [],
      };
    });

    // 6. Project stats (top 5 project berdasarkan jumlah task)
    const projectStats = await Promise.all(
      projects.map(async (project) => {
        const total = await Task.countDocuments({
          projectId: project._id,
          isArchived: false,
        });
        const completed = await Task.countDocuments({
          projectId: project._id,
          status: "done",
          isArchived: false,
        });

        return {
          projectId: project._id,
          projectName: project.name,
          projectIcon: project.icon,
          totalTasks: total,
          completedTasks: completed,
          progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      })
    );

    // 7. Productivity minggu ini
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const [tasksCompletedThisWeek, tasksCreatedThisWeek] = await Promise.all([
      Task.countDocuments({
        projectId: { $in: projectIds },
        status: "done",
        completedAt: { $gte: startOfWeek },
      }),
      Task.countDocuments({
        projectId: { $in: projectIds },
        createdAt: { $gte: startOfWeek },
      }),
    ]);

    // 8. Notification count removed

    // 9. Response final (lengkap dengan review & urgent)
    const dashboardData = {
      overview: {
        totalProjects: projects.length,
        totalTasks,
        completedTasks: doneTasks,
        overdueTasks,
        urgentTasks,
        tasksDueToday,
        productivity: {
          tasksCompletedThisWeek,
          tasksCreatedThisWeek,
          completionRate:
            totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
        },
      },
      taskDistribution: {
        byStatus: {
          todo: todoTasks,
          inprogress: inprogressTasks,
          review: reviewTasks, // ← Sekarang ada!
          done: doneTasks,
        },
        byPriority: {
          low: lowPriority,
          medium: mediumPriority,
          high: highPriority,
          urgent: urgentTasks, // ← Urgent ditampilkan dengan benar
        },
      },
      recentActivity,
      myTasks,
      todayTasks,
      projectStats,
    };

    res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get activity feed
// @route   GET /api/activity-feed
// @access  Private
export const getActivityFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, projectId, workspaceId } = req.query;

    const projectFilter = {
      $or: [{ owner: userId }, { "members.user": userId }],
      isArchived: false,
    };

    if (workspaceId) {
      projectFilter.workspaceId = workspaceId;
    }

    const projects = await Project.find(projectFilter).select("_id");

    const projectIds = projects.map((p) => p._id);

    const query = {
      projectId: { $in: projectId ? [projectId] : projectIds },
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const activities = await ActivityLog.find(query)
      .populate("user", "name profilePicture")
      .populate("projectId", "name icon")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ActivityLog.countDocuments(query);

    res.json({
      success: true,
      data: activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get activity feed error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
