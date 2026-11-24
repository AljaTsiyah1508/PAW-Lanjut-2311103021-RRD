const router = require("express").Router();
const {
  getHome,
  getRecommendations,
  toggleHelpful,
} = require("../../controllers/wisatawan/homeController");
const { getRecommendationPage } = require("../../controllers/wisatawan/recommendController");
const { getSuggestions } = require("../../controllers/wisatawan/reviewHubController");
const { verifyToken, optionalAuth } = require("../../middleware/auth");

router.get("/home", optionalAuth, getHome);
router.get("/recommendations", optionalAuth, getRecommendations);
router.get("/recommendations/page", optionalAuth, getRecommendationPage);
router.get("/review-suggestions", verifyToken, getSuggestions);
router.post("/reviews/:id/helpful", verifyToken, toggleHelpful);

module.exports = router;
