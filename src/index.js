import express from "express";
import authRoutes from "./routes/authRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import activityRoutes from "./routes/activityRoute.js";
import commentRoutes from "./routes/commentRoute.js";
import profileRoute from "./routes/profileRoute.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import trashRoutes from "./routes/trashRoutes.js";
import workspaceRoutes from "./routes/workspaceRoutes.js";

const router = express.Router();

// API routes
router.use("/auth", authRoutes);
router.use("/projects", projectRoutes);
router.use("/tasks", taskRoutes);
router.use("/upload", uploadRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/activity-logs", activityRoutes);
router.use("/profile", profileRoute);
router.use("/notifications", notificationRoutes);
router.use("/chats", chatRoutes);
router.use("/meetings", meetingRoutes);
router.use("/trash", trashRoutes);
router.use("/workspaces", workspaceRoutes);

router.use("/tasks", commentRoutes);



// API documentation
router.get("/docs", (req, res) => {
  res.json({
    message: "TaskFlow API Documentation",
    version: "1.0.0",
    baseUrl: "/api",
    authentication: {
      note: "Most endpoints require authentication. Use the token from login/verify-otp in Authorization header or cookie.",
      header: "Authorization: Bearer <token>",
      cookie: "token=<token>",
    },
    endpoints: {
      auth: {
        register: {
          method: "POST",
          path: "/api/auth/register",
          description: "Register new user",
          body: {
            name: "string (required)",
            email: "string (required)",
            password: "string (required, min 6 chars)",
          },
          response: "Sends OTP to email for verification",
        },
        verifyOTP: {
          method: "POST",
          path: "/api/auth/verify-otp",
          description: "Verify email with OTP",
          body: {
            email: "string (required)",
            otp: "string (required, 6 digits)",
          },
          response: "Sets auth cookie and returns user data",
        },
        resendOTP: {
          method: "POST",
          path: "/api/auth/resend-otp",
          description: "Resend OTP to email",
          body: {
            email: "string (required)",
          },
          response: "Sends new OTP to email",
        },
        resendOTPIfExpired: {
          method: "POST",
          path: "/api/auth/resend-otp-if-expired",
          description: "Check if OTP expired and resend if needed",
          body: {
            email: "string (required)",
            otp: "string (optional)",
          },
          response: "Returns OTP status or sends new OTP",
        },
        // validateOTP: {
        //   method: "POST",
        //   path: "/api/auth/validate-otp",
        //   description: "Validate OTP without verifying (for frontend checking)",
        //   body: {
        //     email: "string (required)",
        //     otp: "string (required)",
        //   },
        //   response: "Returns OTP validation status",
        // },
        login: {
          method: "POST",
          path: "/api/auth/login",
          description: "Login user",
          body: {
            email: "string (required)",
            password: "string (required)",
          },
          response: "Sets auth cookie and returns user data",
        },
        forgotPassword: {
          method: "POST",
          path: "/api/auth/forgot-password",
          description: "Request password reset",
          body: {
            email: "string (required)",
          },
          response: "Sends password reset email",
        },
        resetPassword: {
          method: "POST",
          path: "/api/auth/reset-password/:token",
          description: "Reset password with token",
          params: {
            token: "string (required, from reset email)",
          },
          body: {
            password: "string (required, min 6 chars)",
          },
        },
        getMe: {
          method: "GET",
          path: "/api/auth/me",
          description: "Get current user profile",
          access: "Private",
          response: "Returns user data",
        },
        updateProfile: {
          method: "PUT",
          path: "/api/auth/update-profile",
          description: "Update user profile",
          access: "Private",
          body: {
            name: "string (optional)",
            profilePicture: "string (optional, URL)",
            theme: "string (optional, light/dark/system)",
            notificationPreferences: "object (optional)",
          },
        },
        changePassword: {
          method: "PUT",
          path: "/api/auth/change-password",
          description: "Change password",
          access: "Private",
          body: {
            currentPassword: "string (required)",
            newPassword: "string (required, min 6 chars)",
          },
        },
        logout: {
          method: "POST",
          path: "/api/auth/logout",
          description: "Logout user",
          access: "Private",
        },
        getSessions: {
          method: "GET",
          path: "/api/auth/sessions",
          description: "Get all active sessions",
          access: "Private",
        },
        revokeSession: {
          method: "DELETE",
          path: "/api/auth/sessions/:sessionToken",
          description: "Revoke specific session",
          access: "Private",
          params: {
            sessionToken: "string (required)",
          },
        },
      },
      projects: {
        create: {
          method: "POST",
          path: "/api/projects",
          description: "Create new project",
          access: "Private",
          body: {
            name: "string (required)",
            description: "string (optional)",
            color: "string (optional)",
            tags: "array (optional)",
            startDate: "date (optional)",
            endDate: "date (optional)",
          },
        },
        getAll: {
          method: "GET",
          path: "/api/projects",
          description: "Get all user's projects",
          access: "Private",
          query: {
            archived: "boolean (optional)",
            page: "number (optional)",
            limit: "number (optional)",
          },
        },
        getOne: {
          method: "GET",
          path: "/api/projects/:id",
          description: "Get project details",
          access: "Private",
          params: {
            id: "string (required, project ID)",
          },
        },
        update: {
          method: "PUT",
          path: "/api/projects/:id",
          description: "Update project",
          access: "Private",
          params: {
            id: "string (required, project ID)",
          },
        },
        delete: {
          method: "DELETE",
          path: "/api/projects/:id",
          description: "Delete project",
          access: "Private",
          params: {
            id: "string (required, project ID)",
          },
        },
        archive: {
          method: "PATCH",
          path: "/api/projects/:id/archive",
          description: "Archive/unarchive project",
          access: "Private",
          params: {
            id: "string (required, project ID)",
          },
          body: {
            archived: "boolean (required)",
          },
        },
        invite: {
          method: "POST",
          path: "/api/projects/:id/invite",
          description: "Invite user to project",
          access: "Private",
          params: {
            id: "string (required, project ID)",
          },
          body: {
            email: "string (required)",
            role: "string (required, member/admin)",
          },
        },
        join: {
          method: "POST",
          path: "/api/projects/:id/join",
          description: "Join project using invitation token",
          access: "Private (user must be logged in)",
          params: {
            id: "string (required, project ID)",
          },
          body: {
            token:
              "string (required, invitation token from email or invite response)",
            email:
              "string (required, email that received the invitation - must match logged in user)",
          },
          notes: [
            "User must be authenticated (Bearer token)",
            "Email in body must exactly match the logged-in user's email",
            "Token expires after 7 days (168 hours)",
            "If already a member, token will be removed but returns error",
            "On success: adds user as member with invited role and sends notification to owner",
          ],
          successResponse: {
            message: "Successfully joined the project",
            data: "Full project object with updated members",
          },
          errorExamples: {
            400: "Invalid or expired invitation token / Email does not match invitation / You are already a member",
            404: "Project not found",
          },
        },
        getMembers: {
          method: "GET",
          path: "/api/projects/:id/members",
          description: "Get project members",
          access: "Private",
          params: {
            id: "string (required, project ID)",
          },
        },
        removeMember: {
          method: "DELETE",
          path: "/api/projects/:id/members/:memberId",
          description: "Remove member from project",
          access: "Private",
          params: {
            id: "string (required, project ID)",
            memberId: "string (required, user ID)",
          },
        },
        updateMemberRole: {
          method: "PATCH",
          path: "/api/projects/:id/members/:memberId/role",
          description: "Update member role",
          access: "Private",
          params: {
            id: "string (required, project ID)",
            memberId: "string (required, user ID)",
          },
          body: {
            role: "string (required, member/admin)",
          },
        },
      },
      tasks: {
        create: {
          method: "POST",
          path: "/api/tasks",
          description: "Create new task",
          access: "Private",
          body: {
            title: "string (required)",
            description: "string (optional)",
            projectId: "string (required)",
            assigneeId: "string (optional)",
            priority: "string (optional, low/medium/high)",
            status: "string (optional, todo/in-progress/review/done)",
            dueDate: "date (optional)",
            tags: "array (optional)",
          },
        },
        getAll: {
          method: "GET",
          path: "/api/tasks",
          description: "Get all user's tasks",
          access: "Private",
          query: {
            projectId: "string (optional)",
            status: "string (optional)",
            priority: "string (optional)",
            assigneeId: "string (optional)",
            archived: "boolean (optional)",
            page: "number (optional)",
            limit: "number (optional)",
          },
        },
        getStats: {
          method: "GET",
          path: "/api/tasks/stats",
          description: "Get task statistics",
          access: "Private",
          query: {
            projectId: "string (optional)",
            startDate: "date (optional)",
            endDate: "date (optional)",
          },
        },
        getOne: {
          method: "GET",
          path: "/api/tasks/:id",
          description: "Get task details",
          access: "Private",
          params: {
            id: "string (required, task ID)",
          },
        },
        update: {
          method: "PUT",
          path: "/api/tasks/:id",
          description: "Update task",
          access: "Private",
          params: {
            id: "string (required, task ID)",
          },
        },
        delete: {
          method: "DELETE",
          path: "/api/tasks/:id",
          description: "Delete task",
          access: "Private",
          params: {
            id: "string (required, task ID)",
          },
        },
        updateStatus: {
          method: "PATCH",
          path: "/api/tasks/:id/status",
          description: "Update task status",
          access: "Private",
          params: {
            id: "string (required, task ID)",
          },
          body: {
            status: "string (required, todo/in-progress/review/done)",
          },
        },
        archive: {
          method: "PATCH",
          path: "/api/tasks/:id/archive",
          description: "Archive/unarchive task",
          access: "Private",
          params: {
            id: "string (required, task ID)",
          },
          body: {
            archived: "boolean (required)",
          },
        },
        addSubtask: {
          method: "POST",
          path: "/api/tasks/:id/subtasks",
          description: "Add subtask",
          access: "Private",
          params: {
            id: "string (required, task ID)",
          },
          body: {
            title: "string (required)",
            completed: "boolean (optional)",
          },
        },
        toggleSubtask: {
          method: "PATCH",
          path: "/api/tasks/:taskId/subtasks/:subtaskId/toggle",
          description: "Toggle subtask completion",
          access: "Private",
          params: {
            taskId: "string (required, task ID)",
            subtaskId: "string (required, subtask ID)",
          },
        },
        // === COMMENT ENDPOINTS BARU ===
        addComment: {
          method: "POST",
          path: "/api/tasks/:taskId/comments",
          description: "Add comment or reply to a task",
          access: "Private",
          body: {
            text: "string (required)",
            parentCommentId: "string (optional, for reply)",
          },
          notes: [
            "Supports @mention (username) → will notify mentioned project members",
            "Replies limited to 2 levels deep",
          ],
        },
        getComments: {
          method: "GET",
          path: "/api/tasks/:taskId/comments",
          description: "Get all comments for a task",
          access: "Private",
        },
        addReaction: {
          method: "POST",
          path: "/api/tasks/:taskId/comments/:commentId/reactions",
          description: "Add or remove reaction (emoji) to comment/reply",
          access: "Private",
          body: {
            emoji: "string (required, e.g. thumbsup, heart, rocket)",
          },
          notes: ["Same emoji from same user = toggle off (remove reaction)"],
        },
        editComment: {
          method: "PUT",
          path: "/api/tasks/:taskId/comments/:commentId",
          description: "Edit own comment or reply",
          access: "Private",
          body: {
            text: "string (required)",
          },
          notes: ["Only author can edit their own comment"],
        },
        deleteComment: {
          method: "DELETE",
          path: "/api/tasks/:taskId/comments/:commentId",
          description: "Delete comment or reply",
          access: "Private",
          notes: [
            "Author can delete their own comment",
            "Project admin/owner can delete any comment",
          ],
        },
        getActivity: {
          method: "GET",
          path: "/api/tasks/:id/activity",
          description: "Get task activity",
          access: "Private",
          params: {
            id: "string (required, task ID)",
          },
          query: {
            page: "number (optional)",
            limit: "number (optional)",
          },
        },
      },
      upload: {
        uploadFile: {
          method: "POST",
          path: "/api/upload",
          description: "Upload file",
          access: "Private",
          headers: {
            "Content-Type": "multipart/form-data",
          },
          body: {
            file: "file (required)",
            folder: "string (optional)",
            description: "string (optional)",
          },
        },
        getFiles: {
          method: "GET",
          path: "/api/upload",
          description: "Get all uploaded files",
          access: "Private",
          query: {
            projectId: "string (optional)",
            taskId: "string (optional)",
            page: "number (optional)",
            limit: "number (optional)",
          },
        },
        getFile: {
          method: "GET",
          path: "/api/upload/:id",
          description: "Get file details",
          access: "Private",
          params: {
            id: "string (required, file ID)",
          },
        },

        deleteFile: {
          method: "DELETE",
          path: "/api/upload/:id",
          description: "Delete file",
          access: "Private",
          params: {
            id: "string (required, file ID)",
          },
        },
      },
      dashboard: {
        getOverview: {
          method: "GET",
          path: "/api/dashboard",
          description: "Get dashboard overview",
          access: "Private",
          query: {
            period: "string (optional, day/week/month/year)",
          },
        },
        getActivity: {
          method: "GET",
          path: "/api/dashboard/activity",
          description: "Get recent activity",
          access: "Private",
          query: {
            limit: "number (optional, default: 20)",
          },
        },
      },
      profile: {
        updateProfile: {
          method: "PUT",
          path: "/api/profile",
          description: "Update user profile",
          access: "Private",
          body: {
            name: "string (optional)",
            firstName: "string (optional)",
            lastName: "string (optional)",
            email: "string (optional)",
            password: "string (optional)",
            phone: "string (optional)",
            address: "string (optional)",
            dateOfBirth: "date (optional)",
          },
        },
        updateProfilePicture: {
          method: "PUT",
          path: "/api/profile/picture",
          description: "Update user profile picture",
          access: "Private",
          headers: {
            "Content-Type": "multipart/form-data",
          },
          body: {
            picture: "file (required)",
          },
        },
      },
    },
    statusCodes: {
      200: "Success",
      201: "Created",
      400: "Bad Request (validation error)",
      401: "Unauthorized (invalid/missing token)",
      403: "Forbidden (no permission)",
      404: "Not Found",
      409: "Conflict (duplicate resource)",
      422: "Unprocessable Entity",
      500: "Internal Server Error",
    },
    errorResponse: {
      success: false,
      message: "Error message",
      errors: ["Array of validation errors (optional)"],
    },
    successResponse: {
      success: true,
      message: "Success message",
      data: {} || [], // Response data
    },
    notes: [
      "All dates should be in ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ",
      "OTP expires in 10 minutes",
      "Password reset tokens expire in 15 minutes",
      "Use pagination for large datasets: ?page=1&limit=20",
      "Project invitations expire in 7 days",
    ],
  });
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development",
  });
});

// API version info
router.get("/", (req, res) => {
  res.json({
    name: "TaskFlow API",
    version: "1.0.0",
    description: "Task management system API",
    // documentation: "/api/docs",
    health: "/api/health",
    // github: "https://github.com/yourusername/taskflow",
    // support: "support@taskflow.com",
  });
});

export default router;
