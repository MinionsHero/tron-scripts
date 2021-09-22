import { config, DotenvParseOutput } from 'dotenv'
const { error, parsed } = config()
if (error) {
    throw error
}

export function getEnvVariable(key: string, isThrowError: boolean = true): string {
    if (!parsed) throw new Error('Parse .env file failed.')
    const val = parsed[key]
    if (!val && isThrowError) throw new Error(`Please specify parameter ${key} in the .env file`)
    return val || ''
}


export function getCommandParams(key: string, isThrowError: boolean = true): string {
    const val = process.env[key]
    if (!val && isThrowError) throw new Error(`Please specify parameter ${key} in the command`)
    return val || ''
}