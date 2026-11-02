import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { emailRequestLimiter, loginLimiter, otpLimiter, registerLimiter, tokenLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { changePasswordBody, emailOnlyBody, loginBody, newPasswordBody, otpBody, registerBody, tokenBody } from '../validators/auth.validators.js';

// /api/auth
export const authRouter = Router();

authRouter.post('/register', registerLimiter, validate({ body: registerBody }), c.register);
authRouter.post('/login', ...loginLimiter, validate({ body: loginBody }), c.login);
authRouter.post('/logout', c.logout);
authRouter.post('/logout-all', authenticate, c.logoutAll);
authRouter.get('/me', authenticate, c.me);
// Email verification by 6-digit code (links from older emails still work through /verify-email).
authRouter.post('/verify-otp', ...otpLimiter, validate({ body: otpBody }), c.verifyOtp);
authRouter.post('/verify-email', tokenLimiter, validate({ body: tokenBody }), c.verifyEmail);
authRouter.get('/email-delivery', c.emailDelivery);
authRouter.post('/resend-verification', ...emailRequestLimiter, validate({ body: emailOnlyBody }), c.resendVerification);
authRouter.post('/forgot-password', ...emailRequestLimiter, validate({ body: emailOnlyBody }), c.forgotPassword);
authRouter.post('/reset-password', tokenLimiter, validate({ body: newPasswordBody }), c.resetPassword);
authRouter.post('/set-password', tokenLimiter, validate({ body: newPasswordBody }), c.setPassword);
authRouter.post('/change-password', authenticate, validate({ body: changePasswordBody }), c.changePassword);
