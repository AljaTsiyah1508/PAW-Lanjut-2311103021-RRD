const router = require("express").Router();
const {
  getSummary,
  listUsers,
  userStats,
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  listPengelola,
  listDestinations,
  destinationStats,
  createDestination,
  updateDestination,
  setDestinationOwner,
  deleteDestination,
  listDestinationPhotos,
  uploadDestinationPhotos,
  setDestinationCover,
  deletePhoto,
  listReviews,
  reviewStats,
  reportsCount,
  dismissReports,
  deleteReview,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../../controllers/admin/adminController");
const { searchPlace } = require("../../controllers/shared/geocodeController");
const { verifyToken, authorizeRoles } = require("../../middleware/auth");
const { requireAdmin } = require("../../middleware/adminAuth");
const { parseGalleryPhotos } = require("../../middleware/upload");

// Semua endpoint di bawah /api/admin: token valid, role admin di JWT,
// lalu role dicek ulang di database (requireAdmin)
router.use(verifyToken, authorizeRoles("admin"), requireAdmin);

router.get("/summary", getSummary);
router.get("/geocode", searchPlace); // cari alamat & koordinat untuk form destinasi

router.get("/users/stats", userStats);
router.get("/users", listUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.patch("/users/:id/role", updateUserRole);
router.delete("/users/:id", deleteUser);
router.get("/pengelola", listPengelola);

router.get("/destinations/stats", destinationStats);
router.get("/destinations", listDestinations);
router.post("/destinations", createDestination);
router.put("/destinations/:id", updateDestination);
router.patch("/destinations/:id/owner", setDestinationOwner);
router.delete("/destinations/:id", deleteDestination);

// Foto destinasi: multer dijalankan setelah cek admin (router.use di atas)
router.get("/destinations/:id/photos", listDestinationPhotos);
router.post("/destinations/:id/photos", parseGalleryPhotos, uploadDestinationPhotos);
router.patch("/destinations/:id/cover", setDestinationCover);
router.delete("/photos/:id", deletePhoto);

router.get("/reviews/stats", reviewStats);
router.get("/reports/count", reportsCount);
router.get("/reviews", listReviews);
router.patch("/reviews/:id/dismiss", dismissReports);
router.delete("/reviews/:id", deleteReview);

router.get("/categories", listCategories);
router.post("/categories", createCategory);
router.put("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);

module.exports = router;
