import { OCDCRGraph, Event, DCRGraph, EventMap, DCRObject, OCEvent, ModelEntities, OCTrace, OCEventLog, OCDCRGraphPP } from "../types";
import { copySet, safeAdd, safeUnion, } from "./utility";

import lodash from "lodash";

export const getSpawnedEvent = (event: Event, spawnId: string) => {
    return event + "_" + spawnId;
}

// Mutates model with the spawned instance
const spawnInstance = (spawnId: string, model: OCDCRGraph, graphToSpawn: DCRObject) => {
    for (const event of graphToSpawn.events) {

        const iEvent = graphToSpawn.eventToInterface[event];
        const sEvent = getSpawnedEvent(event, spawnId);
        model.events.add(sEvent);
        model.eventToInterface[sEvent] = iEvent;
        model.eventInterfaces.add(iEvent);
        safeAdd(model.interfaceMap, iEvent, sEvent);
    }

    const spawnSet = (setToSpawn: Set<Event>): Set<Event> => {
        return new Set([...setToSpawn].map(e => graphToSpawn.events.has(e) ? getSpawnedEvent(e, spawnId) : e));
    }
    const populateRel = (rel: EventMap, relToSpawn: EventMap) => {
        for (const e in relToSpawn) {
            const realE = graphToSpawn.events.has(e) ? getSpawnedEvent(e, spawnId) : e;
            const js = spawnSet(relToSpawn[e]);
            safeUnion(rel, realE, js);
        }
    }

    populateRel(model.conditionsFor, graphToSpawn.conditionsFor);
    populateRel(model.responseTo, graphToSpawn.responseTo);
    populateRel(model.excludesTo, graphToSpawn.excludesTo);
    populateRel(model.includesTo, graphToSpawn.includesTo);
    populateRel(model.milestonesFor, graphToSpawn.milestonesFor);

    model.marking.executed.union(spawnSet(graphToSpawn.marking.executed));
    model.marking.pending.union(spawnSet(graphToSpawn.marking.pending));
    model.marking.included.union(spawnSet(graphToSpawn.marking.included));
}

const expandInterfaces = (set: Set<Event>, model: OCDCRGraph): Set<Event> =>
    new Set([...set].flatMap(e => e in model.interfaceMap ? [...model.interfaceMap[e]] : e));

const includeInterfaceRelations = (event: Event, rel: EventMap, graph: OCDCRGraph): Set<Event> => {
    const interfaceRels = graph.eventToInterface[event] ? rel[graph.eventToInterface[event]] : new Set<Event>();
    return expandInterfaces(rel[event].union(interfaceRels), graph);
}

export const addOptimization = (graph: OCDCRGraph, ids: Array<string>): OCDCRGraphPP => {
    const conditions = new Set<Event>();
    for (const key in graph.conditionsFor) {
        conditions.union(copySet(graph.conditionsFor[key]).intersect(graph.events));
    }
    for (const key in graph.spawns) {
        const localConds = new Set<Event>();
        const localGraph = graph.spawns[key];
        for (const key in localGraph.conditionsFor) {
            localConds.union(new Set([...localGraph.conditionsFor[key]].map(e => localGraph.eventInterfaces.has(e) ? graph.interfaceToEvent[e] : e)));
        }

        conditions.union(new Set([...localConds].filter(event => localGraph.events.has(event)).flatMap(event => ids.map(id => getSpawnedEvent(event, id)))));
    }
    return {
        ...graph,
        conditions
    }
}


export const isEnabled = (event: Event, graph: OCDCRGraph): boolean => {
    if (!graph.marking.included.has(event)) {
        return false;
    }
    for (const cEvent of includeInterfaceRelations(event, graph.conditionsFor, graph)) {
        // If an event conditioning for event is included and not executed
        // return false
        if (
            graph.marking.included.has(cEvent) &&
            !graph.marking.executed.has(cEvent)
        ) {
            return false;
        }
    }
    for (const mEvent of includeInterfaceRelations(event, graph.milestonesFor, graph)) {
        // If an event conditioning for event is included and not executed
        // return false
        if (
            graph.marking.included.has(mEvent) &&
            graph.marking.pending.has(mEvent)
        ) {
            return false;
        }
    }
    return true;
};

export const isInitializer = (event: OCEvent<{ id: string }>, model_entities: ModelEntities): boolean => {
    return Object.keys(model_entities).map(key => model_entities[key].subprocessInitializer).includes(event.activity);
}

export const ocEventToString = (event: OCEvent<{ id: string }>, model_entities: ModelEntities): string => {
    if (isInitializer(event, model_entities)) {
        return event.activity;
    } else {
        return getSpawnedEvent(event.activity, event.attr.id);
    }
}

export const isAccepting = (graph: DCRGraph): boolean => {
    // Graph is accepting if the intersections between pending and included events is empty
    return (
        copySet(graph.marking.included).intersect(graph.marking.pending).size === 0
    );
};

// Mutates graph's marking
export const executePP = (event: Event, graph: OCDCRGraphPP) => {
    if (graph.conditions.has(event)) graph.marking.executed.add(event);
    graph.marking.pending.delete(event);
    // Add sink of all response relations to pending
    for (const rEvent of includeInterfaceRelations(event, graph.responseTo, graph)) {
        graph.marking.pending.add(rEvent);
    }
    // Remove sink of all exclude relations from included
    for (const eEvent of includeInterfaceRelations(event, graph.excludesTo, graph)) {
        graph.marking.included.delete(eEvent);
    }
    // Add sink of all include relations to included
    for (const iEvent of includeInterfaceRelations(event, graph.includesTo, graph)) {
        graph.marking.included.add(iEvent);
    }
};

// Mutates graph's marking
export const execute = (event: Event, graph: OCDCRGraph) => {
    graph.marking.executed.add(event);
    graph.marking.pending.delete(event);
    // Add sink of all response relations to pending
    for (const rEvent of includeInterfaceRelations(event, graph.responseTo, graph)) {
        graph.marking.pending.add(rEvent);
    }
    // Remove sink of all exclude relations from included
    for (const eEvent of includeInterfaceRelations(event, graph.excludesTo, graph)) {
        graph.marking.included.delete(eEvent);
    }
    // Add sink of all include relations to included
    for (const iEvent of includeInterfaceRelations(event, graph.includesTo, graph)) {
        graph.marking.included.add(iEvent);
    }
};

export const OCExecute = (event: OCEvent<{ id: string }>, model: OCDCRGraph, model_entities: ModelEntities) => {
    const strEvent = ocEventToString(event, model_entities);

    if (event.activity in model.spawns) {
        // Appends the spawned graph
        spawnInstance(event.attr.id, model, model.spawns[event.activity]);
    }

    execute(strEvent, model);
}

export const OCExecutePP = (event: OCEvent<{ id: string }>, model: OCDCRGraphPP, model_entities: ModelEntities) => {
    const strEvent = ocEventToString(event, model_entities);

    if (event.activity in model.spawns) {
        // Appends the spawned graph
        spawnInstance(event.attr.id, model, model.spawns[event.activity]);
    }

    executePP(strEvent, model);
}

export const getEvent = (event: OCEvent<any>): string => {
    const retval = event.activity;
    return retval;
}

export const getId = (event: OCEvent<{ id: string }>): string => {
    const retval = event.attr.id;
    return retval;
}

export const OCIsEnabled = (event: OCEvent<{ id: string }>, model: OCDCRGraph, model_entities: ModelEntities) => {
    return isEnabled(ocEventToString(event, model_entities), model);
}

export const OCReplayTrace = (trace: OCTrace<{ id: string }>, model: OCDCRGraph, model_entities: ModelEntities): boolean => {
    for (const event of trace) {
        const strEvent = ocEventToString(event, model_entities);
        if (!isEnabled(strEvent, model)) {
            return false;
        }
        OCExecute(event, model, model_entities)
    }
    return isAccepting(model);
}

export const OCReplay = (log: OCEventLog<{ id: string }>, model: OCDCRGraph, model_entities: ModelEntities): number => {
    let acceptingTraces = 0;
    for (const traceId in log.traces) {
        if (OCReplayTrace(log.traces[traceId], lodash.cloneDeep(model), model_entities)) {
            acceptingTraces++
        }
    }
    return acceptingTraces;
}

