const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateToken, setAuthCookie } = require('../config/passport');

/**
 * authGuard — verifies JWT from httpOnly cookie.
 * Rotates the token on each request (sliding expiry).
 */
const authGuard = async (req, res, next) => {
  try {
    let token = req.cookies?.token;

    // Fallback to checking the Authorization header (e.g. "Bearer <token>") for iOS/Apple ecosystem
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in.',
        code: 'UNAUTHORIZED',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please sign in again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        code: 'INVALID_TOKEN',
      });
    }

    const user = await User.findById(decoded.sub).select('-__v');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    // Rotate token on each request
    const newToken = generateToken(user._id);
    setAuthCookie(res, newToken);

    // Also send the token in response headers for iOS clients that block cookies
    res.setHeader('X-Auth-Token', newToken);
    res.setHeader('Authorization', `Bearer ${newToken}`);

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authGuard };
