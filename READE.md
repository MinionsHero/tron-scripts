# # Tron scripts

> Scripts for batch execution task.

If you want to perform a batch task, simply execute a function in hooks.

> Before do this, you should add variables in .env
>
> ```shell
> PRIVATE_KEY=[Your tron wallet private key]
> API_KEY=[Your trongrid api key]
> ```

```typescript
import { catchError } from 'utils/catchError'

contractCall<PayLoad, FeedDataItem, T extends TableColumnValue>({
    callerName: 'defineNftSell', // must be a camelCase , it will be take as a tableName in database.
    logUniqKey: 'txId', // uniq key for remove duplicate data
    exportFileName: 'defineNftSell.xlsx', // export file when execute end.
    // which is the table column name, when create table in database
    logTableFields: {
        txId: String,
        tokenId: Number,
        fee: Number,
        result: String
    },
    // prepare payload.
    prepare: async ({ tronWeb, logHelper }) => {
        const contract = tronWeb.contract(abi, addr)
        return {
            payload: { contract },
            feedData: [item1, item2, ...] // array data
        }
    },
    // execute every item in feedData
    executor: async ({ payload, feedItem, logHelper }) => {
        const { contract } = payload
        const { tokenId } = feedItem
        const existTokenIds = await logHelper.queryData({ tokenId })
        if (existTokenIds.length > 0) {
            // If you want to ignore item, just return.
            return
        }
        const { txId } = await contract.abiName(...args).send({
            feeLimit:500000,
            shouldPollResponse: false
        })
        // return table column values.
        // fee and result is required.
        return {
            txId,
            tokenId,
            fee: 0,
            result: ''
        }
    }
})

```
