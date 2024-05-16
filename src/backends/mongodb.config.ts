import {Db, MongoClient} from "mongodb";
import {promises} from 'fs';

export interface MongodbConfig {
    username: string;
    password: string;
    connectString: string;
    databaseName: string;
    certificateFile?: string;
    certificateBase64?: string;
}

let _config: MongodbConfig;
export const mongodbConfig = (): MongodbConfig | undefined => {
    if (_config) {
        return _config
    }

    console.log('Building config...')
    const config: MongodbConfig = {
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD,
        connectString: process.env.MONGODB_CONNECT_STRING,
        databaseName: process.env.MONGODB_DATABASE_NAME,
        certificateFile: process.env.MONGODB_CERTIFICATE_FILE,
        certificateBase64: process.env.MONGODB_CERTIFICATE_BASE64,
    }

    if (!config.username || !config.password || !config.connectString) {
        console.log('MongoDB config not set: ' + JSON.stringify(config))
        return
    }

    return _config = config
}

let _client: Promise<Db>;
export const mongodbClient = async (): Promise<Db> => {
    if (_client) {
        return _client
    }

    const config: MongodbConfig = mongodbConfig()

    return _client = new Promise<Db>(async (resolve, reject) => {

        let filename = config.certificateFile || '/tmp/cert/ca.crt'
        if (config.certificateBase64) {
            console.log(    '** Processing certificate contents')
            const cert = Buffer.from(config.certificateBase64, 'base64')

            const file = await promises.open(filename, 'r+')
            await promises.writeFile(file, cert)
            await file.close()
        }

        const client = new MongoClient(
            config.connectString,
            {
                auth: {
                    username: config.username,
                    password: config.password,
                },
                tlsCAFile: filename,
            }
        )

        resolve(client.db(config.databaseName))
    })
}
