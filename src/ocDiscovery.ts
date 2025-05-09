import { EventKnowledgeGraph, LogAbstraction, ModelEntities, OCDCRGraph, Event, DCRObject, EventMap, Activity, EntityType, EventLog, EventNode, OCTrace, OCEventLog, Trace, DCRGraph, RelationString } from "../types";
import { DCRSize, copyEventMap, copySet, flipEventMap, timer } from "./utility";

const eventToInterface = (event: Event) => "I_" + event + "_I";

// Removes redundant relations based on transitive closure
const optimizeRelation = (relation: EventMap) => {
    for (const eventA in relation) {
        for (const eventB of relation[eventA]) {
            relation[eventA].difference(relation[eventB]);
        }
    }
};

export const initializeGetSubProcess = (aggCorr: {
    [activity: string]: Set<string>;
}, model_entities: ModelEntities): {
    getSubProcess: (...events: Array<Event>) => string,
    getSubProcessGraph: (graph: OCDCRGraph, ...events: Array<Event>) => DCRObject
} => {
    const getSubProcess = (...events: Array<Event>): string => {
        const isSubProcess = (entity: string) =>
            (entity in model_entities) &&
            model_entities[entity].subprocessInitializer !== undefined;

        for (const event of events) {
            for (const entity of aggCorr[event]) {
                if (isSubProcess(entity)) return entity;
            }
        }
        return "";
    }
    const getSubProcessGraph = (graph: OCDCRGraph, ...events: Array<Event>): DCRObject => {
        const subProcess = getSubProcess(...events);
        if (subProcess === "") {
            return graph
        } else {
            return graph.spawns[model_entities[subProcess].subprocessInitializer as string];
        }
    }

    return {
        getSubProcess,
        getSubProcessGraph
    }
}


export const abstractionUnion = (abs1: LogAbstraction, abs2: LogAbstraction): LogAbstraction => {
    const unionEventMap = (em1: EventMap, em2: EventMap): EventMap => {
        const unionedEventMap: EventMap = {};

        const keySet = new Set([...Object.keys(em1), ...Object.keys(em2)]);

        for (const key of keySet) {
            if (em1[key] !== undefined) {
                if (em2[key] !== undefined) {
                    unionedEventMap[key] = copySet(em1[key]).union(em2[key]);
                } else {
                    unionedEventMap[key] = copySet(em1[key]);
                }
            } else {
                unionedEventMap[key] = copySet(em2[key]);
            }
        }

        return unionedEventMap;
    }

    const unionedAbstraction: LogAbstraction = {
        events: copySet(abs1.events).union(abs2.events),
        traces: { ...abs1.traces, ...abs2.traces },
        atMostOnce: copySet(abs1.atMostOnce).union(abs2.atMostOnce),
        chainPrecedenceFor: unionEventMap(abs1.chainPrecedenceFor, abs2.chainPrecedenceFor),
        precedenceFor: unionEventMap(abs1.precedenceFor, abs2.precedenceFor),
        predecessor: unionEventMap(abs1.predecessor, abs2.predecessor),
        successor: unionEventMap(abs1.successor, abs2.successor),
        responseTo: unionEventMap(abs1.responseTo, abs2.responseTo)
    };
    return unionedAbstraction;

}

export const logsForDerivedEntityTypes = (ekg: EventKnowledgeGraph, derivedEntityTypes: Array<string>): { [entityType: string]: EventLog } => {
    const retval: { [entityType: string]: EventLog } = {};

    for (const entityType of derivedEntityTypes) {
        retval[entityType] = {
            events: new Set(),
            traces: {}
        }
    }

    const getEntityType = (entityId: string): string => {
        return ekg.entityNodes[entityId].entityType;
    }

    if (ekg.entityTypes.has("root")) {
        retval["root"] = {
            events: new Set(),
            traces: {}
        }

        for (const entityId in ekg.directlyFollows) {
            const type = getEntityType(entityId);
            if (type !== "root") continue;
            const log = retval[type];
            const trace = ekg.directlyFollows[entityId].map(eventNode => eventNode.activityName);
            log.traces[entityId] = trace;
            for (const activity of trace) {
                log.events.add(activity);
            }
        }
    }

    for (const entityId in ekg.derivedDFs) {
        const log = retval[getEntityType(entityId)];
        const trace = ekg.derivedDFs[entityId].map(eventNode => eventNode.activityName);
        log.traces[entityId] = trace;
        for (const activity of trace) {
            log.events.add(activity);
        }
    }

    return retval;
}

export const aggregateCorrelations = (ekg: EventKnowledgeGraph): { [activity: Activity]: Set<EntityType> } => {
    const aggCorr: { [activity: Activity]: Set<EntityType> } = {};

    const getActivity = (eventId: string): Activity => {
        return ekg.eventNodes[eventId].activityName;
    }

    for (const activity of ekg.activities) {
        aggCorr[activity] = new Set();
    }

    for (const eventId in ekg.correlations) {
        for (const entityType in ekg.correlations[eventId]) {
            if (ekg.correlations[eventId][entityType].size !== 0) {
                aggCorr[getActivity(eventId)].add(entityType);
            }
        }
    }

    return aggCorr;
}

// Create abstraction of an EventLog in order to make fewer passes when mining constraints
export const abstractLog = (log: EventLog): LogAbstraction => {
    const logAbstraction: LogAbstraction = {
        events: copySet(log.events),
        traces: { ...log.traces },
        // At first we assume all events will be seen at least once
        // Once we see them twice in a trace, they are removed from atMostOnce
        atMostOnce: copySet(log.events),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {},
    };
    // Initialize all EventMaps in the Log Abstraction.
    // Predecessor and successor sets start empty,
    // while the rest are initialized to be all events besides itself
    for (const event of log.events) {
        logAbstraction.chainPrecedenceFor[event] = copySet(log.events);
        logAbstraction.chainPrecedenceFor[event].delete(event);
        logAbstraction.precedenceFor[event] = copySet(log.events);
        logAbstraction.precedenceFor[event].delete(event);
        logAbstraction.responseTo[event] = copySet(log.events);
        logAbstraction.responseTo[event].delete(event);
        logAbstraction.predecessor[event] = new Set<Event>();
        logAbstraction.successor[event] = new Set<Event>();
    }

    const parseTrace = (trace: Trace, traceId: string) => {
        const localAtLeastOnce = new Set<Event>();
        const localSeenOnlyBefore: EventMap = {};
        let lastEvent: string = "";

        for (const event of trace) {
            // All events seen before this one must be predecessors
            logAbstraction.predecessor[event].union(localAtLeastOnce);
            // If event seen before in trace, remove from atMostOnce
            if (localAtLeastOnce.has(event)) {
                logAbstraction.atMostOnce.delete(event);
            }
            localAtLeastOnce.add(event);
            // Precedence for (event): All events that occured
            // before (event) are kept in the precedenceFor set
            logAbstraction.precedenceFor[event].intersect(localAtLeastOnce);
            // Chain-Precedence for (event): Some event must occur
            // immediately before (event) in all traces
            if (lastEvent !== "") {
                // If first time this clause is encountered - leaves lastEvent in chain-precedence set.
                // The intersect is empty if this clause is encountered again with another lastEvent.
                logAbstraction.chainPrecedenceFor[event].intersect(
                    new Set([lastEvent]),
                );
            } else {
                // First event in a trace, and chainPrecedence is therefore not possible
                logAbstraction.chainPrecedenceFor[event] = new Set<Event>();
            }
            // To later compute responses we note which events were seen
            // before (event) and not after
            if (logAbstraction.responseTo[event].size > 0) {
                // Save all events seen before (event)
                localSeenOnlyBefore[event] = copySet(localAtLeastOnce);
            }
            // Clear (event) from all localSeenOnlyBefore, since (event) has now occured after
            for (const key in localSeenOnlyBefore) {
                localSeenOnlyBefore[key].delete(event);
            }
            lastEvent = event;
        }
        for (const event in localSeenOnlyBefore) {
            // Compute set of events in trace that happened after (event)

            const seenOnlyAfter = new Set(localAtLeastOnce).difference(
                localSeenOnlyBefore[event],
            );
            // Delete self-relation
            seenOnlyAfter.delete(event);
            // Set of events that always happens after (event)
            logAbstraction.responseTo[event].intersect(seenOnlyAfter);
        }
    };

    for (const traceId in log.traces) {
        const trace = log.traces[traceId];
        parseTrace(trace, traceId);
    }

    // Compute successor set based on duality with predecessor set
    for (const i in logAbstraction.predecessor) {
        for (const j of logAbstraction.predecessor[i]) {
            logAbstraction.successor[j].add(i);
        }
    }

    return logAbstraction;
};

export const mineOCDCR = (
    logAbstraction: LogAbstraction,
    ekg: EventKnowledgeGraph,
    model_entities: ModelEntities,
    findAdditionalConditions: boolean = true,
): OCDCRGraph => {
    const aggCorr = aggregateCorrelations(ekg);

    const { getSubProcess, getSubProcessGraph } = initializeGetSubProcess(aggCorr, model_entities);

    const mainEvents = new Set([...logAbstraction.events].filter((e) => getSubProcess(e) === ""));
    // Initialize graph
    let graph: OCDCRGraph = {
        // Note that events become an alias, but this is irrelevant since events are never altered
        events: mainEvents,
        eventInterfaces: new Set<Event>(),
        eventToInterface: {},
        interfaceToEvent: {},
        interfaceMap: {},
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Set<Event>(),
            pending: new Set<Event>(),
            included: copySet(mainEvents),
        },
        spawns: {}
    };

    for (const entity in model_entities) {
        const spawnEvent = model_entities[entity].subprocessInitializer;
        if (spawnEvent !== undefined) {
            const subProcessEvents = new Set([...logAbstraction.events].filter(
                (e) => getSubProcess(e) === entity)
            );
            graph.spawns[spawnEvent] = {
                events: subProcessEvents,
                eventInterfaces: new Set([...subProcessEvents].map(eventToInterface)),
                eventToInterface: [...subProcessEvents].map(event => ({ [event]: eventToInterface(event) })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
                interfaceToEvent: [...subProcessEvents].map(event => ({ [eventToInterface(event)]: event })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
                conditionsFor: {},
                excludesTo: {},
                includesTo: {},
                milestonesFor: {},
                responseTo: {},
                marking: {
                    executed: new Set<Event>(),
                    pending: new Set<Event>(),
                    included: copySet(subProcessEvents),
                },
                spawns: {},
            }
            // Initialize all mappings to avoid indexing errors
            for (const event of logAbstraction.events) {
                graph.spawns[spawnEvent].conditionsFor[event] = new Set<Event>();
                graph.spawns[spawnEvent].excludesTo[event] = new Set<Event>();
                graph.spawns[spawnEvent].includesTo[event] = new Set<Event>();
                graph.spawns[spawnEvent].responseTo[event] = new Set<Event>();
                graph.spawns[spawnEvent].milestonesFor[event] = new Set<Event>();
                if (getSubProcess(event) !== "") {
                    graph.spawns[spawnEvent].conditionsFor[eventToInterface(event)] = new Set<Event>();
                    graph.spawns[spawnEvent].excludesTo[eventToInterface(event)] = new Set<Event>();
                    graph.spawns[spawnEvent].includesTo[eventToInterface(event)] = new Set<Event>();
                    graph.spawns[spawnEvent].responseTo[eventToInterface(event)] = new Set<Event>();
                    graph.spawns[spawnEvent].milestonesFor[eventToInterface(event)] = new Set<Event>();
                }
            }
        }
    }

    // Initialize all mappings to avoid indexing errors
    for (const event of mainEvents) {
        graph.conditionsFor[event] = new Set<Event>();
        graph.excludesTo[event] = new Set<Event>();
        graph.includesTo[event] = new Set<Event>();
        graph.responseTo[event] = new Set<Event>();
        graph.milestonesFor[event] = new Set<Event>();
    }

    // Mine self-exclusions
    for (const event of logAbstraction.atMostOnce) {
        getSubProcessGraph(graph, event).excludesTo[event].add(event);
    }

    // Mine responses from logAbstraction
    for (const e in logAbstraction.responseTo) {
        for (const j of logAbstraction.responseTo[e]) {
            getSubProcessGraph(graph, e, j).responseTo[e].add(j);
        }
    }

    // Mine conditions from logAbstraction
    for (const e in logAbstraction.precedenceFor) {
        for (const j of logAbstraction.precedenceFor[e]) {
            if (getSubProcess(e, j) === "" || model_entities[getSubProcess(e, j)].subprocessInitializer !== j) {
                getSubProcessGraph(graph, e, j).conditionsFor[e].add(j);
            }
        }
    }

    // For each chainprecedence(i,j) we add: include(i,j) exclude(j,j)
    for (const j in logAbstraction.chainPrecedenceFor) {
        for (const i of logAbstraction.chainPrecedenceFor[j]) {
            if (!logAbstraction.atMostOnce.has(j)) {
                getSubProcessGraph(graph, i, j).includesTo[i].add(j);
            }
            getSubProcessGraph(graph, j).excludesTo[j].add(j);
        }
    }

    // Additional excludes based on predecessors / successors
    for (const event of logAbstraction.events) {
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(logAbstraction.predecessor[event]).union(
            logAbstraction.successor[event],
        );
        const nonCoExisters = new Set(logAbstraction.events).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        for (const nonCoExister of nonCoExisters) {
            getSubProcessGraph(graph, event, nonCoExister).excludesTo[event].add(nonCoExister);
        }

        // if s precedes (event) but never succeeds (event) add (event) -->% s if s -->% s does not exist
        const precedesButNeverSuceeds = copySet(logAbstraction.predecessor[event]).difference(logAbstraction.successor[event]);
        for (const s of precedesButNeverSuceeds) {
            if (!getSubProcessGraph(graph, s).excludesTo[s].has(s)) {
                getSubProcessGraph(graph, s, event).excludesTo[event].add(s);
            }
        }
    }


    // Removing redundant excludes.
    // If r always precedes s, and r -->% t, then s -->% t is (mostly) redundant
    for (const s in logAbstraction.precedenceFor) {
        for (const r of logAbstraction.precedenceFor[s]) {
            for (const t of getSubProcessGraph(graph, s, r).excludesTo[r]) {
                getSubProcessGraph(graph, s, t).excludesTo[s].delete(t);
            }
        }
    }

    // remove redundant conditions
    optimizeRelation(graph.conditionsFor);

    // Remove redundant responses
    optimizeRelation(graph.responseTo);

    for (const spawnEvent in graph.spawns) {
        optimizeRelation(graph.spawns[spawnEvent].conditionsFor);
        optimizeRelation(graph.spawns[spawnEvent].responseTo);
    }

    if (findAdditionalConditions) {
        // Mining additional conditions:
        // Every event, x, that occurs before some event, y, is a possible candidate for a condition x -->* y
        // This is due to the fact, that in the traces where x does not occur before y, x might be excluded
        const possibleConditions: EventMap = copyEventMap(
            logAbstraction.predecessor,
        );
        // Replay entire log, filtering out any invalid conditions
        for (const traceId in logAbstraction.traces) {
            const trace = logAbstraction.traces[traceId];
            const localSeenBefore = new Set<Event>();
            const included = copySet(logAbstraction.events);
            for (const event of trace) {
                // Compute conditions that still allow event to be executed
                const excluded = copySet(logAbstraction.events).difference(included);
                const validConditions = copySet(localSeenBefore).union(excluded);
                // Only keep valid conditions
                possibleConditions[event].intersect(validConditions);
                // Execute excludes starting from (event)
                included.difference(getSubProcessGraph(graph, event).excludesTo[event]);
                // Execute includes starting from (event)
                included.union(getSubProcessGraph(graph, event).includesTo[event]);
                localSeenBefore.add(event);
            }
        }
        // Now the only possibleCondtitions that remain are valid for all traces
        // These are therefore added to the graph
        for (const e in possibleConditions) {
            for (const j of possibleConditions[e]) {
                if (getSubProcess(e, j) === "" || model_entities[getSubProcess(e, j)].subprocessInitializer !== j) {
                    getSubProcessGraph(graph, e, j).conditionsFor[e].add(j);
                }
            }
        }

        // Removing redundant conditions
        optimizeRelation(graph.conditionsFor);

        for (const spawnEvent in graph.spawns) {
            optimizeRelation(graph.spawns[spawnEvent].conditionsFor);
        }

    }
    return graph;
};

const filterBasedOnEkg = (
    graph: OCDCRGraph,
    aggCorr: { [activity: Activity]: Set<EntityType> },
    derivedEntityTypes: Array<string>,
    model_entities: ModelEntities,
    onlyDerived: boolean = false
): OCDCRGraph => {
    const { getSubProcess } = initializeGetSubProcess(aggCorr, model_entities);

    const derivedEntitySet = new Set(derivedEntityTypes);
    const shareEntityType = (e1: Activity, e2: Activity): boolean => {
        const intersection = copySet(aggCorr[e1]).intersect(aggCorr[e2]);
        if (onlyDerived) return intersection.size > 0 && (intersection.difference(derivedEntitySet).size === 0)
        else return intersection.size > 0;
    }
    const filterRelation = (rel: EventMap) => {
        for (const e1 in rel) {
            for (const e2 of rel[e1]) {
                const e1Subprocess = getSubProcess(e1);
                if ((e1Subprocess !== "" && e1Subprocess !== getSubProcess(e2)) || !shareEntityType(e1, e2)) {
                    rel[e1].delete(e2)
                };
            }
        }
    }

    const filterGraph = (model: DCRObject) => {
        filterRelation(model.conditionsFor);
        filterRelation(model.responseTo);
        filterRelation(model.excludesTo);
        filterRelation(model.includesTo);
        filterRelation(model.milestonesFor);
    }

    filterGraph(graph);
    for (const spawnId in graph.spawns) {
        filterGraph(graph.spawns[spawnId]);
    }

    return graph;
}

export const DisCoverOCDcrGraph = (ekg: EventKnowledgeGraph, derivedEntityTypes: Array<string>, model_entities: ModelEntities, onlyDerived: boolean = false): OCDCRGraph => {

    const logs = logsForDerivedEntityTypes(ekg, derivedEntityTypes);

    const emptyAbstraction: LogAbstraction = {
        events: new Set(),
        traces: {},
        atMostOnce: new Set(),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {}
    }

    const bigAbs = Object.keys(logs).reduce((accAbs, et) => {
        const abs = abstractLog(logs[et]);
        return abstractionUnion(accAbs, abs)
    }, emptyAbstraction);

    return filterBasedOnEkg(mineOCDCR(bigAbs, ekg, model_entities, true), aggregateCorrelations(ekg), derivedEntityTypes, model_entities, onlyDerived);
}

export const findRelationClosures = (ekg: EventKnowledgeGraph): Array<Set<string>> => {
    let entities = new Set(Object.keys(ekg.entityNodes));
    const findClosure = (entity: string): Set<string> => {
        if (!entities.has(entity)) return new Set();
        entities.delete(entity);
        const closure = new Set([entity]);
        for (const relatedEntity of ekg.entityRels[entity]) {
            closure.union(findClosure(relatedEntity));
        }
        return closure;
    }
    let retArr: Array<Set<string>> = [];
    while (entities.size !== 0) {
        const entity = entities.values().next().value as string;
        if (!ekg.entityRels[entity]) {
            entities.delete(entity);
            continue;
        }
        retArr.push(findClosure(entity));
    }
    return retArr;
}

export const makeLogFromClosure = (closures: Array<Set<string>>, ekg: EventKnowledgeGraph): EventLog => {
    let id = 0;
    const log: EventLog = {
        events: new Set(),
        traces: {}
    }
    for (const closure of closures) {
        let trace: Array<EventNode> = [];
        for (const entity of closure) {
            trace = trace.concat(ekg.directlyFollows[entity]);
        }
        log.events.union(new Set(trace.map(e => e.activityName)))
        log.traces[id++] = trace.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).map(e => e.activityName);
    }

    return log;
}

export const makeOCLogFromClosure = (closures: Array<Set<string>>, ekg: EventKnowledgeGraph, model_entities: ModelEntities, subprocessEntities: Array<string>): OCEventLog<{ id: string, timestamp: Date }> => {
    let id = 0;
    const log: OCEventLog<{ id: string, timestamp: Date }> = {
        activities: new Set(),
        traces: {}
    }

    const initializers = new Set(Object.keys(model_entities).map(key => model_entities[key].subprocessInitializer).filter(event => event !== undefined)) as Set<string>;

    for (const closure of closures) {
        let trace: OCTrace<{ id: string, timestamp: Date }> = [];
        for (const entity of closure) {
            const isSubProcess = subprocessEntities.includes(ekg.entityNodes[entity].entityType);
            trace = trace.concat(ekg.directlyFollows[entity].map(event => {
                return ({
                    activity: event.activityName,
                    attr: {
                        id: initializers.has(event.activityName) ? event.spawnedId : isSubProcess ? ekg.entityNodes[entity].rawId : "",
                        timestamp: event.timestamp,
                    }
                })
            }));
        }

        log.activities.union(new Set(trace.map(e => e.activity)))
        log.traces[id++] = trace.sort((a, b) => a.attr.timestamp.getTime() - b.attr.timestamp.getTime());
    }

    return log;
}

export const filterBasedOnAggregatedCorrelations = (activities: Set<Activity>, subprocessEntities: Array<string>, aggCorr: { [activity: Activity]: Set<EntityType> }): Set<Activity> => {
    return new Set([...activities].filter(event => (new Set(subprocessEntities)).intersect(aggCorr[event]).size !== 0));
}

export const getNonCoexistersAndNotSuccesion = (abs: LogAbstraction, subprocessEntities: Array<string>, aggCorr: { [activity: Activity]: Set<EntityType> }): {
    nonCoExisters: EventMap,
    precedesButNeverSucceeds: EventMap,
} => {
    const retval: {
        nonCoExisters: EventMap,
        precedesButNeverSucceeds: EventMap,
    } = {
        nonCoExisters: {},
        precedesButNeverSucceeds: {}
    }
    // Additional excludes based on predecessors / successors
    for (const event of abs.events) {
        if ((new Set(subprocessEntities)).intersect(aggCorr[event]).size === 0) continue;
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(abs.predecessor[event]).union(
            abs.successor[event],
        );
        const nonCoExisters = filterBasedOnAggregatedCorrelations(abs.events, subprocessEntities, aggCorr).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        retval.nonCoExisters[event] = nonCoExisters;

        retval.precedesButNeverSucceeds[event] = filterBasedOnAggregatedCorrelations(abs.predecessor[event], subprocessEntities, aggCorr).difference(abs.successor[event]);
    }



    return retval;
}

export const findConditionsResponses = (log: OCEventLog<{ id: string }>, getSubProcess: (activity: string) => string, model_entities: ModelEntities): {
    conditions: EventMap,
    responses: EventMap,
} => {
    const initializers = new Set(Object.keys(model_entities).map(key => model_entities[key].subprocessInitializer).filter(event => event !== undefined)) as Set<string>;

    const initializerToEntityType = (initializer: string) => {
        for (const key of Object.keys(model_entities)) {
            if (model_entities[key].subprocessInitializer === initializer) return key;
        }
        return "";
    }

    const subProcessTraces: { [traceId: string]: OCTrace<{ id: string }> } = Object.keys(log.traces).map(traceId => ({ [traceId]: log.traces[traceId].filter(event => event.attr.id !== "") })).reduce((acc, cum) => ({ ...acc, ...cum }))
    const subProcessActivities = new Set(Object.keys(subProcessTraces).flatMap(traceId => subProcessTraces[traceId].map(event => event.activity))).difference(initializers);

    const retval: {
        conditions: EventMap,
        responses: EventMap,
    } = {
        conditions: {},
        responses: {}
    }

    for (const activity of subProcessActivities) {
        retval.conditions[activity] = copySet(subProcessActivities);
        retval.conditions[activity].delete(activity);
        retval.responses[activity] = copySet(subProcessActivities);
        retval.responses[activity].delete(activity);
    }

    for (const traceId in log.traces) {
        const trace = log.traces[traceId];
        const subProcessTrace = trace.filter(event => event.attr.id !== "");
        const spawned: EventMap = {};
        for (const key of Object.keys(model_entities)) {
            if (model_entities[key].subprocessInitializer) spawned[key] = new Set();
        }
        const localAtLeastOnce: EventMap = {};
        const responsesToSatisfy: { [activity: string]: EventMap } = {};
        for (const event of subProcessTrace) {
            localAtLeastOnce[event.activity] = new Set();
            responsesToSatisfy[event.activity] = {};
            for (const otherEvent of subProcessTrace) {
                responsesToSatisfy[event.activity][otherEvent.activity] = new Set();
            }
        }

        for (const event of subProcessTrace) {
            if (initializers.has(event.activity)) {
                spawned[initializerToEntityType(event.activity)].add(event.attr.id);
            }
            else {
                const log = false //event.activity === "confirm order";
                localAtLeastOnce[event.activity].add(event.attr.id);
                const seenAllBefore = new Set(
                    Object.keys(localAtLeastOnce).filter(
                        activity => {
                            log && console.log("subProcess ", getSubProcess(activity));
                            log && console.log("spawned ", spawned[getSubProcess(activity)]);
                            return getSubProcess(activity) !== "" && copySet(localAtLeastOnce[activity]).intersect(spawned[getSubProcess(activity)]).size === spawned[getSubProcess(activity)].size
                        }
                    ));
                log && console.log(trace);
                log && console.log(event, seenAllBefore, localAtLeastOnce);
                retval.conditions[event.activity].intersect(seenAllBefore);


                for (const otherEvent of subProcessTrace) {
                    if (initializers.has(otherEvent.activity)) continue;
                    responsesToSatisfy[otherEvent.activity][event.activity].delete(event.attr.id);
                    responsesToSatisfy[event.activity][otherEvent.activity].union(spawned[getSubProcess(otherEvent.activity)]);
                }
            }
        }

        for (const event in responsesToSatisfy) {
            if (initializers.has(event)) continue;
            retval.responses[event].intersect(new Set(Object.keys(responsesToSatisfy[event]).filter(key => responsesToSatisfy[event][key].size === 0)));

        }
    }

    return retval;
}

export const discover = (graph: EventKnowledgeGraph, subprocess_entities: Array<string>, model_entities: ModelEntities, model_entities_derived: Array<string>) => {
    console.log("Discovering Base Graph...");
    let t = timer();

    const model = DisCoverOCDcrGraph(graph, model_entities_derived, model_entities);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    /*
        if (model_entities["root"]) {
            const rootEvents = new Set(Object.values(model_entities).map(({ subprocessInitializer }) => subprocessInitializer).filter(event => event !== undefined) as string[]);
            model.events.union(rootEvents);
            model.marking.included.union(rootEvents);
            const initRel = (rel: RelationString) => {
                for (const event of rootEvents) {
                    model[rel][event] = new Set();
                }
            }
    
            initRel("conditionsFor");
            initRel("responseTo");
            initRel("includesTo");
            initRel("excludesTo");
            initRel("milestonesFor");
        }*/

    console.log("Finding closures...");
    t = timer();

    const closures = findRelationClosures(graph);

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    console.log("Making closure log...");
    t = timer();

    const interfaceLog = makeLogFromClosure(closures, graph);

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    console.log("Finding interface exclusions...");
    t = timer();

    const interfaceAbs = abstractLog(interfaceLog);

    const aggregatedCorrelations = aggregateCorrelations(graph);

    const interfaceAtMostOnce = filterBasedOnAggregatedCorrelations(interfaceAbs.atMostOnce, subprocess_entities, aggregatedCorrelations);

    const { getSubProcessGraph, getSubProcess } = initializeGetSubProcess(aggregatedCorrelations, model_entities);

    for (const activity of interfaceAtMostOnce) {
        if (getSubProcess(activity) === "") continue;
        const subProcessGraph = getSubProcessGraph(model, activity);
        const interfaceEvent = subProcessGraph.eventToInterface[activity];
        subProcessGraph.excludesTo[interfaceEvent].add(interfaceEvent);
    }

    const { nonCoExisters, precedesButNeverSucceeds } = getNonCoexistersAndNotSuccesion(interfaceAbs, subprocess_entities, aggregatedCorrelations);

    for (const event in precedesButNeverSucceeds) {
        if (getSubProcess(event) === "") continue;
        const subProcessGraph = getSubProcessGraph(model, event);
        const interfaceEvent = subProcessGraph.eventToInterface[event];
        for (const s of precedesButNeverSucceeds[event]) {
            if (!interfaceAtMostOnce.has(s)) {
                if (!getSubProcessGraph(model, s).eventToInterface[s]) console.log("WARNING!");
                subProcessGraph.excludesTo[interfaceEvent].add(getSubProcessGraph(model, s).eventToInterface[s]);
            }
        }
    }

    const addInterFaceConstraints = (rel: EventMap, key: string) => {
        for (const activity in rel) {
            if (getSubProcess(activity) === "") continue;
            const subProcessGraph = getSubProcessGraph(model, activity);
            const interfaceEvent = subProcessGraph.eventToInterface[activity];
            const setToUnion = new Set([...rel[activity]].map(otherActivity => getSubProcessGraph(model, otherActivity).eventToInterface[otherActivity]));
            (subProcessGraph[key as keyof DCRObject] as EventMap)[interfaceEvent].union(setToUnion);
        }
    }


    addInterFaceConstraints(nonCoExisters, "excludesTo");

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    const interFaceOCLog = makeOCLogFromClosure(closures, graph, model_entities, subprocess_entities);

    console.log("Finding interface conditions / responses...");
    t = timer();

    const { conditions, responses } = findConditionsResponses(interFaceOCLog, getSubProcess, model_entities);


    addInterFaceConstraints(conditions, "conditionsFor");
    addInterFaceConstraints(responses, "responseTo");

    console.log("DONE! Took " + t.stop() / 1000 + " seconds");

    return model;
}