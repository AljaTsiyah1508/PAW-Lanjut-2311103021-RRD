const router = require("express").Router();
const {
  list,
  readAll,
  readOne,
} = require("../../controllers/shared/notificationController");
const { verifyToken } = require("../../middleware/auth");

router.get("/notifications", verifyToken, list);
router.put("/notifications/read-all", verifyToken, readAll);
router.put("/notifications/:id/read", verifyToken, readOne);

module.exports = router;
