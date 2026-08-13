import * as selfsigned from 'selfsigned';
import { writeFile, mkdir, readFile} from 'node:fs/promises';
import { CONFIG_DIR } from '../config.ts';

const generateSelfSignedCert = async () => {
  const { cert, private: key } = await selfsigned.generate([{ name: 'commonName', value: '127.0.0.1' }], {
    notAfterDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
    algorithm: 'sha256',
    extensions: [{
      name: 'subjectAltName',
      altNames: [{ type: 7, ip: '127.0.0.1' }],
    }],
  });

  return { cert, key };
};

const writeCert = async (cert: string, key: string, dirPath: string): Promise<void> => {
  await mkdir(dirPath, { recursive: true, mode: 0o700 });
  await writeFile(`${dirPath}/cert.pem`, cert, { mode: 0o600 });
  await writeFile(`${dirPath}/key.pem`, key, { mode: 0o600 });
}

const readCert = async (dirPath: string): Promise<{ cert: string, key: string } | null> => {
  try {
    const cert = await readFile(`${dirPath}/cert.pem`, 'utf8');
    const key = await readFile(`${dirPath}/key.pem`, 'utf8');
    return { cert, key };
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

const ensureCert = async (): Promise<{ cert: string, key: string }> => {

  let certData = await readCert(CONFIG_DIR);
  if (!certData) {
    certData = await generateSelfSignedCert();
    await writeCert(certData.cert, certData.key, CONFIG_DIR);
  }
  return certData;
}

export { ensureCert };