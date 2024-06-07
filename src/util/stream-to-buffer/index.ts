import {PassThrough, Stream} from "stream";

const isBuffer = (val: unknown): val is Buffer => {
    return !!val && !!((val as Buffer).buffer)
}

export const streamToBuffer = async (stream: NodeJS.ReadableStream | Buffer | Stream): Promise<Buffer> => {
    if (isBuffer(stream)) {
        return stream
    }

    const buffers: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk) => buffers.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(buffers)));
    })
}


export const mergeStreams = (...streams) => {
    let pass = new PassThrough()
    for (let stream of streams) {
        const end = stream == streams.at(-1);
        pass = stream.pipe(pass, { end })
    }
    return pass
}