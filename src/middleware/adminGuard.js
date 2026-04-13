/**
 * adminGuard — must be used AFTER authGuard.
 * Checks that the authenticated user has admin privileges.
 */
const adminGuard = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.',
      code: 'NOT_ADMIN',
    });
  }
  next();
};

module.exports = { adminGuard };
