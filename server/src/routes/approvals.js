import express from "express";
const router = express.Router();

router.get("/", (_, res) => res.json({ msg: "Approvals API working" }));

export default router;
    