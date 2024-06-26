
export interface WatsonxConfig {
    apiKey: string;
    identityUrl: string;
    endpoint: string;
    version: string;
    defaultDeploymentId: string;
    defaultDeploymentFields: string[];
    defaultLabel: string;
}

let _config: WatsonxConfig;
export const watsonxConfig = (): WatsonxConfig | undefined => {
    if (_config) {
        return _config
    }

    const config: WatsonxConfig = {
        apiKey: process.env.WML_API_KEY,
        endpoint: process.env.WML_ENDPOINT,
        identityUrl: process.env.WML_IDENTITY_URL,
        version: process.env.WML_VERSION,
        defaultDeploymentId: process.env.WML_DEFAULT_DEPLOYMENT_ID,
        defaultDeploymentFields: JSON.parse(process.env.WML_DEFAULT_DEPLOYMENT_FIELDS || '[]'),
        defaultLabel: process.env.WML_DEFAULT_LABEL || 'WHT_PER',
    }

    const isEmpty = <T> (val: T, key: keyof T): boolean => {
        if (!val[key]) {
            console.log(`${String(key)} is empty`)
            return true
        }

        return false
    }

    if (isEmpty(config, 'apiKey') || isEmpty(config, 'endpoint') || isEmpty(config, 'defaultDeploymentId') || isEmpty(config, 'identityUrl')) {
        return
    }

    return _config = config
}

