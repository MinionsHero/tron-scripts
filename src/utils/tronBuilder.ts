import { Base58CheckString } from 'src/types/global';
import TronWeb from 'tronweb'
import nodeUrl from '../configs/hostname';
import { getCommandParams, getEnvVariable } from './env';
import fs from 'fs-extra'
import { JsonObject } from 'type-fest';


let tronWebInstance: TronWeb | null = null

function createTronWeb() {
    const privateKey = getEnvVariable('PRIVATE_KEY', true)
    const apiKey = getEnvVariable('API_KEY', true)
    const HttpProvider = TronWeb.providers.HttpProvider
    const fullNode = new HttpProvider(nodeUrl);
    const solidityNode = new HttpProvider(nodeUrl);
    const eventServer = new HttpProvider(nodeUrl);
    const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);
    if (getCommandParams('NET_NAME') === 'MAIN_NET') {
        //Only main net need to set api-key
        tronWeb.setHeader({ "TRON-PRO-API-KEY": apiKey });
    }
    return tronWeb
}

export function getTronWebInstance(): TronWeb {
    if (!tronWebInstance) {
        tronWebInstance = createTronWeb()
    }
    return tronWebInstance
}

const contractMap: { [key in Base58CheckString]: any } = {}

export async function createContract(abiPath: string, contractAddr: Base58CheckString): any {
    if (contractMap[contractAddr]) {
        return contractMap[contractAddr]
    }
    const tronWeb = getTronWebInstance()
    if (!fs.existsSync(abiPath)) {
        throw new Error(`Invoke createContract, but ${abiPath} is not exist.`)
    }
    const abiJson = require(abiPath)
    let abi: JsonObject[] = []
    if (typeof abiJson === 'object' && !Array.isArray(abiJson)) {
        if (!abiJson['entrys'] || !Array.isArray(abiJson['entrys'])) {
            throw new Error('Invoke createContract, but abi is not a valid abi-json.')
        }
        abi = abiJson['entrys']
    } else if (Array.isArray(abiJson)) {
        abi = abiJson
    } else {
        throw new Error('Invoke createContract, but abi is not a valid abi-json.')
    }
    try {
        contractMap[contractAddr] = await tronWeb.contract(abi, contractAddr);
        return contractMap[contractAddr]
    } catch (e) {
        contractMap[contractAddr] = undefined
        throw e
    }
}