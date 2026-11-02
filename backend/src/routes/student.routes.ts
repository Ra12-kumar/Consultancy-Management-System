import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/student.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectIdSchema } from '../validators/common.js';
import { profileBody, updateMeBody } from '../validators/student.validators.js';
import { studentCatalogRouter } from './catalog.routes.js';
import { studentUpdatesRouter } from './enquiry.routes.js';
import { studentAnnouncementsRouter } from './stage7.routes.js';
import { studentSupportRouter } from './support.routes.js';

// /api/students — the signed-in student's own data (ids always come from the session).
export const studentRouter = Router();
studentRouter.use(authenticate);

studentRouter.get('/me', requireRole('student'), c.getMe);
studentRouter.patch('/me', requireRole('student'), validate({ body: updateMeBody }), c.updateMe);
studentRouter.get('/me/profile', requireRole('student'), c.getMyProfile);
studentRouter.put('/me/profile', requireRole('student'), validate({ body: profileBody }), c.saveMyProfile);
// Suggested colleges and upcoming admission deadlines for shortlisted colleges.
studentRouter.get('/me/recommendations', requireRole('student'), c.myRecommendations);
studentRouter.use(studentCatalogRouter);
studentRouter.use(studentUpdatesRouter);
studentRouter.use(studentSupportRouter);
studentRouter.use(studentAnnouncementsRouter);
// The student themself, or an admin with students.read (checked in the service).
studentRouter.get('/:id', validate({ params: z.object({ id: objectIdSchema }) }), c.getStudent);
