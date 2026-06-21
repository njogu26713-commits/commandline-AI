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

export default router;
