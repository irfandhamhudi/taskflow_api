import { body, param, query, validationResult } from "express-validator";
import mongoose from "mongoose";

// Custom validators
const isObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

const validate = (validationType) => {
  const validations = {
    // Auth validations
    register: [
      body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required")
        .isLength({ min: 2, max: 50 })
        .withMessage("Name must be between 2 and 50 characters"),
      body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Please enter a valid email"),
      body("password")
        .notEmpty()
        .withMessage("Password is required")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters"),
    ],

    verifyOTP: [
      body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Please enter a valid email"),
      body("otp")
        .trim()
        .notEmpty()
        .withMessage("OTP is required")
        .isLength({ min: 6, max: 6 })
        .withMessage("OTP must be 6 digits"),
    ],

    login: [
      body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Please enter a valid email"),
      body("password").notEmpty().withMessage("Password is required"),
    ],

    forgotPassword: [
      body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Please enter a valid email"),
    ],

    resetPassword: [
      param("token").notEmpty().withMessage("Reset token is required"),
      body("password")
        .notEmpty()
        .withMessage("Password is required")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters"),
    ],

    updateProfile: [
      body("name")
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("Name must be between 2 and 50 characters"),
      body("theme")
        .optional()
        .isIn(["light", "dark", "system"])
        .withMessage("Theme must be light, dark, or system"),
      body("profilePicture")
        .optional()
        .isURL()
        .withMessage("Profile picture must be a valid URL"),
    ],

    changePassword: [
      body("currentPassword")
        .notEmpty()
        .withMessage("Current password is required"),
      body("newPassword")
        .notEmpty()
        .withMessage("New password is required")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters")
        .not()
        .equals(body("currentPassword"))
        .withMessage("New password must be different from current password"),
    ],

    // Project validations
    createProject: [
      body("name")
        .if((v, { req }) => !req.body.templateKey)
        .trim()
        .notEmpty()
        .withMessage("Project name is required")
        .isLength({ min: 2, max: 100 })
        .withMessage("Project name must be between 2 and 100 characters"),
      body("name")
        .if((v, { req }) => !!req.body.templateKey)
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Project name cannot exceed 100 characters"),
      body("description")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Description cannot exceed 500 characters"),
      body("visibility")
        .optional()
        .isIn(["private", "limited", "public"])
        .withMessage("Visibility must be private, limited, or public"),
      body("color")
        .optional()
        .matches(/^#[0-9A-Fa-f]{6}$/)
        .withMessage("Color must be a valid hex color"),
    ],

    getProject: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
    ],

    updateProject: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
      body("name")
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Project name must be between 2 and 100 characters"),
      body("description")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Description cannot exceed 500 characters"),
      body("visibility")
        .optional()
        .isIn(["private", "limited", "public"])
        .withMessage("Visibility must be private, limited, or public"),
      body("color")
        .optional()
        .matches(/^#[0-9A-Fa-f]{6}$/)
        .withMessage("Color must be a valid hex color"),
    ],

    deleteProject: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
    ],

    archiveProject: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
      body("archive")
        .isBoolean()
        .withMessage("Archive must be a boolean value"),
    ],

    inviteToProject: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
      body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Please enter a valid email"),
      body("role")
        .optional()
        .isIn(["viewer", "editor", "admin"])
        .withMessage("Role must be viewer, editor, or admin"),
    ],

    joinProject: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
      body("token").notEmpty().withMessage("Invitation token is required"),
      body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Please enter a valid email"),
    ],

    removeMember: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
      param("memberId").custom(isObjectId).withMessage("Invalid member ID"),
    ],

    updateMemberRole: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
      param("memberId").custom(isObjectId).withMessage("Invalid member ID"),
      body("role")
        .isIn(["viewer", "editor", "admin"])
        .withMessage("Role must be viewer, editor, or admin"),
    ],

    getProjectMembers: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),
    ],
    updateShareSettings: [
      param("id").custom(isObjectId).withMessage("Invalid project ID"),

      body("visibility")
        .optional()
        .isIn(["private", "limited", "public"])
        .withMessage("Visibility must be private, limited, or public"),

      body("shareRole")
        .optional()
        .isIn(["viewer", "editor", "admin"])
        .withMessage("Share role must be viewer, editor, or admin"),

      body("regenerate")
        .optional()
        .isBoolean()
        .withMessage("Regenerate must be a boolean value (true/false)"),
    ],
    icon: [
      body("icon")
        .trim()
        .notEmpty()
        .withMessage("Icon emoji is required")
        .isLength({ min: 1, max: 10 })
        .withMessage("Icon emoji must be between 1 and 10 characters"),
    ],

    // Task validations
    createTask: [
      body("projectId").custom(isObjectId).withMessage("Invalid project ID"),
      body("title")
        .trim()
        .notEmpty()
        .withMessage("Task title is required")
        .isLength({ min: 2, max: 200 })
        .withMessage("Title must be between 2 and 200 characters"),
      body("description")
        .optional()
        .trim()
        .isLength({ max: 2000 })
        .withMessage("Description cannot exceed 2000 characters"),
      body("status")
        .optional()
        .isIn(["todo", "inprogress", "done", "review"])
        .withMessage("Status must be todo, inprogress, done, or review"),
      body("priority")
        .optional()
        .isIn(["low", "medium", "high", "urgent"])
        .withMessage("Priority must be low, medium, high, or urgent"),
      body("startDate")
        .optional()
        .isISO8601()
        .withMessage("Start date must be a valid date"),
      body("dueDate")
        .optional()
        .isISO8601()
        .withMessage("Due date must be a valid date"),
      body("assignedTo")
        .optional()
        .isArray()
        .withMessage("Assigned users must be an array"),
      body("assignedTo.*")
        .optional()
        .custom(isObjectId)
        .withMessage("Invalid user ID"),
      body("tags").optional().isArray().withMessage("Tags must be an array"),
      body("tags.*").optional().isString().trim(),
    ],

    getTask: [param("id").custom(isObjectId).withMessage("Invalid task ID")],

    updateTask: [
      param("id").custom(isObjectId).withMessage("Invalid task ID"),
      body("title")
        .optional()
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage("Title must be between 2 and 200 characters"),
      body("description")
        .optional()
        .trim()
        .isLength({ max: 2000 })
        .withMessage("Description cannot exceed 2000 characters"),
      body("status")
        .optional()
        .isIn(["todo", "inprogress", "done", "review"])
        .withMessage("Status must be todo, inprogress, done, or review"),
      body("priority")
        .optional()
        .isIn(["low", "medium", "high", "urgent"])
        .withMessage("Priority must be low, medium, high, or urgent"),
      body("startDate")
        .optional()
        .isISO8601()
        .withMessage("Start date must be a valid date"),
      body("dueDate")
        .optional()
        .isISO8601()
        .withMessage("Due date must be a valid date"),
      body("assignedTo")
        .optional()
        .isArray()
        .withMessage("Assigned users must be an array"),
      body("assignedTo.*")
        .optional()
        .custom(isObjectId)
        .withMessage("Invalid user ID"),
      body("tags").optional().isArray().withMessage("Tags must be an array"),
      body("tags.*").optional().isString().trim(),
    ],

    deleteTask: [param("id").custom(isObjectId).withMessage("Invalid task ID")],

    updateTaskStatus: [
      param("id").custom(isObjectId).withMessage("Invalid task ID"),
      body("status")
        .isIn(["todo", "inprogress", "done", "review"])
        .withMessage("Status must be todo, inprogress, done, or review"),
      body("order").optional().isInt().withMessage("Order must be an integer"),
    ],

    archiveTask: [
      param("id").custom(isObjectId).withMessage("Invalid task ID"),
      body("archive")
        .isBoolean()
        .withMessage("Archive must be a boolean value"),
    ],

    addSubtask: [
      param("id").custom(isObjectId).withMessage("Invalid task ID"),
      body("title")
        .trim()
        .notEmpty()
        .withMessage("Subtask title is required")
        .isLength({ min: 1, max: 200 })
        .withMessage("Subtask title must be between 1 and 200 characters"),
    ],

    toggleSubtask: [
      param("taskId").custom(isObjectId).withMessage("Invalid task ID"),
      param("subtaskId").custom(isObjectId).withMessage("Invalid subtask ID"),
    ],

    addComment: [
      param("id").custom(isObjectId).withMessage("Invalid task ID"),
      body("text")
        .trim()
        .notEmpty()
        .withMessage("Comment text is required")
        .isLength({ max: 1000 })
        .withMessage("Comment cannot exceed 1000 characters"),
    ],

    // File validations
    uploadFile: [
      body("projectId")
        .optional()
        .custom(isObjectId)
        .withMessage("Invalid project ID"),
      body("taskId")
        .optional()
        .custom(isObjectId)
        .withMessage("Invalid task ID"),
      body("isPublic")
        .optional()
        .isBoolean()
        .withMessage("isPublic must be a boolean value"),
    ],

    getFile: [param("id").custom(isObjectId).withMessage("Invalid file ID")],

    deleteFile: [param("id").custom(isObjectId).withMessage("Invalid file ID")],
    
    // Workspace validations
    createWorkspace: [
      body("name")
        .trim()
        .notEmpty()
        .withMessage("Workspace name is required")
        .isLength({ min: 2, max: 100 })
        .withMessage("Workspace name must be between 2 and 100 characters"),
      body("description")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Description cannot exceed 500 characters"),
      body("icon")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Icon cannot be empty"),
    ],

    getWorkspace: [
      param("id").custom(isObjectId).withMessage("Invalid workspace ID"),
    ],

    updateWorkspace: [
      param("id").custom(isObjectId).withMessage("Invalid workspace ID"),
      body("name")
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Workspace name must be between 2 and 100 characters"),
      body("description")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Description cannot exceed 500 characters"),
      body("icon")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Icon cannot be empty"),
    ],

    deleteWorkspace: [
      param("id").custom(isObjectId).withMessage("Invalid workspace ID"),
    ],
  };

  return async (req, res, next) => {
    // Run validations
    const validationRules = validations[validationType];
    if (!validationRules) {
      return next();
    }

    // Execute all validation rules
    await Promise.all(validationRules.map((validation) => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Return validation errors
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  };
};

export { validate };
