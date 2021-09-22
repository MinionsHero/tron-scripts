// global declares

import { JsonObject } from "type-fest"

// global
declare type ReturnPromiseOrSelf<T> = T | Promise<T>
// string types
declare type HexString = string
declare type Base58CheckString = string
declare type FingerPrintString = string // 9mPzvhwtq8uTG3KkJa6hTeawdSUn7rFe4HYN6jrEfPtqfx1JFgK7oNhrV7Kgisxscx5dLnNLxKAhfx6XdgqNYoYw8QRCT5QRd
declare type UrlString = string
declare type DateString = string // must be '1990-08-21 12:00:00 GST'
// number types
declare type int32 = number
declare type int64 = number
declare type timestamp = number
// 
declare type orderByType = 'block_timestamp,asc' | 'block_timestamp,desc'

declare namespace global {
    
}

// declare namespace "read-excel-file" {
//     export default function (buffer: Buffer, options: any): Promise<any>
// }