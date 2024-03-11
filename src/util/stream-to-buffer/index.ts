
const isBuffer = (val: unknown): val is Buffer => {
    return !!val && !!((val as Buffer).buffer)
}

export const streamToBuffer = async (stream: NodeJS.ReadableStream | Buffer): Promise<Buffer> => {
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
