// src/controllers/profileController.js
import User from "../models/User.js";
import { v2 as cloudinary } from "cloudinary";
import https from "https";

// Pastikan config cloudinary sudah ada (bisa dipindah ke file config terpisah)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  // Hanya untuk development jika SSL bermasalah (hapus di production!)
  agent: new https.Agent({ rejectUnauthorized: false }),
});

/**
 * @desc    Update user profile information
 * @route   PUT /api/profile
 * @access  Private
 */
// src/controllers/profileController.js

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      firstName,
      lastName,
      phone,
      address,
      dateOfBirth,
      name,
      bio, // ← tambah
      jobTitle, 
      notificationTypes // ← tambah
      // email,     // optional, biasanya dipisah
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Update fields
    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (address !== undefined) user.address = address.trim();

    // Tambahkan ini
    if (bio !== undefined) user.bio = bio.trim();
    if (jobTitle !== undefined) user.jobTitle = jobTitle.trim();

    // Update notification preferences
    if (notificationTypes) {
       user.settings.notificationTypes = {
         ...user.settings.notificationTypes,
         ...notificationTypes
       };
    }

    if (req.body.emailNotifications !== undefined) {
      user.settings.emailNotifications = !!req.body.emailNotifications;
    }
    
    if (req.body.desktopNotifications !== undefined) {
      user.settings.desktopNotifications = !!req.body.desktopNotifications;
    }

    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Format tanggal lahir tidak valid (gunakan YYYY-MM-DD)",
        });
      }
      user.dateOfBirth = dob;
    }

    if (name) user.name = name.trim();

    await user.save();

    const updatedUser = await User.findById(userId).select(
      "-password -sessions -otp -otpExpires -resetPasswordToken -resetPasswordExpires",
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * @desc    Update / Upload profile picture
 * @route   PUT /api/profile/picture
 * @access  Private
 * @note    Menggunakan multer untuk upload file (asumsi sudah di-setup di route)
 */
export const updateProfilePicture = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No profile picture uploaded",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Jika user sudah punya profile picture di Cloudinary → hapus yang lama
    if (user.profilePicture && user.profilePicture.includes("cloudinary")) {
      try {
        const publicId = user.profilePicture
          .split("/upload/")[1]
          .replace(/^v\d+\//, "")
          .replace(/\.[^.]+$/, "");

        await cloudinary.uploader.destroy(publicId, { invalidate: true });
      } catch (err) {
        console.warn("Failed to delete old profile picture:", err.message);
      }
    }

    // Upload gambar baru ke Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "taskflow/profiles",
            resource_type: "image",
            public_id: `user_${userId}`,
            overwrite: true,
            transformation: [
              { width: 400, height: 400, crop: "fill" },
              { quality: "auto" },
              { fetch_format: "auto" },
            ],
          },
          (err, result) => (err ? reject(err) : resolve(result)),
        )
        .end(req.file.buffer);
    });

    // Simpan URL baru
    user.profilePicture = uploadResult.secure_url;
    await user.save();

    res.json({
      success: true,
      message: "Profile picture updated successfully",
      data: {
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.error("Update profile picture error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile picture",
    });
  }
};
