// import mongoose from "mongoose";

// const activityLogSchema = new mongoose.Schema({
//   user: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true,
//   },
//   entityName: {
//     type: String,
//     index: true, // biar bisa search cepat kalau perlu
//   },
//   action: {
//     type: String,
//     required: true,
//     enum: [
//       "create",
//       "update",
//       "delete",
//       "assign",
//       "complete",
//       "comment",
//       "upload",
//       "update_file",
//       "delete_file",
//       "join_via_share_link",
//       "upload_file",
//       "invite",
//       "join",
//       "leave",
//       "mention",
//       "reply",
//       "archive",
//       "delete_comment",
//       "edit_comment",
//       "comment_reaction",
//       "remove_member",
//       "update_member_role",
//       "share_role_updated",
//     ],
//   },
//   entityType: {
//     type: String,
//     required: true,
//     enum: ["task", "project", "user", "subtask", "comment", "file"],
//   },
//   entityId: {
//     type: mongoose.Schema.Types.ObjectId,
//     required: true,
//   },
//   projectId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Project",
//     index: true,
//   },
//   details: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {},
//   },
//   ipAddress: String,
//   userAgent: String,
//   createdAt: {
//     type: Date,
//     default: Date.now,
//     index: true,
//   },
// });

// // Indexes
// activityLogSchema.index({ user: 1, createdAt: -1 });
// activityLogSchema.index({ projectId: 1, createdAt: -1 });
// activityLogSchema.index({ entityType: 1, entityId: 1 });
// activityLogSchema.index({ action: 1, createdAt: -1 });

// // Static methods for common activities
// activityLogSchema.statics.logTaskActivity = async function (
//   userId,
//   action,
//   taskId,
//   projectId,
//   details = {}
// ) {
//   // Ambil nama task untuk tampilan
//   const task = await mongoose.model("Task").findById(taskId).select("title");

//   const log = new this({
//     user: userId,
//     action,
//     entityType: "task",
//     entityId: taskId,
//     projectId,
//     entityName: task?.title || "Unknown Task",
//     details,
//   });

//   return await log.save();
// };

// activityLogSchema.statics.logProjectActivity = async function (
//   userId,
//   action,
//   projectId,
//   details = {}
// ) {
//   const project = await mongoose
//     .model("Project")
//     .findById(projectId)
//     .select("name");

//   const log = new this({
//     user: userId,
//     action,
//     entityType: "project",
//     entityId: projectId,
//     projectId,
//     entityName: project?.name || "Unknown Project",
//     details,
//   });

//   return await log.save();
// };

// // Pre-save middleware — DIPERBAIKI
// activityLogSchema.pre("save", function () {
//   try {
//     if (this.details && JSON.stringify(this.details).length > 5000) {
//       this.details = {
//         truncated: true,
//         message: "Details were too large and have been truncated",
//       };
//     }
//   } catch (error) {
//     this.details = {
//       truncated: true,
//       message: "Details processing failed",
//     };
//   }
// });

// const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

// export default ActivityLog;

// models/ActivityLog.js
import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    // Pelaku aksi
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Jenis entitas yang menjadi fokus utama aktivitas
    entityType: {
      type: String,
      required: true,
      enum: [
        "project",
        "task",
        "subtask",
        "comment",
        "file",
        "member", // untuk invite, join, remove, role change
        "project_settings",
        "meeting",
      ],
      index: true,
    },

    // ID dari entitas utama (projectId / taskId / commentId / fileId / dll)
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Nama entitas untuk tampilan cepat tanpa populate (judul task, nama project, nama file, dll)
    entityName: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    // Aksi yang dilakukan - sangat spesifik
    action: {
      type: String,
      required: true,
      enum: [
        // ── Project ────────────────────────────────────────
        "project_created",
        "project_updated",
        "project_settings_changed",
        "project_archived",
        "project_unarchived",
        "project_deleted",

        // ── Membership & Invitation ────────────────────────
        "member_invited",
        "member_joined",
        "member_joined_via_link",
        "member_removed",
        "member_role_updated",

        // ── Task ───────────────────────────────────────────
        "task_created",
        "task_updated",
        "task_status_changed",
        "task_priority_changed",
        "task_assigned",
        "task_unassigned",
        "task_due_date_changed",
        "task_archived",
        "task_unarchived",
        "task_deleted",

        // ── Subtask ────────────────────────────────────────
        "subtask_created",
        "subtask_updated",
        "subtask_completed",
        "subtask_incompleted",
        "subtask_deleted",

        // ── Comment & Reply ────────────────────────────────
        "comment_added",
        "reply_added",
        "comment_edited",
        "comment_deleted",
        "comment_reaction_added",
        "comment_reaction_removed",

        // ── File/Attachment ────────────────────────────────
        "file_uploaded",
        "file_replaced",
        "file_deleted",
        "file_renamed", // future proof

        // ── Lainnya (bisa ditambah) ────────────────────────
        "project_share_link_enabled",
        "project_share_link_disabled",
        "project_share_link_regenerated",

        // ── Meeting ────────────────────────────────────────
        "meeting_created",
        "meeting_deleted",
      ],
      index: true,
    },

    // Konteks project (hampir semua aktivitas terkait project)
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      index: true,
      sparse: true,
    },

    // Informasi detail perubahan (fleksibel tapi dianjurkan terstruktur)
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Metadata teknis (untuk audit & security)
    ipAddress: { type: String, sparse: true },
    userAgent: { type: String, sparse: true },
    location: { type: String, sparse: true }, // bisa diisi dari geoip nanti

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// ====================== INDEX KOMPOSIT PENTING ======================
activityLogSchema.index({ projectId: 1, createdAt: -1 }); // Timeline project utama
activityLogSchema.index({ user: 1, createdAt: -1 }); // Aktivitas satu user
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 }); // Per entitas
activityLogSchema.index({ action: 1, createdAt: -1 }); // Filter jenis aktivitas
activityLogSchema.index({ "details.field": 1 }); // Cari perubahan field tertentu

// ====================== HELPER UTAMA ======================
activityLogSchema.statics.log = async function (data) {
  try {
    // Proteksi agar details tidak terlalu besar
    if (data.details && typeof data.details === "object") {
      const str = JSON.stringify(data.details);
      if (str.length > 6500) {
        data.details = {
          truncated: true,
          originalSize: str.length,
          message: "Details terlalu besar, telah dipotong",
        };
      }
    }

    const entry = new this(data);
    await entry.save();
    return entry;
  } catch (err) {
    console.error("[ActivityLog] Gagal menyimpan log:", err);
    return null; // jangan crash flow utama
  }
};

// ====================== HELPER SPESIFIK PER AKSI ======================

// ── Project ───────────────────────────────────────────────
activityLogSchema.statics.projectCreated = function (userId, project) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    action: "project_created",
    projectId: project._id,
    details: {
      name: project.name,
      visibility: project.visibility,
      color: project.color,
      icon: project.icon,
    },
  });
};

activityLogSchema.statics.projectUpdated = function (
  userId,
  project,
  changedFields
) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    action: "project_updated",
    projectId: project._id,
    details: { changedFields },
  });
};

// ── Membership ────────────────────────────────────────────
activityLogSchema.statics.memberInvited = function (
  userId,
  project,
  invitedEmail,
  role
) {
  return this.log({
    user: userId,
    entityType: "member",
    entityId: project._id,
    entityName: project.name,
    action: "member_invited",
    projectId: project._id,
    details: { invitedEmail, role },
  });
};

activityLogSchema.statics.memberJoined = function (
  userId,
  project,
  role,
  viaLink = false
) {
  return this.log({
    user: userId,
    entityType: "member",
    entityId: project._id,
    entityName: project.name,
    action: viaLink ? "member_joined_via_link" : "member_joined",
    projectId: project._id,
    details: { role, viaLink },
  });
};

activityLogSchema.statics.shareLinkEnabled = function (
  userId,
  project,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    action: "project_share_link_enabled",
    projectId: project._id,
    details: {
      shareRole: project.shareRole,
      shareLinkToken: project.shareLinkToken, // optional: bisa dihapus jika sensitif
      enabledAt: new Date().toISOString(),
      ...extraDetails,
    },
  });
};

activityLogSchema.statics.shareLinkDisabled = function (
  userId,
  project,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    action: "project_share_link_disabled",
    projectId: project._id,
    details: {
      shareRole: project.shareRole, // role terakhir sebelum dimatikan
      disabledAt: new Date().toISOString(),
      ...extraDetails,
    },
  });
};

activityLogSchema.statics.shareLinkRegenerated = function (
  userId,
  project,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    action: "project_share_link_regenerated",
    projectId: project._id,
    details: {
      shareRole: project.shareRole,
      newShareLinkToken: project.shareLinkToken, // optional
      regeneratedAt: new Date().toISOString(),
      ...extraDetails,
    },
  });
};

activityLogSchema.statics.memberRemoved = function (
  userId,
  project,
  removedUserId,
  removedName
) {
  return this.log({
    user: userId,
    entityType: "member",
    entityId: project._id,
    entityName: project.name,
    action: "member_removed",
    projectId: project._id,
    details: { removedUserId, removedName },
  });
};

activityLogSchema.statics.projectDeleted = function (
  userId,
  projectId,
  projectName,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: projectId,
    entityName: projectName,
    action: "project_deleted",
    projectId: projectId, // meskipun project sudah dihapus, tetap simpan konteks
    details: {
      name: projectName,
      deletedAt: new Date().toISOString(),
      ...extraDetails,
    },
  });
};

// Tambahkan di bagian ── Project ───────────────────────────────────────────────

activityLogSchema.statics.projectArchived = function (
  userId,
  project,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    action: "project_archived",
    projectId: project._id,
    details: {
      name: project.name,
      archivedAt: project.archivedAt,
      ...extraDetails,
    },
  });
};

activityLogSchema.statics.projectUnarchived = function (
  userId,
  project,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "project",
    entityId: project._id,
    entityName: project.name,
    action: "project_unarchived",
    projectId: project._id,
    details: {
      name: project.name,
      ...extraDetails,
    },
  });
};

activityLogSchema.statics.memberRoleUpdated = function (
  userId,
  project,
  memberId,
  memberName,
  oldRole,
  newRole
) {
  return this.log({
    user: userId,
    entityType: "member",
    entityId: project._id,
    entityName: project.name,
    action: "member_role_updated",
    projectId: project._id,
    details: { memberId, memberName, oldRole, newRole },
  });
};

// ── Task ──────────────────────────────────────────────────
activityLogSchema.statics.taskCreated = async function (userId, task, project) {
  let assignedDetails = [];

  // Kalau ada assignedTo saat create, ambil detail user (nama + profilePicture)
  if (task.assignedTo && task.assignedTo.length > 0) {
    try {
      const User = mongoose.model("User");
      const assignedUsers = await User.find({
        _id: { $in: task.assignedTo },
      }).select("name username profilePicture");

      assignedDetails = assignedUsers.map((u) => ({
        name: u.name || u.username,
        profilePicture: u.profilePicture || null,
      }));
    } catch (err) {
      console.error(
        "[ActivityLog.taskCreated] Failed to fetch assignees:",
        err
      );
    }
  }

  return this.log({
    user: userId,
    entityType: "task",
    entityId: task._id,
    entityName: task.title,
    action: "task_created",
    projectId: project._id,
    details: {
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo?.map((id) => id.toString()) || [],
      assignedUsers: assignedDetails, // ← INI YANG BARU! Sama format dengan task_assigned
      assignedCount: task.assignedTo?.length || 0,
      dueDate: task.dueDate,
    },
  });
};

// PERBAIKAN: taskUpdated dengan penambahan nama user untuk assignedTo
activityLogSchema.statics.taskUpdated = async function (
  userId,
  task,
  project,
  changes
) {
  try {
    const formattedChanges = [...changes];

    // Cari perubahan pada field assignedTo
    const assignedToChange = changes.find((c) => c.field === "assignedTo");

    if (assignedToChange) {
      const oldIds = Array.isArray(assignedToChange.oldValue)
        ? assignedToChange.oldValue.map((id) => id.toString())
        : assignedToChange.oldValue
        ? [assignedToChange.oldValue.toString()]
        : [];

      const newIds = Array.isArray(assignedToChange.newValue)
        ? assignedToChange.newValue.map((id) => id.toString())
        : assignedToChange.newValue
        ? [assignedToChange.newValue.toString()]
        : [];

      // Cari user yang ditambahkan/dihapus
      const addedIds = newIds.filter((id) => !oldIds.includes(id));
      const removedIds = oldIds.filter((id) => !newIds.includes(id));

      // Ambil nama user dari database jika ada perubahan
      if (addedIds.length > 0 || removedIds.length > 0) {
        const User = mongoose.model("User");

        let addedUsersData = [];
        let removedUsersData = [];

        if (addedIds.length > 0) {
          const addedDocs = await User.find({ _id: { $in: addedIds } }).select(
            "name username profilePicture"
          );
          addedUsersData = addedDocs.map((u) => ({
            name: u.name || u.username,
            profilePicture: u.profilePicture || null,
          }));
        }

        if (removedIds.length > 0) {
          const removedDocs = await User.find({
            _id: { $in: removedIds },
          }).select("name username profilePicture");
          removedUsersData = removedDocs.map((u) => ({
            name: u.name || u.username,
            profilePicture: u.profilePicture || null,
          }));
        }

        // Ganti nama field supaya konsisten
        assignedToChange.addedUsers = addedUsersData;
        assignedToChange.removedUsers = removedUsersData;
        assignedToChange.addedCount = addedIds.length;
        assignedToChange.removedCount = removedIds.length;

        // Opsional: tetap simpan nama kalau frontend butuh fallback
        assignedToChange.addedUserNames = addedUsersData.map((u) => u.name);
        assignedToChange.removedUserNames = removedUsersData.map((u) => u.name);
      }
    }

    // Format tanggal untuk frontend
    const finalChanges = formattedChanges.map((change) => {
      if (change.field === "startDate" || change.field === "dueDate") {
        return {
          ...change,
          formattedOldValue: change.oldValue
            ? new Date(change.oldValue).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—",
          formattedNewValue: change.newValue
            ? new Date(change.newValue).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—",
        };
      }
      return change;
    });

    return this.log({
      user: userId,
      entityType: "task",
      entityId: task._id,
      entityName: task.title,
      action: "task_updated",
      projectId: project._id,
      details: {
        changes: finalChanges,
        rawChanges: changes,
      },
    });
  } catch (error) {
    console.error("[ActivityLog.taskUpdated] Error:", error);

    // Fallback: simpan tanpa nama user jika error
    const formattedChanges = changes.map((change) => {
      if (change.field === "startDate" || change.field === "dueDate") {
        return {
          ...change,
          formattedOldValue: change.oldValue
            ? new Date(change.oldValue).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—",
          formattedNewValue: change.newValue
            ? new Date(change.newValue).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—",
        };
      }
      return change;
    });

    return this.log({
      user: userId,
      entityType: "task",
      entityId: task._id,
      entityName: task.title,
      action: "task_updated",
      projectId: project._id,
      details: {
        changes: formattedChanges,
        rawChanges: changes,
      },
    });
  }
};

activityLogSchema.statics.taskStatusChanged = function (
  userId,
  task,
  project,
  oldStatus,
  newStatus
) {
  return this.log({
    user: userId,
    entityType: "task",
    entityId: task._id,
    entityName: task.title,
    action: "task_status_changed",
    projectId: project._id,
    details: { field: "status", oldValue: oldStatus, newValue: newStatus },
  });
};

// ── Task Archive/Unarchive ────────────────────────────────────────────
activityLogSchema.statics.taskArchived = function (
  userId,
  task,
  project,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "task",
    entityId: task._id,
    entityName: task.title,
    action: "task_archived",
    projectId: project._id,
    details: {
      taskTitle: task.title,
      archivedAt: task.archivedAt || new Date().toISOString(),
      previousStatus: task.status || "unknown",
      ...extraDetails,
    },
  });
};

activityLogSchema.statics.taskUnarchived = function (
  userId,
  task,
  project,
  extraDetails = {}
) {
  return this.log({
    user: userId,
    entityType: "task",
    entityId: task._id,
    entityName: task.title,
    action: "task_unarchived",
    projectId: project._id,
    details: {
      taskTitle: task.title,
      previousStatus: task.status || "unknown",
      unarchivedAt: new Date().toISOString(),
      ...extraDetails,
    },
  });
};

activityLogSchema.statics.taskPriorityChanged = function (
  userId,
  task,
  project,
  oldPriority,
  newPriority
) {
  return this.log({
    user: userId,
    entityType: "task",
    entityId: task._id,
    entityName: task.title,
    action: "task_priority_changed",
    projectId: project._id,
    details: {
      field: "priority",
      oldValue: oldPriority,
      newValue: newPriority,
    },
  });
};

activityLogSchema.statics.taskAssigned = async function (
  userId,
  task,
  project,
  assignedUserIds
) {
  try {
    const User = mongoose.model("User");
    const assignedUsers = await User.find({
      _id: { $in: assignedUserIds },
    }).select("name username profilePicture");

    const assignedDetails = assignedUsers.map((u) => ({
      name: u.name || u.username,
      profilePicture: u.profilePicture || null,
    }));

    return this.log({
      user: userId,
      entityType: "task",
      entityId: task._id,
      entityName: task.title,
      action: "task_assigned",
      projectId: project._id,
      details: {
        assignedUserIds,
        assignedUsers: assignedDetails, // ← SIMPAN OBJECT LENGKAP
        assignedCount: assignedUserIds.length,
      },
    });
  } catch (error) {
    console.error("[ActivityLog.taskAssigned] Error:", error);
    return this.log({
      user: userId,
      entityType: "task",
      entityId: task._id,
      entityName: task.title,
      action: "task_assigned",
      projectId: project._id,
      details: { assignedUserIds },
    });
  }
};

activityLogSchema.statics.taskUnassigned = async function (
  userId,
  task,
  project,
  unassignedUserIds
) {
  try {
    const User = mongoose.model("User");
    const unassignedUsers = await User.find({
      _id: { $in: unassignedUserIds },
    }).select("name username profilePicture");

    const unassignedDetails = unassignedUsers.map((u) => ({
      name: u.name || u.username,
      profilePicture: u.profilePicture || null,
    }));

    return this.log({
      user: userId,
      entityType: "task",
      entityId: task._id,
      entityName: task.title,
      action: "task_unassigned",
      projectId: project._id,
      details: {
        unassignedUserIds,
        unassignedUsers: unassignedDetails, // ← SIMPAN OBJECT LENGKAP
        unassignedCount: unassignedUserIds.length,
      },
    });
  } catch (error) {
    console.error("[ActivityLog.taskUnassigned] Error:", error);
    return this.log({
      user: userId,
      entityType: "task",
      entityId: task._id,
      entityName: task.title,
      action: "task_unassigned",
      projectId: project._id,
      details: { unassignedUserIds },
    });
  }
};

activityLogSchema.statics.taskArchived = function (userId, task, project) {
  return this.log({
    user: userId,
    entityType: "task",
    entityId: task._id,
    entityName: task.title,
    action: "task_archived",
    projectId: project._id,
    details: {},
  });
};

activityLogSchema.statics.taskDeleted = function (
  userId,
  taskId,
  taskTitle,
  project
) {
  return this.log({
    user: userId,
    entityType: "task",
    entityId: taskId,
    entityName: taskTitle,
    action: "task_deleted",
    projectId: project._id,
    details: { title: taskTitle },
  });
};

// ── Subtask ───────────────────────────────────────────────
activityLogSchema.statics.subtaskCreated = function (
  userId,
  task,
  project,
  subtaskTitle
) {
  return this.log({
    user: userId,
    entityType: "subtask",
    entityId: task._id,
    entityName: task.title,
    action: "subtask_created",
    projectId: project._id,
    details: { subtaskTitle },
  });
};

activityLogSchema.statics.subtaskCompleted = function (
  userId,
  task,
  project,
  subtaskTitle
) {
  return this.log({
    user: userId,
    entityType: "subtask",
    entityId: task._id,
    entityName: task.title,
    action: "subtask_completed",
    projectId: project._id,
    details: { subtaskTitle },
  });
};

activityLogSchema.statics.subtaskIncompleted = function (
  userId,
  task,
  project,
  subtaskTitle
) {
  return this.log({
    user: userId,
    entityType: "subtask",
    entityId: task._id,
    entityName: task.title,
    action: "subtask_incompleted",
    projectId: project._id,
    details: { subtaskTitle },
  });
};

activityLogSchema.statics.subtaskDeleted = function (
  userId,
  task,
  project,
  subtaskTitle
) {
  return this.log({
    user: userId,
    entityType: "subtask",
    entityId: task._id,
    entityName: task.title,
    action: "subtask_deleted",
    projectId: project._id,
    details: { subtaskTitle },
  });
};

// ── Comment ───────────────────────────────────────────────
activityLogSchema.statics.commentAdded = function (
  userId,
  task,
  project,
  commentText,
  mentioned = []
) {
  return this.log({
    user: userId,
    entityType: "comment",
    entityId: task._id,
    entityName: task.title,
    action: "comment_added",
    projectId: project._id,
    details: {
      commentText: commentText,
      mentionedUsers: mentioned,
    },
  });
};

activityLogSchema.statics.commentDeleted = function (
  userId,
  task,
  project,
  commentId,
  commentPreview = "" // optional: potongan teks komentar yang dihapus
) {
  return this.log({
    user: userId,
    entityType: "comment",
    entityId: task._id, // ID task sebagai konteks utama (bukan commentId)
    entityName: task.title,
    action: "comment_deleted",
    projectId: project._id,
    details: {
      commentId,
      commentPreview: commentPreview, // maks 280 char
      deletedAt: new Date().toISOString(),
    },
  });
};

activityLogSchema.statics.replyAdded = function (
  userId,
  task,
  project,
  parentCommentId,
  replyText
) {
  return this.log({
    user: userId,
    entityType: "comment",
    entityId: task._id,
    entityName: task.title,
    action: "reply_added",
    projectId: project._id,
    details: {
      parentCommentId,
      replyText: replyText,
    },
  });
};

activityLogSchema.statics.commentEdited = function (
  userId,
  task,
  project,
  commentId,
  newText
) {
  return this.log({
    user: userId,
    entityType: "comment",
    entityId: task._id,
    entityName: task.title,
    action: "comment_edited",
    projectId: project._id,
    details: { commentId, newText: newText },
  });
};

activityLogSchema.statics.commentReaction = function (
  userId,
  task,
  project,
  commentId,
  emoji,
  added = true
) {
  return this.log({
    user: userId,
    entityType: "comment",
    entityId: task._id,
    entityName: task.title,
    action: added ? "comment_reaction_added" : "comment_reaction_removed",
    projectId: project._id,
    details: { commentId, emoji },
  });
};

// ── File ──────────────────────────────────────────────────
activityLogSchema.statics.fileUploaded = function (
  userId,
  entityId,
  entityType,
  project,
  fileNames,
  isReplace = false
) {
  return this.log({
    user: userId,
    entityType,
    entityId,
    entityName: entityType === "task" ? "Task" : "Project", // bisa di-improve
    action: isReplace ? "file_replaced" : "file_uploaded",
    projectId: project._id,
    details: {
      fileNames,
      count: fileNames.length,
      replaced: isReplace,
    },
  });
};

activityLogSchema.statics.fileDeleted = function (
  userId,
  fileId,
  fileName,
  entityId,
  entityType,
  project
) {
  return this.log({
    user: userId,
    entityType,
    entityId,
    entityName: entityType === "task" ? "Task" : "Project",
    action: "file_deleted",
    projectId: project._id,
    details: { fileId, fileName },
  });
};

// ── Meeting ────────────────────────────────────────────────
activityLogSchema.statics.meetingCreated = function (
  userId,
  meeting,
  project
) {
  return this.log({
    user: userId,
    entityType: "meeting",
    entityId: meeting._id,
    entityName: meeting.title,
    action: "meeting_created",
    projectId: project?._id,
    details: {
      title: meeting.title,
      startTime: meeting.startTime,
      meetingType: meeting.platform, // zoom / google_meet
      joinUrl: meeting.joinUrl,
    },
  });
};

activityLogSchema.statics.meetingDeleted = function (
  userId,
  meetingId,
  title,
  project
) {
  return this.log({
    user: userId,
    entityType: "meeting",
    entityId: meetingId,
    entityName: title,
    action: "meeting_deleted",
    projectId: project?._id,
    details: {
      title: title,
      deletedAt: new Date().toISOString(),
    },
  });
};

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
