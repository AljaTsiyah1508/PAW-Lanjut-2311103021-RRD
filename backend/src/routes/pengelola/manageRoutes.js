const router = require("express").Router();
const {
  getSummary,
  listDestinations,
  createDestination,
  updateDestination,
  deleteDestination,
  listDestinationPhotos,
  uploadDestinationPhotos,
  setDestinationCover,
  deletePhoto,
  listReviews,
  reviewStats,
  saveReply,
  deleteReply,
} = require("../../controllers/pengelola/manageController");
const { searchPlace } = require("../../controllers/shared/geocodeController");
const { verifyToken, authorizeRoles } = require("../../middleware/auth");
const { requirePengelola } = require("../../middleware/manageAuth");
const { parseGalleryPhotos } = require("../../middleware/upload");

// Semua endpoint di bawah /api/manage: token valid, role pengelola di JWT,
// lalu role dicek ulang di database (requirePengelola)
router.use(verifyToken, authorizeRoles("pengelola"), requirePengelola);

router.get("/summary", getSummary);
router.get("/geocode", searchPlace); // cari alamat & koordinat untuk form destinasi

router.get("/destinations", listDestinations);
router.post("/destinations", createDestination);
router.put("/destinations/:id", updateDestination);
router.delete("/destinations/:id", deleteDestination);

router.get("/destinations/:id/photos", listDestinationPhotos);
router.post("/destinations/:id/photos", parseGalleryPhotos, uploadDestinationPhotos);
router.patch("/destinations/:id/cover", setDestinationCover);
router.delete("/photos/:id", deletePhoto);

router.get("/reviews/stats", reviewStats);
router.get("/reviews", listReviews);
router.put("/reviews/:id/reply", saveReply);
router.delete("/reviews/:id/reply", deleteReply);

module.exports = router;
