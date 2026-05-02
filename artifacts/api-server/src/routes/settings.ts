import { Router, type IRouter } from "express";
import { isSimulated } from "../services/messaging";

const router: IRouter = Router();

router.get("/settings/status", (_req, res) => {
  return res.json({
    sms: isSimulated.sms ? "simulated" : "active",
    whatsapp: isSimulated.whatsapp ? "simulated" : "active",
    email: isSimulated.email ? "simulated" : "active",
  });
});

export default router;
