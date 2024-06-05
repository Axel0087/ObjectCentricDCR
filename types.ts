declare global {
    interface Set<T> {
        union(b: Set<T>): Set<T>;
        intersect(b: Set<T>): Set<T>;
        difference(b: Set<T>): Set<T>;
    }
}

export type AlignAction = "consume" | "model-skip" | "trace-skip";
export type CostFun = (action: AlignAction, target: Event) => number;
export type Alignment = { cost: number; trace: Trace };

export type RelationString = "condition" | "response" | "milestone" | "include" | "exclude"

export type DCRSolutionsImportModel = {
    title: string,
    description: string,
    type: string,
    roles: [],
    events: Array<{
        id: string,
        label: string,
        parent?: string,
        type?: string
    }>,
    rules: Array<{
        type: string,
        source: string,
        target: string
    }>
}

export type DCRSolutionsImport = {
    DCRModel: [
        DCRSolutionsImportModel
    ]
}

export type Trace = Array<Event>;
type Traces = { [traceId: string]: Trace };

export interface EventLog {
    events: Set<Event>;
    traces: Traces;
}

export type Event = string;

export interface Marking {
    executed: Set<Event>;
    included: Set<Event>;
    pending: Set<Event>;
}

// Map from event to a set of events
// Used to denote different relations between events
export interface EventMap {
    [startEventId: string]: Set<Event>;
}

export interface DCRGraph {
    events: Set<Event>;
    conditionsFor: EventMap;
    milestonesFor: EventMap;
    responseTo: EventMap;
    includesTo: EventMap;
    excludesTo: EventMap;
    marking: Marking;
}

// Counts number of activations
export type FuzzyEventMap = {
    [startEventId: Event]: {
        [endEventId: Event]: number
    }
}

export interface FuzzyDCRGraph {
    events: Set<Event>;
    conditionsFor: FuzzyEventMap;
    milestonesFor: FuzzyEventMap;
    responseTo: FuzzyEventMap;
    includesTo: FuzzyEventMap;
    excludesTo: FuzzyEventMap;
    marking: Marking;
}

export type FuzzyHiDCRGraph = FuzzyDCRGraph & {
    spawns: {
        [spawnEvent: Event]: FuzzyDCRGraph
    }
}

export type HiDCRGraph = DCRGraph & {
    spawns: {
        [eventId: Event]: DCRGraph;
    }
}

// Object centric stuff

export type Interface = string;

export type Spawns = {
    spawns: {
        [eventId: Event]: DCRObject;
    }
}

export type DCRObject = DCRGraph & Spawns & {
    eventInterfaces: Set<Interface>,
    eventToInterface: {
        [event: Event]: Interface;
    }
    interfaceToEvent: {
        [interfaceId: Interface]: Event;
    }
}

export type OCDCRGraph = DCRObject & {
    interfaceMap: {
        [interfaceId: Interface]: Set<Event>;
    }
}

export type OCDCRGraphPP = OCDCRGraph & {
    conditions: Set<Activity>;
}

export type OCEvent<T> = {
    activity: Activity,
    attr: T
};

export type OCTrace<T> = Array<OCEvent<T>>

export type OCEventLog<T> = {
    activities: Set<Event>,
    traces: { [traceId: string]: OCTrace<T> }
}

// Abstraction of the log used for mining
export interface LogAbstraction {
    events: Set<Event>;
    traces: {
        [traceId: string]: Trace;
    };
    chainPrecedenceFor: EventMap;
    precedenceFor: EventMap;
    responseTo: EventMap;
    predecessor: EventMap;
    successor: EventMap;
    atMostOnce: Set<Event>;
}

export type Activity = string;

export type DirectlyFollowsGraph = { [activity: Activity]: Set<Activity> };

export type FuzzyDirectlyFollowsGraph = { [activity: Activity]: { [activity: Activity]: number } };

export interface ClassifiedTraces {
    [traceId: string]: boolean;
}

export type EntityType = string;

export type EventNode = {
    eventId: string;
    spawnedId: string;
    activityName: string;
    timestamp: Date;
}

export type EntityNode = {
    entityId: string;
    rawId: string;
    entityType: EntityType;
}

export type EntityNodes = { [entityId: string]: EntityNode };
export type EventNodes = { [eventId: string]: EventNode };
export type Correlations = { [eventId: string]: { [entityType: string]: Set<string> } };
export type DirectlyFollows = { [entityId: string]: Array<EventNode> };
export type EntityRels = { [entityId: string]: Set<string> };

export type EventKnowledgeGraph = {
    activities: Set<Activity>;
    entityTypes: Set<EntityType>;
    eventNodes: EventNodes;
    entityNodes: EntityNodes;
    correlations: Correlations;
    directlyFollows: DirectlyFollows;
    derivedDFs: DirectlyFollows;
    entityRels: EntityRels;
}


export type ModelEntities = { [entityType: string]: { idField: string, dbDoc: any, subprocessInitializer?: string } };
export type ModelRelations = Array<{ derivedEntityType: string, nt1: string, nt2: string }>;

export class BitSet {
    size: number;
    set: bigint;
    map: { [elem: string]: bigint }


    constructor(params: { allElems: Set<string>, startingElems: Set<string> } | { size: number, set: bigint, map: { [elem: string]: bigint } }
    ) {
        const realParams = params as any;
        if (realParams?.size) {
            this.size = realParams.size;
            this.set = realParams.set;
            this.map = realParams.map;
        } else {
            this.size = realParams.allElems.size;
            this.map = {};
            this.set = 0n;
            let mask = 1n;
            for (const elem of realParams.allElems) {
                this.map[elem] = mask;
                if (realParams.startingElems.has(elem)) {
                    this.set = this.set | mask
                }
                mask = mask << 1n;
            }
        }
    }

    *[Symbol.iterator]() {
        for (const elem in this.map) {
            if (this.has(this.map[elem])) {
                yield elem;
            }
        }
    }

    clear() {
        this.set = 0n
        return this;
    }

    copy(): BitSet {
        return new BitSet({ size: this.size, set: this.set, map: this.map });
    }

    print() {
        console.log(this.set.toString(2));
    }

    isEmpty(): boolean {
        return this.set === 0n;
    }

    has(elem: bigint): boolean {
        return !!(elem & this.set);
    }

    hasString(elem: string): boolean {
        const mask = this.map[elem];
        if (mask === undefined) throw new Error("Unknown elem: " + elem);
        return !!(mask & this.set);
    }

    compliment() {
        this.set = ~this.set;
        return this;
    }

    add(elem: bigint) {
        this.set = this.set | elem;
        return this;
    }

    addString(elem: string) {
        try {
            const mask = this.map[elem];
            this.set = this.set | mask;
            return this;
        } catch (e) {
            console.log(elem, this.map[elem]);
            console.log(Object.keys(this.map))
            throw e;
        }
    }

    delete(elem: bigint) {
        this.set = this.set & ~(elem);
        return this;
    }

    deleteString(elem: string) {
        const mask = this.map[elem];
        this.set = this.set & (~mask);
        return this;
    }

    union(otherSet: BitSet) {
        this.set = this.set | otherSet.set;
        return this;
    }

    intersect(otherSet: BitSet) {
        this.set = this.set & otherSet.set;
        return this;
    }

    difference(otherSet: BitSet) {
        this.set = this.set & (~otherSet.set)
        return this;
    }
}

export interface BitMarking {
    executed: BitSet;
    included: BitSet;
    pending: BitSet;
}

// Map from event to a set of events
// Used to denote different relations between events
export interface BitEventMap {
    [startEventId: string]: BitSet;
}

export interface BitDCRGraph {
    events: BitSet;
    conditionsFor: BitEventMap;
    milestonesFor: BitEventMap;
    responseTo: BitEventMap;
    includesTo: BitEventMap;
    excludesTo: BitEventMap;
    marking: BitMarking;
}

export type BitDCRObject = BitDCRGraph & {
    eventInterfaces: Set<Interface>,
    eventToInterface: {
        [event: Event]: Interface;
    },
    interfaceToEvent: {
        [interfaceId: Interface]: Event;
    },
    spawns: {
        [eventId: Event]: BitDCRObject;
    }
}

export type BitOCDCRGraph = BitDCRObject & {
    interfaceMap: {
        [interfaceId: Interface]: BitSet;
    }
}

export type BitOCDCRGraphPP = BitOCDCRGraph & {
    conditions: BitSet;
}


export const isSet = (obj: any): obj is Set<unknown> => {
    return typeof obj === "object" && obj instanceof Set
}

export const isValidDate = (obj: any): obj is Date => {
    return obj && Object.prototype.toString.call(obj) === "[object Date]" && !isNaN(obj);
}

const isString = (obj: any): obj is string => {
    return typeof obj === "string";
}

export const isStringSet = (obj: any): obj is Set<string> => {
    if (isSet(obj)) {
        return forVals(obj, isString);
    }
    return false;
}

export const isArray = (obj: unknown): obj is Array<unknown> => {
    return typeof obj === "object" && obj instanceof Array
}

const forKeys = (obj: Object, pred: (key: any) => boolean): boolean => {
    for (const key in obj) {
        if (!pred(key)) return false;
    }
    return true;
}

const forVals = (obj: Iterable<any>, pred: (obj: any) => boolean): boolean => {
    for (const val of obj) {
        if (!pred(val)) return false;
    }
    return true;
}

export const isDict = (obj: any): obj is { [key: string]: any } => {
    if (typeof obj === "object" && !isArray(obj) && !isSet(obj)) {
        return forKeys(obj, isString);
    };
    return false;
};

export const isEventNode = (obj: any): obj is EventNode => {
    return isString(obj?.eventId) && isString(obj?.activityName) && isValidDate(obj?.timestamp);
}

export const isEntityNode = (obj: any, entityTypes: Set<EntityType>): obj is EntityNode => {
    return isString(obj?.entityId) && entityTypes.has(obj?.entityType);
}

export const isEntityNodes = (obj: any, entityTypes: Set<EntityType>): obj is EntityNodes => {
    return isDict(obj) && forKeys(obj, (key) => isEntityNode(obj[key], entityTypes) && obj[key].entityId === key);
}

export const isEventNodes = (obj: any): obj is EventNodes => {
    return isDict(obj) && forKeys(obj, (key) => isEventNode(obj[key]) && obj[key].eventId === key);
}

export const isCorrelations = (obj: any, eventNodes: EventNodes, entityNodes: EntityNodes, entityTypes: Set<EntityType>): obj is Correlations => {
    return isDict(obj) && forKeys(obj, (key) => {
        return eventNodes[key] !== undefined && isDict(obj[key]) && forKeys(obj[key], (key2) => {
            return entityTypes.has(key2) && forVals(obj[key][key2], (val) => entityNodes[val] !== undefined);
        });
    });
}

export const isDirectlyFollows =
    (obj: any, entityNodes: EntityNodes, eventNodes: EventNodes): obj is DirectlyFollows => {
        return isDict(obj) && forKeys(obj, (key) => {
            return entityNodes[key] !== undefined &&
                isArray(obj[key]) &&
                forVals(obj[key], (val) => isEventNode(val) && eventNodes[val.eventId] !== undefined);
        })
    }

export const isEntityRels = (obj: any, entityNodes: EntityNodes): obj is EntityRels => {
    return isDict(obj) && forKeys(obj, (key) => {
        return entityNodes[key] !== undefined && forVals(obj[key], (val) => entityNodes[val] !== undefined);
    })
}

const print = false;

const shortCircuitLog = (msg: string) => {
    print && console.log(msg);
    return true;
}

export const isEKG = (obj: any): obj is EventKnowledgeGraph => {
    return (
        isStringSet(obj?.entityTypes) && shortCircuitLog("ent types") &&
        isEventNodes(obj?.eventNodes) && shortCircuitLog("event nodes") &&
        isEntityNodes(obj?.entityNodes, obj.entityTypes) && shortCircuitLog("entity nodes") &&
        isCorrelations(obj?.correlations, obj.eventNodes, obj.entityNodes, obj.entityTypes) && shortCircuitLog("correls") &&
        isDirectlyFollows(obj?.directlyFollows, obj.entityNodes, obj.eventNodes) && shortCircuitLog("dfs") &&
        isDirectlyFollows(obj?.derivedDFs, obj.entityNodes, obj.eventNodes) && shortCircuitLog("derived dfs") &&
        isEntityRels(obj?.entityRels, obj.entityNodes) && shortCircuitLog("rels")
    );
}