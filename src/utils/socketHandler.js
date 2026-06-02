import { Server } from "socket.io";
import User from "../models/User.js";

import { socketAuth } from "../middleware/auth.js";

// Variable untuk menyimpan instance io
let io;

// Map untuk tracking socket per user
const userSockets = new Map();

// Fungsi inisialisasi socket.io
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:5173", // Ganti dengan frontend URL yang sesuai
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Use authentication middleware
  io.use(socketAuth);

  // Handle connection
  io.on("connection", (socket) => {
    const userId = socket.userId?.toString();
    console.log(`User connected: ${socket.id} (User: ${userId})`);

    if (userId) {
      // Join room per user untuk emitToUser
      socket.join(`user:${userId}`);

      // Track socket
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);

      // Update online status in DB
      const updateOnlineStatus = async () => {
        try {
          await User.findByIdAndUpdate(userId, {
            isOnline: true,
            lastSeen: new Date(),
          });
          // Broadcast status change
          io.emit("user_status_change", { userId, isOnline: true });
        } catch (error) {
          console.error("Error updating online status:", error);
        }
      };
      updateOnlineStatus();

      console.log(`User ${userId} joined room: user:${userId}`);
    }

    // Handle join project room
    socket.on("join_project", (projectId) => {
      if (projectId) {
        socket.join(`project:${projectId}`);
        console.log(
          `Socket ${socket.id} joined project room: project:${projectId}`
        );
      }
    });

    // Handle join workspace room
    socket.on("join_workspace", (workspaceId) => {
      if (workspaceId) {
        socket.join(`workspace:${workspaceId}`);
        console.log(
          `Socket ${socket.id} joined workspace room: workspace:${workspaceId}`
        );
      }
    });

    // Handle leave workspace room
    socket.on("leave_workspace", (workspaceId) => {
      if (workspaceId) {
        socket.leave(`workspace:${workspaceId}`);
        console.log(
          `Socket ${socket.id} left workspace room: workspace:${workspaceId}`
        );
      }
    });

    // Handle join chat room
    socket.on("join_chat", (conversationId) => {
      if (conversationId) {
        socket.join(`chat:${conversationId}`);
        console.log(
          `Socket ${socket.id} joined chat room: chat:${conversationId}`
        );
      }
    });

    // Handle typing status
    socket.on("typing", ({ conversationId, userId, isTyping }) => {
      if (conversationId) {
        socket.to(`chat:${conversationId}`).emit("user_typing", { conversationId, userId, isTyping });
      }
    });

    // Handle manual identification (e.g. after login)
    socket.on("identify", (userId) => {
      if (!userId) return;
      
      const uid = userId.toString();
      socket.join(`user:${uid}`);
      
      // Track socket
      if (!userSockets.has(uid)) {
        userSockets.set(uid, new Set());
      }
      userSockets.get(uid).add(socket.id);

      // Update online status in DB (copy of connection logic)
      const updateOnlineStatus = async () => {
        try {
          // Check if already online to avoid redundant DB writes
          // But strict update is safer
          await User.findByIdAndUpdate(uid, {
            isOnline: true,
            lastSeen: new Date(),
          });
          io.emit("user_status_change", { userId: uid, isOnline: true });
        } catch (error) {
          console.error("Error updating online status (identify):", error);
        }
      };
      updateOnlineStatus();

      console.log(`User identified via event: ${socket.id} -> ${uid}`);
    });



    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.id}`);
      if (userId) {
        const sockets = userSockets.get(userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSockets.delete(userId);

            // Update offline status in DB
            try {
              await User.findByIdAndUpdate(userId, {
                isOnline: false,
                lastSeen: new Date(),
              });
              // Broadcast status change
              io.emit("user_status_change", { userId, isOnline: false, lastSeen: new Date() });
            } catch (error) {
              console.error("Error updating offline status:", error);
            }
          }
        }
      }
    });
  });

  console.log("Socket.io initialized");
};

// Fungsi emit ke room spesifik (misal project:${projectId})
export const emitSocketEvent = (room, event, data) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }
  io.to(room).emit(event, data);
  console.log(`Emitted event '${event}' to room '${room}'`);
};

// Fungsi emit ke user spesifik via room user:${userId}
export const emitToUser = (userId, event, data) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }
  io.to(`user:${userId}`).emit(event, data);
  console.log(`Emitted event '${event}' to user '${userId}'`);
};

// Fungsi emit ke banyak user sekaligus
export const emitToMultipleUsers = (userIds, event, data) => {
  if (!io || !userIds || userIds.length === 0) return;
  
  const rooms = userIds.map(id => `user:${id}`);
  io.to(rooms).emit(event, data);
  console.log(`Emitted event '${event}' to ${userIds.length} users`);
};

// Opsional: Fungsi untuk check jika user online
export const isUserOnline = (userId) => {
  return userSockets.has(userId) && userSockets.get(userId).size > 0;
};
