import * as yauzl from 'yauzl';
import { once } from 'events';
import * as fs from 'fs';
import * as stream from 'stream';

const extract = async (zipFilePath: string, outputFilePath: string): Promise<void> => {
  try {
    const zipFile = await yauzl.openPromise(zipFilePath, { lazyEntries: true });
    zipFile.readEntry(); //get the first entry in the zip
    const [entry] = (await once(zipFile, 'entry')) as [yauzl.Entry];
    const readStream = await zipFile.openReadStreamPromise(entry);
    const writeStream = fs.createWriteStream(outputFilePath);
    await stream.promises.pipeline(readStream, writeStream);
  } catch (err) {
    throw new Error(`Error extracting ${zipFilePath}: ${err}`);
  }
}

export { extract };