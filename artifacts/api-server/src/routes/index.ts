import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contactsRouter from "./contacts";
import templatesRouter from "./templates";
import campaignsRouter from "./campaigns";
import inboxRouter from "./inbox";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contactsRouter);
router.use(templatesRouter);
router.use(campaignsRouter);
router.use(inboxRouter);
router.use(dashboardRouter);
router.use(webhooksRouter);
router.use(settingsRouter);

export default router;
