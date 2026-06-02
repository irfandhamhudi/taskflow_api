import express from "express";
import multer from "multer";
import {
  uploadFile,
  getFiles,
  deleteFile,
  getFile,
} from "../controllers/fileController.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validations.js";

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
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "application/zip",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "File type not allowed. Only images, documents, and PDFs are permitted.",
        ),
      );
    }
  },
});

// Auth untuk semua route
router.use(protect);

// Upload file (langsung ke Cloudinary dari memory)
router.post("/", upload.array("files", 10), validate("uploadFile"), uploadFile);

// Management file
router.get("/", getFiles);
router.get("/:id", validate("getFile"), getFile);

router.delete("/:id", validate("deleteFile"), deleteFile);

export default router;
