import jwt from "jsonwebtoken";

// Generate JWT token
const generateToken = (res, userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction, // true di prod (HTTPS), false di dev
    sameSite: isProduction ? "none" : "lax", // KUNCI DI SINI
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  return token;
};

const clearToken = (res) => {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie("token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax", // HARUS SAMA persis
    path: "/",
  });
};

// Verify token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Decode token without verification
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

export { generateToken, clearToken, verifyToken, decodeToken };
