import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Meeting from "./src/models/Meeting.js";

async function test() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected!");
    
    console.log("Trying to find meetings...");
    const meetings = await Meeting.find({});
    console.log("Success! Found:", meetings.length);
    
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

test();
