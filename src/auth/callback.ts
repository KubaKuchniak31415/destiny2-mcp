import https from 'node:https';
import { ensureCert } from './cert.ts';
import { BUNGIE_REDIRECT_URI, REDIRECT_PORT } from '../config.ts';

const waitForCode = async (expectedState: string, timeoutMs: number): Promise<string> => {
  const certData = await ensureCert();
  
  const serverOptions: https.ServerOptions = {
    key: certData.key,
    cert: certData.cert,
  };


  return new Promise<string>((resolve, reject) => {
    const server = https.createServer(serverOptions, (req, res) => {

      const finish = (fn: () => void ) => { clearTimeout(timer); server.close(); server.close(); fn();}

      const url = new URL(req.url ?? '/', `https://127.0.0.1:${REDIRECT_PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      
      if (!code) {
        const error = url.searchParams.get('error')
        if (error) {
          const errorDescription = url.searchParams.get('error_description')
          res.writeHead(400, {'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close'})
          res.end(`Bungie Denied Authorization: ${errorDescription ?? error}`)
          finish(() => reject(new Error(`Bungie Denied Authorization: ${errorDescription ?? error}`)));
          return;
        }
        res.writeHead(500, {'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close'})
        res.end("Couldnt get OAuth code");
        finish(() => reject(new Error("Couldnt get OAuth code")));
        return;
      }
      
      if (state !== expectedState) {
        res.writeHead(500, {'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close'})
        res.end("OAuth State Mismatch.");
        finish(() => reject(new Error("OAuth State mismatch.")))
        return;
      }

      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close'})
      res.end("You can close this window", () => server.closeAllConnections())
      finish(() => resolve(code))
      
    });
    
    const timer = setTimeout(() => {
      server.close();
      server.closeAllConnections();
      reject(new Error(`Timed out waiting for OAuth callback. Make sure the registered bungie apps redirect URL matches ${BUNGIE_REDIRECT_URI}`));
    }, timeoutMs);
    server.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`OAuth listener failed: ${err.message}`));
    });
    server.listen(REDIRECT_PORT, '127.0.0.1');
    });
}
export { waitForCode };