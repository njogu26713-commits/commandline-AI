import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import projectsRouter from "./projects";
import aiRouter from "./ai";
import repositoryRouter from "./repository";
import deploymentsRouter from "./deployments";
import marketplaceRouter from "./marketplace";
import usersRouter from "./users";
import tradingRouter from "./trading";
import whatsappRouter from "./whatsapp";
import mpesaRouter from "./mpesa";
import botRouter from "./bot";
import portalRouter from "./portal";
import brokersRouter from "./brokers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(projectsRouter);
router.use(aiRouter);
router.use(repositoryRouter);
router.use(deploymentsRouter);
router.use(marketplaceRouter);
router.use(usersRouter);
router.use(tradingRouter);
router.use(whatsappRouter);
router.use(mpesaRouter);
router.use(botRouter);
router.use(portalRouter);
router.use(brokersRouter);

export default router;
