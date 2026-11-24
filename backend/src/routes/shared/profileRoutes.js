const router = require("express").Router();
const {
  getProfile,
  updateProfile,
  uploadImage,
  deleteAvatar,
  changePassword,
  changeEmail,
  myReviews,
  myWishlist,
  publicProfile,
} = require("../../controllers/shared/profileController");
const { parseImage } = require("../../middleware/uploadProfile");
const { verifyToken } = require("../../middleware/auth");

router.get("/profile", verifyToken, getProfile);
router.put("/profile", verifyToken, updateProfile);
router.post(
  "/profile/avatar",
  verifyToken,
  parseImage("avatar", 4),
  uploadImage("avatar"),
);
router.post(
  "/profile/cover",
  verifyToken,
  parseImage("cover", 6),
  uploadImage("cover"),
);
router.delete("/profile/avatar", verifyToken, deleteAvatar);
router.put("/profile/password", verifyToken, changePassword);
router.put("/profile/email", verifyToken, changeEmail);
router.get("/profile/reviews", verifyToken, myReviews);
router.get("/profile/wishlist", verifyToken, myWishlist);

router.get("/users/:username", publicProfile);

module.exports = router;
