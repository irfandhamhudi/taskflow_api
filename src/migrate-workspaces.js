import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import Project from "./models/Project.js";
import Workspace from "./models/Workspace.js";

dotenv.config();

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const users = await User.find();
    console.log(`Found ${users.length} users`);

    for (const user of users) {
      console.log(`Processing user: ${user.email}`);

      // Ensure default workspace
      let workspace = await Workspace.findOne({ owner: user._id, isDefault: true });
      if (!workspace) {
        workspace = new Workspace({
          name: "My Workspace",
          owner: user._id,
          isDefault: true,
          icon: "🏠",
        });
        await workspace.save();
        console.log(`  Created default workspace for ${user.email}`);
      }

      // Find projects without workspaceId
      const projects = await Project.find({ owner: user._id, workspaceId: { $exists: false } });
      if (projects.length > 0) {
        console.log(`  Found ${projects.length} projects to migrate`);
        await Project.updateMany(
          { owner: user._id, workspaceId: { $exists: false } },
          { $set: { workspaceId: workspace._id } }
        );
        console.log(`  Migrated ${projects.length} projects`);
      }
    }

    console.log("Migration completed");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrate();
