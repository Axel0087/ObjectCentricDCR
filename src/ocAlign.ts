import { DCRObject, OCDCRGraphPP, Event, EventMap, OCEvent, OCTrace, ModelEntities, Alignment, CostFun, BitDCRObject, BitEventMap, BitMarking, BitOCDCRGraph, BitOCDCRGraphPP, BitSet } from "../types";
import { getSpawnedEvent, ocEventToString } from "./objectCentric";
import { copyEventMap, copySet, flipEventMap } from "./utility";

// Makes deep copy of a eventMap
export const copyBitEventMap = (eventMap: BitEventMap): BitEventMap => {
    const copy: BitEventMap = {};
    for (const startEvent in eventMap) {
        copy[startEvent] = eventMap[startEvent].copy();
    }
    return copy;
};

export const copyBitMarking = (marking: BitMarking): BitMarking => {
    return {
        executed: marking.executed.copy(),
        included: marking.included.copy(),
        pending: marking.pending.copy(),
    }
}

export const copyBitOCDCRGraph = (model: BitOCDCRGraphPP): BitOCDCRGraphPP => {
    return {
        conditionsFor: copyBitEventMap(model.conditionsFor),
        responseTo: copyBitEventMap(model.responseTo),
        excludesTo: copyBitEventMap(model.excludesTo),
        includesTo: copyBitEventMap(model.includesTo),
        milestonesFor: copyBitEventMap(model.milestonesFor),
        marking: copyBitMarking(model.marking),
        spawns: model.spawns,
        conditions: model.conditions,
        events: model.events.copy(),
        eventInterfaces: copySet(model.eventInterfaces),
        eventToInterface: { ...model.eventToInterface },
        interfaceMap: copyBitEventMap(model.interfaceMap),
        interfaceToEvent: { ...model.interfaceToEvent }
    }
}

export const ocDCRToBitDCR = (graph: OCDCRGraphPP, ids: Array<string>): BitOCDCRGraphPP => {

    const allRegularEvents = new Set(Object.keys(graph.spawns).flatMap(key => [...graph.spawns[key].events].flatMap(event => ids.map(id => getSpawnedEvent(event, id))))).union(graph.events);
    const includingGenericEvents = Object.keys(graph.spawns).map(key => graph.spawns[key].events).reduce((acc, cum) => acc.union(cum), allRegularEvents);
    const allEvents = Object.keys(graph.spawns).map(key => graph.spawns[key].eventInterfaces).reduce((acc, cum) => acc.union(cum), includingGenericEvents);

    const emptySet = new BitSet({ allElems: allEvents, startingElems: new Set() });



    const translateSet = (set: Set<Event>): BitSet => {
        const retSet = emptySet.copy();
        for (const event of set) {
            retSet.addString(event);
        }
        return retSet;
    }

    const translateEventMap = (rel: EventMap): BitEventMap => {
        const retval: BitEventMap = {};
        for (const key in rel) {
            retval[key] = translateSet(rel[key]);
        }
        return retval;
    }

    const translateDCRObject = (obj: DCRObject): BitDCRObject => {
        return {
            events: translateSet(obj.events),
            conditionsFor: translateEventMap(obj.conditionsFor),
            responseTo: translateEventMap(obj.responseTo),
            excludesTo: translateEventMap(obj.excludesTo),
            includesTo: translateEventMap(obj.includesTo),
            milestonesFor: translateEventMap(obj.milestonesFor),
            marking: {
                executed: translateSet(obj.marking.executed),
                pending: translateSet(obj.marking.pending),
                included: translateSet(obj.marking.included),
            },
            eventInterfaces: copySet(obj.eventInterfaces),
            eventToInterface: obj.eventToInterface,
            interfaceToEvent: obj.interfaceToEvent,
            spawns: Object.keys(obj.spawns).map(key => ({ [key]: translateDCRObject(obj.spawns[key]) })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
        }
    }

    return {
        ...translateDCRObject(graph),
        interfaceMap: translateEventMap(graph.interfaceMap),
        conditions: translateSet(graph.conditions)
    }
}

export let alignCost: CostFun = (action, target) => {
    switch (action) {
        case "consume":
            return 0;
        case "model-skip":
            return 1;
        case "trace-skip":
            return 1;
    }
}

const stateToStr = (marking: BitMarking, spawned: Array<string>): string => {
    return `${marking.executed.set.toString(2)}_${marking.included.set.toString(2)}_${marking.pending.set.toString(2)}_${spawned.join()}`;
}

const newGraphEnv = <T>(graph: BitOCDCRGraphPP, activityToExecute: string, fun: (graph: BitOCDCRGraphPP) => T): T => {
    let retval;
    if (activityToExecute in graph.spawns) {
        const newGraph = copyBitOCDCRGraph(graph);
        retval = fun(newGraph);
    } else {
        const oldMarking = graph.marking;
        graph.marking = copyBitMarking(graph.marking);
        retval = fun(graph);
        graph.marking = oldMarking;
    }

    return retval;
};

const safeBitAdd = (em: BitEventMap, key: string, val: Event, emptySet: BitSet) => {
    if (!em[key]) em[key] = emptySet.copy();
    em[key].addString(val);
}

const safeBitUnion = (em: BitEventMap, key: string, val: BitSet) => {
    if (key in em) {
        em[key].union(val);
    } else {
        em[key] = val;
    }
}

// Mutates model with the spawned instance
const spawnInstance = (spawnId: string, model: BitOCDCRGraph, graphToSpawn: BitDCRObject) => {
    const emptySet = model.events.copy().clear();
    for (const event of graphToSpawn.events) {

        const iEvent = graphToSpawn.eventToInterface[event];

        const sEvent = getSpawnedEvent(event, spawnId);
        model.events.addString(sEvent);
        model.eventToInterface[sEvent] = iEvent;
        model.eventInterfaces.add(iEvent);
        safeBitAdd(model.interfaceMap, iEvent, sEvent, emptySet);
    }

    const spawnSet = (setToSpawn: BitSet): BitSet => {
        const retSet = emptySet.copy();
        for (const elem of setToSpawn) {
            if (graphToSpawn.events.hasString(elem)) {
                retSet.addString(getSpawnedEvent(elem, spawnId))
            } else {
                retSet.addString(elem);
            }
        }
        return retSet
    }
    const populateRel = (rel: BitEventMap, relToSpawn: BitEventMap) => {
        for (const e in relToSpawn) {
            const realE = graphToSpawn.events.hasString(e) ? getSpawnedEvent(e, spawnId) : e;
            const js = spawnSet(relToSpawn[e]);
            safeBitUnion(rel, realE, js);
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

const expandInterfaces = (set: BitSet, model: BitOCDCRGraph): BitSet => {
    const retSet = set.copy().clear();
    for (const elem of set) {
        if (elem in model.interfaceMap) {
            retSet.union(model.interfaceMap[elem])
        } else {
            retSet.addString(elem);
        }
    }
    return retSet;
}

const includeInterfaceRelations = (event: Event, rel: BitEventMap, graph: BitOCDCRGraph): BitSet => {
    const emptySet = graph.events.copy().clear();

    const interfaceRels = graph.eventToInterface[event] ? rel[graph.eventToInterface[event]] : emptySet;

    return expandInterfaces(rel[event].copy().union(interfaceRels), graph);
}

export const bitIsEnabled = (event: Event, graph: BitOCDCRGraph): boolean => {
    if (!graph.events.hasString(event)) return false; // CLOSED WORLD PRINCIPLE
    return (
        graph.marking.included.hasString(event) &&
        includeInterfaceRelations(event, graph.conditionsFor, graph).difference(graph.marking.included.copy().compliment().union(graph.marking.executed)).isEmpty() //&&
    )
};
export const bitGetEnabled = (graph: BitOCDCRGraph): BitSet => {
    const retSet = graph.events.copy().clear();
    for (const event of graph.events) {
        if (bitIsEnabled(event, graph)) {
            retSet.addString(event);
        }
    }
    return retSet;
};

// Mutates graph's marking
export const bitExecutePP = (event: Event, graph: BitOCDCRGraphPP) => {
    if (graph.conditions.hasString(event)) graph.marking.executed.addString(event);
    graph.marking.pending.deleteString(event);
    // Add sink of all response relations to pending
    graph.marking.pending.union(includeInterfaceRelations(event, graph.responseTo, graph));
    // Remove sink of all exclude relations from included
    graph.marking.included.difference(includeInterfaceRelations(event, graph.excludesTo, graph));
    // Add sink of all include relations to included
    graph.marking.included.union(includeInterfaceRelations(event, graph.includesTo, graph));
};

export const bitOCExecutePP = (event: OCEvent<{ id: string }>, model: BitOCDCRGraphPP, model_entities: ModelEntities) => {
    const strEvent = ocEventToString(event, model_entities);

    if (event.activity in model.spawns) {
        // Appends the spawned graph
        spawnInstance(event.attr.id, model, model.spawns[event.activity]);
    }

    bitExecutePP(strEvent, model);
}

export const bitOCIsEnabled = (event: OCEvent<{ id: string }>, model: BitOCDCRGraph, model_entities: ModelEntities) => {
    return bitIsEnabled(ocEventToString(event, model_entities), model);
}

export const bitIsAccepting = (graph: BitOCDCRGraph): boolean => {
    // Graph is accepting if the intersections between pending and included events is empty
    return graph.marking.pending.copy().intersect(graph.marking.included).isEmpty();
};

export type BitEngine<T> = {
    isAccepting: (graph: T) => boolean,
    isEnabled: (event: OCEvent<{ id: string }>, graph: T) => boolean,
    getEnabled: (graph: T) => BitSet,
    execute: (event: OCEvent<{ id: string }>, graph: T) => void,
    executeStr: (event: string, graph: T) => void
}

const align = (trace: OCTrace<{ id: string }>, graph: BitOCDCRGraphPP, engine: BitEngine<BitOCDCRGraphPP>, model_entities: ModelEntities, aggCorrFilt: EventMap, initMaxCost: number = Infinity, toDepth: number = Infinity, costFun: CostFun = alignCost, timeout: number = 1000 * 60 * 3): Alignment | "TIMEOUT" => {
    // Setup global variables
    const alignCost = costFun;
    const alignState: { [traceLen: number]: { [state: string]: number } } = {
        0: {}
    };

    // Static trace iteration computing missing spawn ids for each spawn activity
    // Preprocess
    const entityTypeToSpawnActivity: { [entityType: string]: string } = {};
    const spawnActivityToEntityType: { [spawnActivity: string]: string } = {};
    for (const key in model_entities) {
        const spawnActivity = model_entities[key].subprocessInitializer;
        if (spawnActivity !== undefined) {
            entityTypeToSpawnActivity[key] = spawnActivity;
            spawnActivityToEntityType[spawnActivity] = key;
        }
    }

    const spawnActivities = Object.keys(model_entities).map((key) => model_entities[key].subprocessInitializer).filter((val) => val !== undefined) as Array<string>;
    const spawnedEntities: { [entityType: string]: Set<string> } = {}
    const missingSpawns: { [spawnActivity: string]: Set<string> } = {};
    for (const activity of spawnActivities) {
        const entityT = spawnActivityToEntityType[activity];
        missingSpawns[activity] = new Set();
        spawnedEntities[entityT] = new Set();
    }
    // Compute missing spawn events
    for (const event of trace) {
        if (event.attr.id) {
            if (spawnActivities.includes(event.activity)) {
                const entityT = spawnActivityToEntityType[event.activity];
                spawnedEntities[entityT].add(event.attr.id);
            }
            else {
                for (const entityT of aggCorrFilt[event.activity]) {
                    if (!spawnedEntities[entityT].has(event.attr.id)) {
                        const spawnEvent = entityTypeToSpawnActivity[entityT];
                        missingSpawns[spawnEvent].add(event.attr.id);
                    }
                }
            }
        }
    }
    // --------------------------------------------------------

    //console.log(spawnedEntities);
    //console.log(missingSpawns);

    const spawned: Array<string> = [];

    const startTime = Date.now();

    let maxCost: number;
    const alignTrace = (
        trace: OCTrace<{ id: string }>,
        graph: BitOCDCRGraphPP,
        curCost: number = 0,
        curDepth: number = 0,
    ): Alignment | "TIMEOUT" => {
        // Futile to continue search along this path
        if (curCost >= maxCost) return { cost: Infinity, trace: [] };
        if (curDepth >= toDepth) return { cost: Infinity, trace: [] };
        if (Date.now() - startTime > timeout) return "TIMEOUT";

        const stateStr = stateToStr(graph.marking, spawned);
        const traceLen = trace.length;

        // Already visisted state with better cost, return to avoid unnecessary computations
        const visitedCost = alignState[traceLen][stateStr];

        if (visitedCost !== undefined && visitedCost <= curCost)
            return { cost: Infinity, trace: [] };
        alignState[traceLen][stateStr] = curCost;

        const isAccept = engine.isAccepting(graph);

        // Found alignment
        if (isAccept && traceLen == 0) return { cost: curCost, trace: [] };

        // No alignment found and should continue search.
        // This gives 3 cases: consume, model-skip & log-skip
        // Ordering is IMPORTANT. Since this is depth-first, do consumes and trace-skips first when possible.
        // This creates a bound for the very exponential model-skips by setting max-cost as quickly as possible.
        let bestAlignment: Alignment = { cost: Infinity, trace: [] };

        // Consume
        // Event is enabled, execute it and remove it from trace
        if (traceLen > 0 && engine.isEnabled(trace[0], graph)) {
            const alignment = newGraphEnv(graph, trace[0].activity, (graph: BitOCDCRGraphPP) => {
                engine.execute(trace[0], graph);
                return alignTrace(
                    trace.slice(1),
                    graph,
                    curCost + alignCost("consume", trace[0].activity),
                    curDepth + 1
                );
            });
            if (alignment === "TIMEOUT") return "TIMEOUT";
            if (alignment.cost < bestAlignment.cost) {
                maxCost = alignment.cost;
                alignment.trace.unshift(ocEventToString(trace[0], model_entities));
                bestAlignment = alignment;

            }
        }

        // Trace-skip
        // Skip event in trace
        if (traceLen > 0) {
            const alignment = alignTrace(
                trace.slice(1),
                graph,
                curCost + alignCost("trace-skip", trace[0].activity),
                curDepth + 1
            );
            if (alignment === "TIMEOUT") return "TIMEOUT";
            if (alignment.cost < bestAlignment.cost) {
                maxCost = alignment.cost;
                bestAlignment = alignment;
            }
        }

        // Model-skip
        // Execute any enabled event without modifying trace. Highly exponential, therefore last
        let enabled = engine.getEnabled(graph);
        let spawn = false;
        if (enabled.hasString("O_Create Offer:COMPLETE")) {
            enabled.deleteString("O_Create Offer:COMPLETE");
            spawn = true;
        }

        for (const event of enabled) {
            const alignment = newGraphEnv(graph, event, () => {
                engine.executeStr(event, graph);
                return alignTrace(trace, graph, curCost + alignCost("model-skip", event), curDepth + 1);
            });
            if (alignment === "TIMEOUT") return "TIMEOUT";
            if (alignment.cost < bestAlignment.cost) {
                alignment.trace.unshift(event);
                maxCost = alignment.cost;
                bestAlignment = alignment;
            }
        }

        if (spawn) {
            for (const activity of spawnActivities) {
                for (const spawnId of missingSpawns[activity]) {
                    const event = { activity, attr: { id: spawnId } };
                    const alignment = newGraphEnv(graph, activity, () => {
                        engine.execute(event, graph);
                        return alignTrace(trace, graph, curCost + alignCost("model-skip", activity), curDepth + 1);
                    });
                    if (alignment === "TIMEOUT") return "TIMEOUT";
                    if (alignment.cost < bestAlignment.cost) {
                        alignment.trace.unshift(activity);
                        maxCost = alignment.cost;
                        bestAlignment = alignment;
                    }
                }
            }
        }

        return bestAlignment;
    };

    const emptyAlign = alignTrace([], graph);
    if (emptyAlign === "TIMEOUT") return "TIMEOUT";
    initMaxCost = Math.min(initMaxCost, trace.map(event => costFun("trace-skip", event.activity)).reduce((acc, cur) => acc + cur, 0) + (emptyAlign.cost));
    //console.log("Max Cost: " + maxCost);

    for (maxCost = 5; maxCost <= initMaxCost; maxCost += 2) {
        for (let i = 0; i <= trace.length; i++) {
            alignState[i] = {};
        }

        const alignment = alignTrace(trace, graph, 0);
        if (alignment === "TIMEOUT") return "TIMEOUT";
        if (alignment.cost !== Infinity) return alignment;
    }

    return { cost: Infinity, trace: [] };
};

export default align;