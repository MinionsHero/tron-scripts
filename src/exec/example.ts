import data from 'data/feedData.json'
import { catchError } from 'utils/catchError'
import contractCall from 'hooks/contractCall'

// mock contract exec.
const execute = async function ({ contract, tokenId }: { contract: any, tokenId: string }) {
    // await contract.safeTransferFrom(...args).send({...})
    return {
        tokenId,
        txId: 'e99857494e539ffd7d901974c73e0cb66a1ac06e8608da6df130c34e43ebe300'
    }
}


catchError(contractCall<{ contract: any }, { tokenId: string }, {
    txId: string,
    tokenId: string,
    fee: number,
    result: string
}>({
    callerName: 'defineNft',
    logUniqKey: 'txId',
    exportFileName: 'defineNft.xlsx',
    logTableFields: {
        txId: String,
        tokenId: String,
        fee: Number,
        result: String
    },
    prepare: async ({ tronWeb, logHelper }) => {
        const abi = '' // please import abi json file .
        const addr = '' // please add contract address.
        // const contract = tronWeb.contract(abi, addr)
        return {
            payload: { contract:'' },
            feedData: data
        }
    },
    executor: async ({ payload, feedItem, logHelper }) => {
        const { contract } = payload
        const { tokenId } = feedItem
        const existTokenIds = await logHelper.queryData({ tokenId })
        if (existTokenIds.length > 0) {
            return
        }
        const { txId } = await execute({ contract, tokenId })
        return {
            txId,
            tokenId,
            fee: 0,
            result: ''
        }
    }
}))