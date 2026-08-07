import * as yauzl from 'yauzl';
import { once } from 'events';
import * as fs from 'fs';
import * as stream from 'stream';

const extract = async (zipFilePath: string, outputFilePath: string): Promise<void> => {
  const tempPath = outputFilePath + ".tmp";
  let zipFile: yauzl.ZipFile | undefined;
  try {
    zipFile = await yauzl.openPromise(zipFilePath, { lazyEntries: true });
    if (zipFile.entryCount < 1) {
      throw new Error(`Zip file is empty: ${zipFilePath}`);
    }

    zipFile.readEntry(); //get the first entry in the zip
    const [entry] = (await once(zipFile, 'entry')) as [yauzl.Entry];
    const readStream = await zipFile.openReadStreamPromise(entry);
    const writeStream = fs.createWriteStream(tempPath);
    await stream.promises.pipeline(readStream, writeStream);
    await fs.promises.rename(tempPath, outputFilePath);
  } catch (err) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw new Error(`Error extracting ${zipFilePath}: ${err}`, { cause: err });
  } finally {
    zipFile?.close();
  }
}

export { extract };