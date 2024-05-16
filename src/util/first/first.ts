import {Optional} from "../optional/optional";

export const first = <T> (list: T[] = []): Optional<T> => {
    if (list.length === 0) {
        return Optional.empty();
    }

    return Optional.ofNullable(list[0]);
}
