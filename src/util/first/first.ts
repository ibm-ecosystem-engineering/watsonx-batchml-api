
export const first = <T> (list: T[] = []): T | undefined => {
    if (list.length === 0) {
        return;
    }

    return list[0];
}
