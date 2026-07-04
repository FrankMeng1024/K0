import { Router } from 'express';

const router = Router();

router.get('/whoami', (req, res) => {
  res.json({ user_id: req.user.id, source: req.user.source });
});

export default router;
