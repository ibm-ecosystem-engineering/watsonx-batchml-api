import {Db, MongoClient} from "mongodb";

export interface MongodbConfig {
    username: string;
    password: string;
    connectString: string;
    databaseName: string;
    certificateFile: string;
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
    }

    if (!config.username || !config.password || !config.connectString) {
        console.log('MongoDB config not set: ' + JSON.stringify(config))
        return
    }

    return _config = config
}

let _client: Db;
export const mongodbClient = () => {
    if (_client) {
        return _client
    }

    const config: MongodbConfig = mongodbConfig()

    return _client = new MongoClient(
        config.connectString,
        {
            auth: {
                username: config.username,
                password: config.password,
            },
            tlsCAFile: config.certificateFile,
        }
    )
        .db(config.databaseName)
}
