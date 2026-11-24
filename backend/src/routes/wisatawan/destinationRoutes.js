const router = require("express").Router();
const {
  getCategories,
  listDestinations,
  getDestination,
  setRating,
  setReview,
  deleteMyReview,
  toggleFavorite,
} = require("../../controllers/wisatawan/destinationController");
const { uploadPhotos, deletePhoto } = require("../../controllers/wisatawan/photoController");
const { parsePhotos } = require("../../middleware/upload");
const { verifyToken, optionalAuth } = require("../../middleware/auth");

router.get("/categories", getCategories);
router.get("/destinations", listDestinations);
router.get("/destinations/:id", optionalAuth, getDestination);
router.put("/destinations/:id/rating", verifyToken, setRating);
router.put("/destinations/:id/review", verifyToken, setReview);
router.delete("/destinations/:id/review", verifyToken, deleteMyReview);
router.post("/destinations/:id/favorite", verifyToken, toggleFavorite);

// Upload foto: verifyToken dulu, baru multer, baru controller
router.post("/destinations/:id/photos", verifyToken, parsePhotos, uploadPhotos);
router.delete("/photos/:id", verifyToken, deletePhoto);

module.exports = router;
