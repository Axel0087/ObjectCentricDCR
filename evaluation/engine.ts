import { execute, isAccepting, ocEventToString, OCExecute } from "../src/objectCentric";
import { copySet } from "../src/utility";
import { ModelEntities, OCDCRGraph, OCEvent, Event, EventMap } from "../types";

export type Engine<T> = {
    isAccepting: (graph: T) => boolean,
    isEnabled: (event: OCEvent<{ id: string }>, graph: T) => boolean,
    getEnabled: (graph: T) => Set<Event>,
    execute: (event: OCEvent<{ id: string }>, graph: T) => void,
    executeStr: (event: string, graph: T) => void
}

const expandInterfaces = (set: Set<Event>, model: OCDCRGraph): Set<Event> => {
    const retSet = new Set<Event>();
    for (const elem of set) {
        if (elem in model.interfaceMap) {
            retSet.union(model.interfaceMap[elem])
        } else {
            retSet.add(elem);
        }
    }
    return retSet;
}

const includeInterfaceRelations = (event: Event, rel: EventMap, graph: OCDCRGraph): Set<Event> => {
    const emptySet = new Set<Event>();

    const interfaceRels = graph.eventToInterface[event] ? rel[graph.eventToInterface[event]] : emptySet;

    return expandInterfaces(copySet(rel[event]).union(interfaceRels), graph);
}

export const isEnabled = (event: Event, graph: OCDCRGraph): boolean => {
    if (!graph.events.has(event)) return false; // CLOSED WORLD PRINCIPLE
    const excluded = copySet(graph.events).difference(graph.marking.included);
    return (
        graph.marking.included.has(event) &&
        includeInterfaceRelations(event, graph.conditionsFor, graph).difference(excluded.union(graph.marking.executed)).size === 0
    )
};

export const getEnabled = (graph: OCDCRGraph): Set<Event> => {
    const retSet = new Set<Event>();
    for (const event of graph.events) {
        if (isEnabled(event, graph)) {
            retSet.add(event);
        }
    }
    return retSet;
};


const getEngine = (model_entities: ModelEntities): Engine<OCDCRGraph> => {
    return {
        execute: (event, graph) => OCExecute(event, graph, model_entities),
        getEnabled: getEnabled,
        isEnabled: (event, graph) => isEnabled(ocEventToString(event, model_entities), graph),
        isAccepting: isAccepting,
        executeStr: execute,
    }
}

export default getEngine