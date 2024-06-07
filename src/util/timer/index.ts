import {delay} from "../delay";

export type CancelableTimer<T> = Promise<T> & {isCancelled: () => boolean, cancel: () => void}

export const timer = (interval: number, fn: () => void): CancelableTimer<void> => {

    let _cancelled = false;
    const isCancelled = () => _cancelled
    const cancel = () => _cancelled = true;

    const val = new Promise<void>(async (resolve, reject) => {

        while (!isCancelled()) {
            fn()

            await delay(interval, () => {})
        }

        resolve()
    })

    return Object.assign(val, {isCancelled, cancel})
}