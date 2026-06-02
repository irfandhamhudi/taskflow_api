// src/routes/profileRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  updateProfile,
  updateProfilePicture,
} from "../controllers/profileController.js";
import multer from "multer";

const router = express.Router();

// Gunakan memoryStorage agar file tidak disimpan ke disk
const upload = multer({
  storage: multer.memoryStorage(), // ← Kunci: simpan di memory
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/svg+xml",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "File type not allowed. Only JPEG, PNG, and SVG images are permitted.",
        ),
      );
    }
  },
});

router.put("/", protect, updateProfile);
router.put(
  "/picture",
  protect,
  upload.single("profilePicture"),
  updateProfilePicture,
);

export default router;
