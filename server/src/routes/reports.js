import { Router } from 'express';
import { generate, listReports, getReport, deleteReport } from '../controllers/reportController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
router.get('/', listReports);
router.post('/generate', generate);
router.get('/:id', getReport);
router.delete('/:id', deleteReport);

export default router;
