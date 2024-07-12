import {Observable, Subject} from "rxjs";

export abstract class PubSubApi {
    abstract listTopics(): Promise<string[]>
    abstract registerTopic<T>(topic: string): Subject<T>
    abstract removeTopic(topic: string): Promise<void>

    abstract observeTopic<T = any>(topic: string): Observable<T>
    abstract publishToTopic<T = any>(topic: string, value: T): Promise<void>
}
