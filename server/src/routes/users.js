import express from "express";
const router = express.Router();

router.get("/", (_, res) => res.json({ msg: "Users API working" }));

export default router;
