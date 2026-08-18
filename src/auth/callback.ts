import https from 'node:https';
import { ensureCert } from './cert.ts';
import { REDIRECT_PORT } from '../config.ts';

const waitForCode = async (expectedState: string, timeoutMs: number): Promise<string> => {
  const certData = await ensureCert();
  
  const serverOptions: https.ServerOptions = {
    key: certData.key,
    cert: certData.cert,
  };


  return new Promise<string>((resolve, reject) => {
    const server = https.createServer(serverOptions, (req, res) => {

      const finish = (fn: () => void ) => { clearTimeout(timer); server.close(); server.closeAllConnections(); fn();}

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
          res.end(`Bungie Denied Authorization: ${errorDescription ?? error}`)
          finish(() => reject(new Error(`Bungie Denied Authorization: ${errorDescription ?? error}`)));
          return;
        }
        res.end("Couldnt get OAuth code");
        finish(() => reject(new Error("Couldnt get OAuth code")));
        return;
      }
      
      if (state !== expectedState) {
        finish(() => reject(new Error("OAuth State mismatch.")))
        res.end("OAuth State Mismatch.");
        return;
      }

      res.end("You can close this window")
      finish(() => resolve(code))
      
    });
    
    const timer = setTimeout(() => {
      server.close();
      server.closeAllConnections();
      reject(new Error('Timed out waiting for OAuth callback'));
    }, timeoutMs);
    server.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`OAuth listener failed: ${err.message}`));
    });
    server.listen(REDIRECT_PORT, '127.0.0.1');
    });
}
export { waitForCode };