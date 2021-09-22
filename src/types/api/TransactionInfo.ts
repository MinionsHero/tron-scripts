
export enum ReceiptResult {
    Success = 'SUCCESS',
    OutOfEnergy = 'OUT_OF_ENERGY',
    REVERT = 'REVERT'
}

export interface TransactionInfo {
    id:
    '0daa9f2507c4e79e39391ea165bb76ed018c4cd69d7da129edf9e95f0dae99e2',
    fee: 4110,
    blockNumber: 7000000,
    blockTimeStamp: 1551102291000,
    contractResult: [''],
    contract_address: '41eb8f23b15acbc0245a4dbbd820b9bde368b02d61',
    receipt:
    {
        origin_energy_usage: 38627,
        energy_usage_total: 38627,
        net_fee: 4110,
        result: ReceiptResult
    },
    log:
    [{
        address: '2ec5f63da00583085d4c2c5e8ec3c8d17bde5e28',
        topics: string[],
        data:
        '000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000989680000000000000000000000000000000000000000000000000000000000000001900000000000000000000000000000000000000000000000000000000009e34000000000000000000000000000000000000000000000000000000000000000000'
    }],
    internal_transactions:
    [{
        hash:
        '9979a48f80e2478f98711f3e9ea1214b9215c40ad6746c9d4b6950e824ef8d49',
        caller_address: '41eb8f23b15acbc0245a4dbbd820b9bde368b02d61',
        transferTo_address: '412ec5f63da00583085d4c2c5e8ec3c8d17bde5e28',
        callValueInfo: string[],
        note: '63616c6c'
    }]
}