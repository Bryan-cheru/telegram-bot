import type { Request, Response, NextFunction } from 'express';

export function requireApiKey(opts?: { headerName?: string; envVarName?: string }) {
  const headerName = (opts?.headerName || 'x-api-key').toLowerCase();
  const envVarName = opts?.envVarName || 'DASHBOARD_API_KEY';

  return (req: Request, res: Response, next: NextFunction) => {
    const expected = process.env[envVarName];

    // If not configured, allow in non-production only
    if (!expected) {
      if ((process.env.NODE_ENV || 'development') !== 'production') return next();
      return res.status(500).json({
        success: false,
        error: `Server misconfigured: ${envVarName} is not set`
      });
    }

    const provided = (req.headers[headerName] as string | undefined) || '';
    if (provided && provided === expected) return next();

    return res.status(401).json({ success: false, error: 'Unauthorized' });
  };
}

