import {Observable, Subject} from "rxjs";
import {PubSubApi} from "./pub-sub.api";
import {Optional} from "../../util";

export class PubSubLocal implements PubSubApi {
    private readonly subjects: {[topic: string]: Subject<unknown>}

    constructor(private readonly autoCreateTopics: boolean = true) {
        this.subjects = {}
    }

    async listTopics(): Promise<string[]> {
        return Object.keys(this.subjects)
    }

    registerTopic<T>(topic: string): Subject<T> {
        if (this.subjects[topic]) {
            return this.subjects[topic] as Subject<T>;
        }

        return this.subjects[topic] = new Subject<T>()
    }

    async removeTopic(topic: string): Promise<void> {
        const subject = this.subjects[topic]

        delete this.subjects[topic]

        if (subject) {
            subject.complete()
        }
    }

    observeTopic<T = any>(topic: string): Observable<T> {

        const subject: Subject<T> = Optional.ofNullable(this.subjects[topic] as Subject<T>)
            .orIf(() => this.autoCreateTopics, () => Optional.of(this.subjects[topic] = new Subject<T>()))
            .orElseThrow(() => new Error('Topic not found: ' + topic))

        return subject.asObservable()
    }

    async publishToTopic<T = any>(topic: string, value: T): Promise<void> {

        const subject: Subject<T> = Optional.ofNullable(this.subjects[topic] as Subject<T>)
            .orIf(() => this.autoCreateTopics, () => Optional.of(this.subjects[topic] = new Subject<T>()))
            .orElseThrow(() => new Error('Topic not found: ' + topic))

        subject.next(value)
    }

}