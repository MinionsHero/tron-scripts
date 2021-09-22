import { getTronWebInstance } from "../utils/tronBuilder";
import { LogHelper, TableColumn, TableColumnValue } from "../utils/fileUtil";
import delay from 'delay'
import PromiseQueue from 'promise-queue'
import TronWeb from "tronweb";
import chalk from "chalk";
import { prompt } from "enquirer";
import emoji from 'node-emoji'
import { upperFirst } from 'lodash'
import { ReturnPromiseOrSelf } from "../types/global";
import ora from '../libs/ora'
import jsonSafeStringify from 'fast-safe-stringify'
import { ReceiptResult, TransactionInfo } from "src/types/api/TransactionInfo";

function jsonStringify(json: any) {
    if (typeof json === 'function') {
        return json.toString()
    }
    if (typeof json !== 'object') {
        return json
    }
    return jsonSafeStringify(json)
}


enum VerifyStatus {
    NotVerify = 0,
    Verified = 1
}

export interface ExecQueuePoolMax {
    contractCall?: number,
    queryTransaction?: number,
}

/**
 * payload: any prepared args to contractExecute called args
 * feedData: original data, contractExecute will execute every item.
 * tableFields: log table column defination.
 */
export type PrepareReturnType<PayLoad, FeedDataItem> = { payload: PayLoad, feedData: FeedDataItem[] }

export interface ContractExecuteErrorHandler<PayLoad, FeedDataItem, T extends TableColumnValue> {
    (e: Error, args: ContractExecuteArgs<PayLoad, FeedDataItem, T>, retry: () => Promise<void>): ReturnPromiseOrSelf<any>
}

export type ContractExecuteArgs<PayLoad, FeedDataItem, T extends TableColumnValue> = {
    payload: PayLoad,
    feedItem: FeedDataItem,
    index: number,
    logHelper: LogHelper<T>,
    tronWeb: TronWeb
}

export interface ContractCallerArgs<PayLoad, FeedDataItem, T extends TableColumnValue> {
    callerName: string,
    logUniqKey?: string,
    exportFileName?: string,
    isCheckTransaction?: boolean,
    poolMax?: ExecQueuePoolMax,
    logTableFields: TableColumn,
    prepare: (args: { tronWeb: TronWeb, logHelper: LogHelper<T> }) => ReturnPromiseOrSelf<PrepareReturnType<PayLoad, FeedDataItem>>,
    // optional, if it is not exist,contractExecute will be execute loop.
    executeErrorHandler?: ContractExecuteErrorHandler<PayLoad, FeedDataItem, T>,
    executor: (args: ContractExecuteArgs<PayLoad, FeedDataItem, T>) => ReturnPromiseOrSelf<(T | void)>,
    // optional, if it is not exist,transactionConfirmExecute will be execute loop.
    waitBlockConfirmed?: () => Promise<boolean>
    checkErrorHandler?: ContractExecuteErrorHandler<PayLoad, T, T>,
    checkExecutor?: ((args: ContractExecuteArgs<PayLoad, T, T>) => ReturnPromiseOrSelf<T | void>),
    getSuccessCount?: (data: T[]) => ReturnPromiseOrSelf<number>
}

interface ErrorLogItem extends TableColumnValue {
    payload: string,
    feedItem: string,
    position: number,
    localTime: Date,
    errorMessage: string
}

export async function queryTransaction<T>(txId: string, tronWeb: TronWeb, retry = 0): Promise<{ txId: string, fee: number, result: string, info: TransactionInfo }> {
    const info: TransactionInfo = await tronWeb.trx.getTransactionInfo(txId);
    if (info.receipt) {
        const result = info.receipt.result
        const fee = info.fee
        return {
            txId,
            fee: Number(fee) / 1e6,
            result,
            info
        }
    } else if (retry < 2) {
        await delay(60000)
        return queryTransaction(txId, tronWeb, ++retry)
    }
    throw new Error(`No txId = ${txId} in tronscan.`)
}

export default async function contractCaller<PayLoad, FeedDataItem, T extends TableColumnValue>(args: ContractCallerArgs<PayLoad, FeedDataItem, T>) {
    const { callerName, isCheckTransaction, logUniqKey, exportFileName, poolMax, logTableFields, prepare, executor, executeErrorHandler, waitBlockConfirmed, checkExecutor, checkErrorHandler, getSuccessCount } = args
    // only explicitly set isCheckTransaction = true / false
    const _isCheckTransaction = isCheckTransaction === undefined ? true : isCheckTransaction
    if ((!_isCheckTransaction) && checkExecutor) {
        throw new Error(`If you wan't to set checkExecutor, you should set isCheckTransaction = true or remove isCheckTransaction option .`)
    }
    if (!/^[A-Za-z]+$/g.test(callerName)) {
        throw new Error('paramter callerName must be /[A-Za-z]+/')
    }
    console.log(chalk.green(`${upperFirst(callerName)} start now, you can go to starBuck to take a coffee.`))
    const tronWeb = getTronWebInstance()
    const verifyField = '_VERIFY'
    const logHelper = new LogHelper<T>(callerName, { ...logTableFields, [verifyField]: Number })
    const errorHelper = new LogHelper<ErrorLogItem>(callerName + 'Error', {
        payload: String,
        feedItem: String,
        position: Number,
        localTime: Date,
        errorMessage: String
    })
    const { payload, feedData } = await prepare({ tronWeb, logHelper })
    const queue = new PromiseQueue(poolMax && poolMax.contractCall || 1) // Contract call should serialized.
    const queryCheckedSql = (tableName: string) => `SELECT * FROM ${tableName} WHERE ${verifyField}=${VerifyStatus.Verified} ORDER BY ID ASC`
    const queryUncheckedSql = (tableName: string) => `SELECT * FROM ${tableName} WHERE ${verifyField}=${VerifyStatus.NotVerify} ORDER BY ID ASC`
    // query old status to check if NOT_VERIFY status item is existed.
    const unCheckedData = await logHelper.queryData(queryUncheckedSql)
    // progress
    let totalCount = 0

    async function checkResult(unCheckedData: T[]) {
        console.log(`${chalk.green(`Check the ${callerName} records `)}${chalk.greenBright(emoji.get('traffic_light'))}...`)
        const spinner = ora('Transaction is checking.').start();
        let totalCount = 0
        if (unCheckedData.length > 0) {
            const queue = new PromiseQueue(poolMax && poolMax.queryTransaction || 20)
            //executor for  every feedItem
            const _check = checkExecutor || async function (args: ContractExecuteArgs<PayLoad, T, T>) {
                const { feedItem } = args
                if (typeof feedItem.txId !== 'string' && !checkExecutor) {
                    throw new Error('If feedItem has not txId, you should supply checkExecutor option.')
                }
                const txId = feedItem.txId as string
                try {
                    const { fee, result } = await queryTransaction(txId, tronWeb)
                    return {
                        ...feedItem,
                        txId,
                        fee,
                        result
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        console.error(e)
                        return {
                            ...feedItem,
                            txId,
                            fee: 0,
                            result: e.message
                        }
                    }
                }
            }
            const execution = async function (feedItem: T, index: number) {
                const executeArgs = { payload, feedItem, tronWeb, logHelper, index }
                try {
                    const result = await _check(executeArgs)
                    if (result) {
                        await logHelper.changeData({ ...result, [verifyField]: VerifyStatus.Verified }, logUniqKey)
                        totalCount += 1
                        spinner.text = `Transaction is checking. ${totalCount}/${unCheckedData.length}`
                        return
                    }
                } catch (e) {
                    const retry = async function () {
                        await delay(1000)
                        return await execution(feedItem, index)
                    }
                    spinner.text = chalk.red(`Throw error in checkExecutor: ${(e as Error).message},${totalCount}/${unCheckedData.length}`)
                    if (checkErrorHandler) {
                        // if it throw queue will received
                        await checkErrorHandler(e as Error, executeArgs, retry)
                    } else {
                        await retry()
                    }
                }
            }

            try {
                await Promise.all(unCheckedData.map((el, i) => {
                    return queue.add(() => execution(el, i))
                }))
                spinner.stop()
                const checked = await logHelper.queryData(queryCheckedSql)
                const _getSuccessCount = getSuccessCount || function (data: T[]) {
                    return data.filter(el => el.result === ReceiptResult.Success).length
                }
                const successCount = await _getSuccessCount(checked)
                const errorCount = checked.length > successCount ? checked.length - successCount : 0
                const unChecked = await logHelper.queryData(queryUncheckedSql)
                console.log(`${chalk.green(`${upperFirst(callerName)} is completed !`)}, ${chalk.green(`${successCount} success ${emoji.get('white_check_mark')}`)}, ${chalk.red(`${errorCount} fail ${emoji.get('negative_squared_cross_mark')}`)}, ${chalk.red(`${unChecked.length} not verified ${emoji.get('thinking_face')}`)}`)
            } catch (e) {
                throw e
            }
        } else {
            spinner.stop()
            console.log(`${chalk.red(`${upperFirst(callerName)} is completed, noting to check!`)}`)
        }
        await logHelper.exportFile(`${callerName}_data.json`)
        if (exportFileName) {
            await logHelper.exportFile(exportFileName)
            console.log(`${chalk.green(`The file of ${exportFileName} has be exported in project output/data dir`)}`)
        }
    }

    if (_isCheckTransaction && unCheckedData && unCheckedData.length > 0) {
        const { question: answer } = await prompt<{ question: boolean }>({
            type: 'confirm',
            name: 'question',
            message: chalk.redBright(`The last ${callerName} has unchecked data (total ${unCheckedData.length}), would you like to check it?`)
        })
        if (answer) {
            await checkResult(unCheckedData)
            return
        }
    }

    //executor for  every feedItem
    const execution = async function (feedItem: FeedDataItem, index: number) {
        const executeArgs = { payload, feedItem, tronWeb, logHelper, index }
        try {
            const result = await executor(executeArgs)
            if (result) {
                await logHelper.appenData({ ...result, [verifyField]: VerifyStatus.NotVerify })
            }
            totalCount += 1
            spinner.text = `Contract is exectuting. ${totalCount}/${feedData.length}`
            return
        } catch (e) {
            errorHelper.appenData({
                payload: jsonStringify(payload),
                feedItem: jsonStringify(feedItem),
                position: index,
                localTime: new Date(),
                errorMessage: (e as Error).message
            })
            const retry = async function () {
                await delay(1000)
                return await execution(feedItem, index)
            }
            spinner.text = chalk.red(`Throw error in executor: ${(e as Error).message},${totalCount}/${feedData.length}`)
            if (executeErrorHandler) {
                // if it throw queue will received
                await executeErrorHandler(e as Error, executeArgs, retry)
            } else {
                await retry()
            }
        }
    }

    const spinner = ora('Contract is exectuting.').start();
    await Promise.all(feedData.map((el, i) => {
        return queue.add(() => execution(el, i))
    }))
    spinner.stop()
    if (_isCheckTransaction) {
        const waitConfirmed = waitBlockConfirmed ? waitBlockConfirmed : async () => {
            if (totalCount > 0) {
                console.log(chalk.green(`Wait 60 seconds to wait to block confirm.`))
                await delay(60000)
            }
        }
        await waitConfirmed()
        // exec all feedData and query every transaction result
        const unChecks = await logHelper.queryData(queryUncheckedSql)
        await checkResult(unChecks)
    } else {
        const isOk = await logHelper.changeAll({ [verifyField]: VerifyStatus.NotVerify })
        if (!isOk) {
            console.error(`Not all table rows is set ${verifyField} = 1`)
        }
        await checkResult([])
    }
}
