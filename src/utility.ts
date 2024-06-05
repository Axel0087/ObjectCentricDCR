import util from "util";
import now from "performance-now";
import { DCRGraph, EventMap, HiDCRGraph, LogAbstraction, Marking, Event } from "../types";

export const strFull = (obj: any) => util.inspect(obj, { showHidden: false, depth: null, colors: true })
export const printFull = (...obj: any) => console.log(strFull(obj));

// Time in milliseconds
export const timer = () => {
    const start = now();
    return {
        stop: () => {
            const end = now();
            const time = (end - start);
            return time;
        }
    }
};

export const setMinus = <T>(s1: Set<T>, s2: Set<T>) => {
    const retSet = new Set<T>();
    for (const elem of s1) {
        if (!s2.has(elem)) retSet.add(elem);
    }
    return retSet;
}

export const copySet = <T>(set: Set<T>): Set<T> => {
    return new Set(set);
};

// Makes deep copy of a eventMap
export const copyEventMap = (eventMap: EventMap): EventMap => {
    const copy: EventMap = {};
    for (const startEvent in eventMap) {
        copy[startEvent] = new Set(eventMap[startEvent]);
    }
    return copy;
};

export const eventMapSize = (em: EventMap): number => {
    let retval = 0;
    for (const key in em) {
        retval += em[key].size;
    }
    return retval;
}

export const DCRSize = (graph: DCRGraph): number => {
    return eventMapSize(graph.conditionsFor) +
        eventMapSize(graph.responseTo) +
        eventMapSize(graph.includesTo) +
        eventMapSize(graph.excludesTo) +
        eventMapSize(graph.milestonesFor)
}

export const HiDCRSize = (graph: HiDCRGraph): number => {
    return Object.values(graph.spawns).reduce((acc, val) => acc + DCRSize(val), DCRSize(graph));
}

export const LogAbsSize = (abs: LogAbstraction): number => {
    return abs.atMostOnce.size +
        eventMapSize(abs.chainPrecedenceFor) +
        eventMapSize(abs.precedenceFor) +
        eventMapSize(abs.predecessor) +
        eventMapSize(abs.responseTo) +
        eventMapSize(abs.successor)
}

export const copyMarking = (marking: Marking): Marking => {
    return {
        executed: copySet(marking.executed),
        included: copySet(marking.included),
        pending: copySet(marking.pending),
    };
};

export const copyDCRGraph = (graph: DCRGraph): DCRGraph => {
    return {
        events: copySet(graph.events),
        conditionsFor: copyEventMap(graph.conditionsFor),
        responseTo: copyEventMap(graph.responseTo),
        excludesTo: copyEventMap(graph.excludesTo),
        milestonesFor: copyEventMap(graph.milestonesFor),
        includesTo: copyEventMap(graph.includesTo),
        marking: copyMarking(graph.marking)
    }
}

export const copyHiDcr = (graph: HiDCRGraph): HiDCRGraph => {
    const retGraph: HiDCRGraph = {
        ...copyDCRGraph(graph),
        spawns: {}
    }
    for (const spawnEvent in graph.spawns) {
        retGraph.spawns[spawnEvent] = copyDCRGraph(graph.spawns[spawnEvent]);
    }
    return retGraph;
}

export const safeAdd = (em: EventMap, key: string, val: Event) => {
    if (!em[key]) em[key] = new Set();
    em[key].add(val);
}

export const safeUnion = (em: EventMap, key: string, val: Set<Event>) => {
    if (key in em) {
        em[key].union(val);
    } else {
        em[key] = val;
    }
}

export const flipEventMap = (em: EventMap): EventMap => {
    const retval: EventMap = {};
    for (const event of Object.keys(em)) {
        retval[event] = new Set();
    }
    for (const e1 in em) {
        for (const e2 of em[e1]) {
            if (!retval[e2]) retval[e2] = new Set();
            retval[e2].add(e1);
        }
    }
    return retval;
}

export const intersect = <T>(s1: Set<T>, s2: Set<T>): Set<T> => {
    const retset = new Set<T>();
    const { smallestSet, otherSet } = s1.size > s2.size ? { smallestSet: s2, otherSet: s1 } : { smallestSet: s1, otherSet: s2 };
    for (const elem of smallestSet) {
        if (otherSet.has(elem)) retset.add(elem);
    }
    return retset;
}

export const setEqual = <T>(s1: Set<T>, s2: Set<T>): boolean => {
    if (s1.size !== s2.size) return false;
    for (const elem of s1) {
        if (!s2.has(elem)) return false;
    }
    return true;
}

export const subset = <T>(s1: Set<T>, s2: Set<T>): boolean => {
    for (const elem of s1) {
        if (!s2.has(elem)) return false;
    }
    return true;
}

// Mutates graph1
export const unionGraphs = (graph1: DCRGraph, graph2: DCRGraph) => {
    graph1.events.union(graph2.events);

    const unionRel = (rel1: EventMap, rel2: EventMap) => {
        for (const key in rel2) {
            if (!rel1[key]) {
                rel1[key] = copySet(rel2[key]);
            }
            else {
                rel1[key].union(rel2[key]);
            }
        }
    }

    unionRel(graph1.conditionsFor, graph2.conditionsFor);
    unionRel(graph1.responseTo, graph2.responseTo);
    unionRel(graph1.excludesTo, graph2.excludesTo);
    unionRel(graph1.includesTo, graph2.includesTo);
    unionRel(graph1.milestonesFor, graph2.milestonesFor);

    for (const key in graph1.marking) {
        graph1.marking[key as keyof Marking].union(graph2.marking[key as keyof Marking]);
    }
}