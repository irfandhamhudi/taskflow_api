import express from "express";
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  archiveProject,
  inviteToProject,
  joinProject,
  removeMember,
  updateMemberRole,
  getProjectMembers,
  updateShareSettings,
  joinViaShareLink,
  requestRoleUpgrade,
  getRoleUpgradeRequests,
  handleRoleUpgradeRequest,
  trackShareLinkCopy,
  toggleFavoriteProject,
} from "../controllers/projectController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validations.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Project CRUD
router.post("/", validate("createProject"), createProject);
router.get("/", getProjects);
router.get("/:id", validate("getProject"), getProject);
router.put("/:id", validate("updateProject"), updateProject);
router.delete("/:id", validate("deleteProject"), deleteProject);

// Project archive/unarchive
router.patch("/:id/archive", validate("archiveProject"), archiveProject);
router.patch("/:id/favorite", toggleFavoriteProject);

// Project invitations
router.post("/:id/invite", validate("inviteToProject"), inviteToProject);
router.post("/:id/join", validate("joinProject"), joinProject);

// Di dalam router
router.patch(
  "/:id/share-settings",
  validate("updateShareSettings"),
  updateShareSettings
); // jika punya validation
router.get("/join-link/:id", protect, joinViaShareLink); // GET lebih cocok untuk link klik langsung
router.post("/:id/share-link-copied", trackShareLinkCopy);
// atau POST jika ingin lebih aman: router.post("/join-link/:id", protect, joinViaShareLink);

// Project members management
router.get("/:id/members", validate("getProjectMembers"), getProjectMembers);
router.delete("/:id/members/:memberId", validate("removeMember"), removeMember);
router.patch(
  "/:id/members/:memberId/role",
  validate("updateMemberRole"),
  updateMemberRole
);

// Role upgrade requests
router.post("/:id/role-upgrade", requestRoleUpgrade);
router.get("/:id/role-upgrade/requests", getRoleUpgradeRequests);
router.patch("/:id/role-upgrade/requests/:requestId", handleRoleUpgradeRequest);


export default router;
