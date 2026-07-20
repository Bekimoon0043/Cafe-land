import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import menuRouter from "./menu";
import ordersRouter from "./orders";
import tablesRouter from "./tables";
import inventoryRouter from "./inventory";
import staffRouter from "./staff";
import customersRouter from "./customers";
import paymentsRouter from "./payments";
import reportsRouter from "./reports";
import settingsRouter from "./settings";
import uploadRouter from "./upload";
import expensesRouter from "./expenses";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(menuRouter);
router.use(ordersRouter);
router.use(tablesRouter);
router.use(inventoryRouter);
router.use(staffRouter);
router.use(customersRouter);
router.use(paymentsRouter);
router.use(reportsRouter);
router.use(settingsRouter);
router.use(uploadRouter);
router.use(expensesRouter);

export default router;
