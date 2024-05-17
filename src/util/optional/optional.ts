
export class OptionalNoValue extends Error {
    constructor() {
        super('Optional value is missing');
    }
}

export abstract class Optional<T> {
    static empty<T>(): Optional<T> {
        return empty;
    }

    static of<T>(value: T): Optional<T> {
        if (!isPresent(value)) {
            throw new OptionalNoValue()
        }

        return new OptionalImpl(value)
    }

    static ofNullable<T>(value: T | undefined): Optional<T> {
        if (!isPresent(value)) {
            return empty
        }

        return new OptionalImpl(value)
    }

    abstract isPresent(): boolean
    abstract notPresent(): boolean
    abstract get(): T
    abstract orElse(val: T): T
    abstract orElseGet(fn: () => T): T
    abstract orElseThrow(fn: () => Error)

    abstract filter(fn: (val: T) => boolean): Optional<T>
    abstract map<U>(fn: (val: T) => U): Optional<U>
    abstract flatMap<U>(fn: (val: T) => Optional<U>): Optional<U>
    abstract walk<U>(key: keyof T): Optional<U>
    abstract or(fn: () => Optional<T>): Optional<T>

    abstract ifPresent(fn: (val: T) => void): Optional<T>
    abstract ifNotPresent(fn: () => void): Optional<T>
    abstract ifPresentOrElse(fn: (val: T) => void, orElse: () => void): Optional<T>
}

const isPresent = (value: unknown): boolean => {
    return value !== undefined && value !== null;
}

class OptionalImpl<T> implements Optional<T> {
    constructor(private readonly value: T | undefined) {}

    isPresent(): boolean {
        return isPresent(this.value);
    }

    notPresent(): boolean {
        return !isPresent(this.value);
    }

    get(): T {
        if (!this.isPresent()) {
            throw new OptionalNoValue()
        }

        return this.value;
    }

    orElse(val: T): T {
        return this.isPresent() ? this.value : val;
    }

    orElseGet(fn: () => T): T {
        return this.isPresent() ? this.value : fn();
    }

    orElseThrow(fn: () => Error) {
        if (this.isPresent()) {
            return this.value;
        }

        throw fn();
    }

    filter(fn: (val: T) => boolean): Optional<T> {
        if (!this.isPresent()) {
            return empty;
        }

        return fn(this.value) ? this : empty;
    }

    flatMap<U>(fn: (val: T) => Optional<U>): Optional<U> {
        if (!this.isPresent()) {
            return empty;
        }

        return fn(this.value);
    }

    ifPresent(fn: (val: T) => void): Optional<T> {
        if (this.isPresent()) {
            fn(this.value)
        }

        return this;
    }

    ifNotPresent(fn: () => void): Optional<T> {
        if (!this.isPresent()) {
            fn()
        }

        return this;
    }

    ifPresentOrElse(fn: (val: T) => void, orElse: () => void): Optional<T> {
        if (this.isPresent()) {
            fn(this.value)
        } else {
            orElse()
        }

        return this;
    }

    map<U>(fn: (val: T) => U): Optional<U> {
        if (!this.isPresent()) {
            return empty
        }

        return Optional.ofNullable(fn(this.value));
    }

    walk<U>(key: keyof T): Optional<U> {
        if (!this.isPresent()) {
            return empty
        }

        return Optional.ofNullable(this.value[key] as U)
    }

    or(fn: () => Optional<T>): Optional<T> {
        if (this.isPresent()) {
            return this;
        }

        return fn();
    }
}

const empty: Optional<any> = new OptionalImpl(undefined)
