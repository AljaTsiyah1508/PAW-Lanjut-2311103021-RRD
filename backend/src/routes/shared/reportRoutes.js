const router = require("express").Router();
const { status, reportReview } = require("../../controllers/shared/reportController");
const { verifyToken } = require("../../middleware/auth");

router.get("/reports/status", status);
router.post("/reviews/:id/report", verifyToken, reportReview);

module.exports = router;
