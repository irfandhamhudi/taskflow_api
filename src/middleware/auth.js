import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token = req.cookies.token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  console.log("Protect middleware called. Token exists:", !!token);
  try {
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      clearToken(res);
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: "Please verify your email",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    clearToken(res);
    res.status(401).json({
      success: false,
      message: "Not authorized, token failed",
    });
  }
};

// Socket.io authentication middleware
export const socketAuth = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.cookie?.split("token=")[1]?.split(";")[0];

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user
    const user = await User.findById(decoded.userId).select(
      "_id isVerified isActive"
    );

    if (!user || !user.isVerified || !user.isActive) {
      return next(new Error("Authentication error: Invalid user"));
    }

    // Attach user ID to socket
    socket.userId = user._id;
    next();
  } catch (error) {
    console.error("Socket auth error:", error);
    next(new Error("Authentication error"));
  }
};

const clearToken = (res) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });
};

export default { protect, socketAuth };
