
export function catchError(result: unknown | Promise<unknown>) {
    process.on('unhandledRejection', function (e: Error) {
        console.error(e)
        process.exit(1)
    })
    Promise.resolve(result).then(r => { }).catch((e: Error) => {
        console.error(e)
    })
}