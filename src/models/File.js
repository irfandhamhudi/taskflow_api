import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  originalName: String,
  fileUrl: {
    type: String,
    required: true,
  },
  thumbnailUrl: String,
  fileType: {
    type: String,
    required: true,
  },
  mimeType: String,
  fileSize: {
    type: Number,
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Task",
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  accessKey: String,
  downloads: {
    type: Number,
    default: 0,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  deletedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes
fileSchema.index({ uploadedBy: 1, createdAt: -1 });
fileSchema.index({ projectId: 1, createdAt: -1 });
fileSchema.index({ taskId: 1, createdAt: -1 });
fileSchema.index({ fileType: 1 });
fileSchema.index({ isPublic: 1 });

// Pre-save middleware
fileSchema.pre("save", function () {
  this.updatedAt = new Date();
});

// Instance methods
fileSchema.methods.incrementDownload = function () {
  this.downloads += 1;
  return this;
};

fileSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  return this;
};

// Instance methods
fileSchema.methods.incrementDownload = function () {
  this.downloads += 1;
  return this;
};

fileSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  return this;
};

const File = mongoose.model("File", fileSchema);

export default File;
