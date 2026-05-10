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

    const headerProvided = (req.headers[headerName] as string | undefined) || '';
    const queryRaw = req.query?.api_key;
    const queryProvided =
      typeof queryRaw === 'string' ? queryRaw : Array.isArray(queryRaw) ? queryRaw[0] : '';

    // Prefer header; allow ?api_key= for EventSource (cannot set headers) — use HTTPS in production
    if (headerProvided && headerProvided === expected) return next();
    if (queryProvided && queryProvided === expected) return next();

    return res.status(401).json({ success: false, error: 'Unauthorized' });
  };
}

