import { Router } from 'express';
import { list, create, get, update, remove, testConnection } from '../controllers/ghlClientController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.put('/:id', update);
router.delete('/:id', remove);
router.post('/:id/test', testConnection);

export default router;
