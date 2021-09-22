import xlsx from 'node-xlsx'
import { JsonObject } from 'type-fest'
import path from 'path'
import fs from 'fs-extra'
import { prompt } from 'enquirer'
import sqlite, { Database } from 'better-sqlite3'
import moment from 'moment'
import { omit, fromPairs } from 'lodash'

const projectPath = path.resolve(__dirname, '../../')
const outputPath = path.resolve(projectPath, './output')

interface AbstractDataHelperOption {
    relativePath?: string;
    deleteIfExist?: boolean;
}

abstract class AbstractDataHelper {
    public readonly fileName
    public readonly filePath
    protected options

    protected constructor(dirName: string, fileName: string, options?: AbstractDataHelperOption) {
        const relativePath = options?.relativePath || './'
        this.options = options
        this.fileName = fileName
        if (!relativePath.startsWith('./')) {
            throw new Error('relativePath should starts with ./')
        }
        this.filePath = path.resolve(outputPath, `./${dirName}/`, this.fileName)
    }

    /**
     * Create file or override an existed file , you should call it in early time as you can.
     * @param filePath file path
     * @param ask Ask user to delete old file or not.
     */
    async createOrOverrideFile() {
        const deleteIfExist = this.options?.deleteIfExist
        const filePath = this.filePath
        const isExisted = fs.existsSync(filePath)
        if (isExisted && deleteIfExist) {
            const { question: answer } = await prompt<{ question: boolean }>({
                type: 'confirm',
                name: 'question',
                message: `The file of ${filePath} has exsited, would you like to delete it?`
            })
            if (!answer) {
                throw new Error(`Process can't delete the file, exit(1)`)
            }
            fs.removeSync(filePath)
        }
        if (!isExisted) {
            fs.createFileSync(filePath)
        }
    }
}


enum FileFormat {
    Json = 'json',
    Excel = 'xlsx'
}

export class OutputDataHelper<T extends JsonObject> extends AbstractDataHelper {

    constructor(fileName: string, options?: AbstractDataHelperOption) {
        super('data', fileName, options)
    }

    private parseXlsxFile<T extends JsonObject>(data: T[]) {
        let xlsxData: any[][] = []
        if (data.length !== 0) {
            const keys = Object.keys(data[0])
            xlsxData = [
                keys,
                ...data.map(item => {
                    return keys.map((key, i) => {
                        if (item[key] === undefined) {
                            throw new Error(`Parse xlsx failed, becuase of the position ${i} has no value of ${key}`)
                        }
                        return item[key]
                    })
                })
            ]
        }
        const buffer = xlsx.build([{
            name: "data",
            data: xlsxData
        }])
        fs.writeFileSync(this.filePath, buffer as Float32Array)
    }

    private parseJsonFile<T extends JsonObject>(data: T[]) {
        fs.writeJsonSync(this.filePath, data, {
            EOL: '\r\n',
            spaces: 2
        })
    }

    private getFileExtName(file: string) {
        if (file.endsWith('.json')) {
            return FileFormat.Json
        }
        if (file.endsWith('.xlsx')) {
            return FileFormat.Excel
        }
        throw new Error('Unsupported fileFormat')
    }

    /**
    * @dev Parse a json object to a file
    * @param data json data
    */
    async parseFile<T extends JsonObject>(data: T[]) {
        const fileFormat = this.getFileExtName(this.fileName)
        await this.createOrOverrideFile()
        if (fileFormat === FileFormat.Json) {
            await this.parseJsonFile(data)
        } else if (fileFormat === FileFormat.Excel) {
            await this.parseXlsxFile(data)
        }
    }
}

export type TableColumnType = typeof String | typeof Boolean | typeof Number | typeof Date
export type TableColumn = Record<string, TableColumnType>
export type TableColumnValue = Record<string, string | boolean | number | Date>

export type QueryArgs<T> = ((tableName: string, IDKey: string) => string) | Partial<T>

// 记录tpunk owner
// owner => contract ? 谁在order
// 发送nft
export class LogHelper<T extends TableColumnValue> {
    private db: Database
    private tableName = ''
    private idKey = 'ID'
    private columns: TableColumn

    get name() {
        return this.tableName
    }

    constructor(tableName: string, columns: TableColumn, dbName?: string) {
        this.tableName = tableName
        this.columns = { ...columns, ...{ [this.idKey]: Number } }
        const filePath = path.resolve(projectPath, './log/', 'logs.db')
        const dirName = path.dirname(filePath)
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName)
        }
        this.db = new sqlite(filePath, { readonly: false })
        // const {} = this.db.exec(`SELECT count(*) FROM sqlite_master WHERE type="table" AND name = "${this.tableName}"`)
        const columnKeys = Object.keys(columns)
        const keywords = ['index', 'transaction']
        if (keywords.filter(keyword => columnKeys.includes(keyword)).length > 0) {
            throw new Error(`columns should not includes ${keywords.join(',')}, which is reserve word.`)
        }
        this.db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (
            ${this.idKey} INTEGER PRIMARY KEY AUTOINCREMENT,
            ${this.getTableStatement()}
        )`)
        this.findConflictData = this.findConflictData.bind(this)
    }

    // sometimes id is not visible for sql
    private get columnsWithoutId() {
        return omit(this.columns, [this.idKey]) as Omit<TableColumn, 'ID'>
    }

    private getTableStatement() {
        const columns = this.columnsWithoutId
        return Object.keys(columns).map(key => {
            const type = columns[key] as TableColumnType
            switch (true) {
                case type === String:
                    return { key, value: 'TEXT' }
                case type === Number:
                    return { key, value: 'NUMERIC' }
                case type === Boolean:
                    return { key, value: 'INTEGER' }
                case type === Date:
                    return { key, value: 'INTEGER' }
                default:
                    throw new Error('Not support type')
            }
        }).map(({ key, value }) => `${key} ${value} NOT NULL`).join(',')
    }

    private parseTableValueToItem(item: any) {
        const columns = this.columns
        return fromPairs(Object.keys(columns).map(key => {
            const type = columns[key] as TableColumnType
            const value = item[key]
            switch (true) {
                case type === String:
                    return [key, value]
                case type === Number:
                    return [key, Number(item[key])]
                case type === Boolean:
                    return [key, !!(item[key])]
                case type === Date:
                    return [key, new Date(Number(item[key]))]
                default:
                    throw new Error(`logHelper.parseTableValueToItem has not support type key=${key} type=${type.toString()}`)
            }
        })) as T
    }

    private parseTableValueToReadable(item: any) {
        const columns = this.columnsWithoutId
        return fromPairs(Object.keys(columns).map(key => {
            const type = columns[key] as TableColumnType
            const value = item[key]
            switch (true) {
                case type === String:
                    return [key, value]
                case type === Number:
                    return [key, Number(item[key])]
                case type === Boolean:
                    return [key, !!(item[key])]
                case type === Date:
                    return [key, moment(Number(item[key])).format('YYYY-MM-DD HH:mm:ss')]
                default:
                    throw new Error(`logHelper.parseTableValueToReadable has not support type key=${key} type=${type.toString()}`)
            }
        })) as JsonObject
    }

    private parseItemToTableValue(item: Partial<T>) {
        const columns = this.columns
        const keys = Object.keys(item).filter(key => item[key] !== undefined)
        return fromPairs(keys.map(key => {
            const value = item[key] as T[string]
            const type = columns[key]
            if (type === String) {
                return [key, value]
            } else if (type === Number) {
                return [key, Number(item[key])]
            } else if (type === Boolean) {
                return [key, value === true ? 1 : 0]
            } else if (type === Date) {
                return [key, value.valueOf()]
            } else {
                throw new Error(`logHelper.parseItemToTableValue has not support type key=${key} type=${type.toString()}`)
            }
        })) as TableColumnValue
    }

    /**
     * Append array data to file, if the file is not existed, it will be created.
     * @param data 
     */
    async appenData(...data: T[]) {
        if (data.length > 0) {
            const keys = Object.keys(this.columnsWithoutId).map(key => key)
            const values = Object.keys(this.columnsWithoutId).map(key => `@${key}`)
            const insert = this.db.prepare(`INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${values.join(',')})`);
            const insertMany = this.db.transaction((cats: Partial<T>[]) => {
                for (const cat of cats) insert.run(this.parseItemToTableValue(cat));
            });
            insertMany(data)
        }
    }

    // update all data
    async changeAll(newData: any) {
        const parsedData = this.parseItemToTableValue(newData)
        const keys = Object.keys(omit(parsedData, this.idKey))
        const update = this.db.prepare(`UPDATE ${this.tableName} SET ${keys.map(k => `${k}=?`).join(',')}`);
        const runArgs = keys.map(key => {
            return (parsedData as T)[key]
        })
        const { changes } = update.run(...runArgs)
        const data = await this.exportData()
        return changes === data.length
    }

    /**
     * 
     * @param key 
     * @param newData 
     * @returns 
     */
    async changeData(newData: Partial<T>, key?: keyof T) {
        if (key === undefined) {
            key = this.idKey
        }
        if (newData[key] === undefined) {
            throw new Error(`${key} should in newData`)
        }
        const parsedData = this.parseItemToTableValue(newData)
        const keys = Object.keys(omit(parsedData, this.idKey))
        const update = this.db.prepare(`UPDATE ${this.tableName} SET ${keys.map(k => `${k}=?`).join(',')} WHERE ${key}=?`);
        const runArgs = keys.map(key => {
            return (parsedData as T)[key]
        })
        // the value in  ? from sql = 'where key = ? '
        const val = newData[key]
        if (val) {
            runArgs.push(val)
        }
        const { changes } = update.run(...runArgs)
        return changes > 0
    }


    private parseQueryToSql(query: QueryArgs<T>) {
        let sql: string
        if (typeof query === 'function') {
            sql = query(this.tableName, this.idKey)
        } else {
            const values = Object.keys(query).filter(key => query[key] !== undefined).map(key => `${key}='${query[key]}'`)
            sql = `SELECT * from ${this.tableName} WHERE ${values.join(' AND ')}`
        }
        return sql
    }


    /**
     * export db.data
     * @returns 
     */
    async exportData(query?: QueryArgs<T>) {
        const sql: string = query ? this.parseQueryToSql(query) : `SELECT * from ${this.tableName}`
        const statement = this.db.prepare(sql);
        const allData: T[] = statement.all()
        return allData.map(el => this.parseTableValueToItem(el))
    }

    async exportFile(fileName: string, options?: AbstractDataHelperOption & { query?: QueryArgs<T>, filter?: (item: T) => (JsonObject | null) }) {
        const query = options && options.query
        const filter = options && options.filter
        const helper = new OutputDataHelper(fileName, options)
        const data = await this.exportData(query)
        const parsedData = data.map(el => {
            const item = filter ? filter(el) : el
            const parsedItem = this.parseTableValueToReadable(item)
            return parsedItem
        }).filter(el => el !== null) as unknown as (JsonObject[])
        if (options && options.filter) {
            helper.parseFile(parsedData)
            return
        }
        helper.parseFile(parsedData)
    }

    public async length() {
        const statement = this.db.prepare(`SELECT COUNT(*) from ${this.tableName}`)
        const count = statement.all()
        return count
    }

    /**
     * Get the last elemenet of db
     * @returns 
     */
    public async getLastItem() {
        const statement = this.db.prepare(`SELECT * from ${this.tableName} ORDER BY ${this.idKey} DESC LIMIT 1`);
        const data = statement.all()
        if (data.length === 1) {
            return this.parseTableValueToItem(data[0])
        }
    }

    /**
     * 
     * @param key 
     * @param items 
     * @returns 
     */
    async findConflictData(key: string, ...items: T[]) {
        const values = items.map(el => `${key}='${el[key]}'`)
        const statement = this.db.prepare(`SELECT * from ${this.tableName} WHERE ${values.join(' OR ')}`)
        const data = statement.all()
        return data.length > 0
    }

    async queryData(query: QueryArgs<T>) {
        const sql = this.parseQueryToSql(query)
        const statement = this.db.prepare(sql)
        const data = statement.all()
        return data
    }

    private async close() {
        this.db.close()
    }

    async clear(){
        const statement = this.db.prepare(`DELETE FROM ${this.tableName}`);
        statement.run()
    }

    async destory() {
        const statement = this.db.prepare(`DROP TABLE ${this.tableName}`);
        statement.run()
        this.close()
    }

}