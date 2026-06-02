import Workspace from "../models/Workspace.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import ActivityLog from "../models/ActivityLog.js";

// @desc    Create new workspace
// @route   POST /api/workspaces
// @access  Private
export const createWorkspace = async (req, res) => {
  try {
    const { name, description, icon, type } = req.body;
    const userId = req.user._id;

    const workspace = new Workspace({
      name,
      description,
      icon: icon || "Building2",
      owner: userId,
      type: type || "personal",
    });

    await workspace.save();

    res.status(201).json({
      success: true,
      message: "Workspace created successfully",
      data: workspace,
    });
  } catch (error) {
    console.error("Create workspace error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get all user's workspaces
// @route   GET /api/workspaces
// @access  Private
export const getWorkspaces = async (req, res) => {
  try {
    const userId = req.user._id;

    const workspaces = await Workspace.find({
      $or: [{ owner: userId }, { "members.user": userId }],
      isDeleted: { $ne: true },
    }).populate("owner", "name email profilePicture");

    res.json({
      success: true,
      data: workspaces,
    });
  } catch (error) {
    console.error("Get workspaces error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get workspace by ID
// @route   GET /api/workspaces/:id
// @access  Private
export const getWorkspaceById = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate("owner", "name email profilePicture")
      .populate("members.user", "name email profilePicture");

    if (!workspace || workspace.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found",
      });
    }

    // Check if user is member
    const isMember = workspace.owner.toString() === req.user._id.toString() || 
                     workspace.members.some(m => m.user.toString() === req.user._id.toString());

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this workspace",
      });
    }

    res.json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error("Get workspace error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Update workspace
// @route   PUT /api/workspaces/:id
// @access  Private
export const updateWorkspace = async (req, res) => {
  try {
    const { name, description, icon, type } = req.body;
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace || workspace.isDeleted) {
      return res.status(404).json({ success: false, message: "Workspace not found" });
    }

    // Only owner can update
    const isOwner = workspace.owner.toString() === req.user._id.toString();

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Only owner can update workspace" });
    }

    if (name) workspace.name = name;
    if (description) workspace.description = description;
    if (icon) workspace.icon = icon;
    if (type) workspace.type = type;

    await workspace.save();

    res.json({
      success: true,
      message: "Workspace updated successfully",
      data: workspace,
    });
  } catch (error) {
    console.error("Update workspace error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Delete workspace
// @route   DELETE /api/workspaces/:id
// @access  Private
export const deleteWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace || workspace.isDeleted) {
      return res.status(404).json({ success: false, message: "Workspace not found" });
    }

    if (workspace.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only owner can delete workspace" });
    }

    if (workspace.isDefault) {
      return res.status(400).json({ success: false, message: "Cannot delete default workspace" });
    }

    workspace.isDeleted = true;
    workspace.deletedAt = new Date();
    await workspace.save();

    res.json({
      success: true,
      message: "Workspace deleted successfully",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
