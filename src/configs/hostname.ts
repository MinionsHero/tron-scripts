import { getCommandParams, getEnvVariable } from "../utils/env"

// reference https://github.com/tronprotocol/documentation-en/blob/master/docs/developers/official-public-nodes.md
export const TronNet: { [netName in string]: string } = {
    Main: 'https://api.trongrid.io',
    Shasta: 'https://api.shasta.trongrid.io',
    Nile: 'https://nile.trongrid.io'
}

const NET_NAME = getCommandParams('NET_NAME')
const hostname = TronNet[NET_NAME]
if (!hostname) {
    throw new Error('Please specify parameters NET_NAME in the command！')
}

export default hostname