"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bitIsAccepting = exports.bitOCIsEnabled = exports.bitOCExecutePP = exports.bitExecutePP = exports.bitGetEnabled = exports.bitIsEnabled = exports.ocDCRToBitDCR = exports.copyBitOCDCRGraph = exports.copyBitMarking = exports.copyBitEventMap = void 0;
const types_1 = require("../types");
const objectCentric_1 = require("./objectCentric");
const utility_1 = require("./utility");
// Makes deep copy of a eventMap
const copyBitEventMap = (eventMap) => {
    const copy = {};
    for (const startEvent in eventMap) {
        copy[startEvent] = eventMap[startEvent].copy();
    }
    return copy;
};
exports.copyBitEventMap = copyBitEventMap;
const copyBitMarking = (marking) => {
    return {
        executed: marking.executed.copy(),
        included: marking.included.copy(),
        pending: marking.pending.copy(),
    };
};
exports.copyBitMarking = copyBitMarking;
const copyBitOCDCRGraph = (model) => {
    return {
        conditionsFor: (0, exports.copyBitEventMap)(model.conditionsFor),
        responseTo: (0, exports.copyBitEventMap)(model.responseTo),
        excludesTo: (0, exports.copyBitEventMap)(model.excludesTo),
        includesTo: (0, exports.copyBitEventMap)(model.includesTo),
        milestonesFor: (0, exports.copyBitEventMap)(model.milestonesFor),
        marking: (0, exports.copyBitMarking)(model.marking),
        spawns: model.spawns,
        conditions: model.conditions,
        events: model.events.copy(),
        eventInterfaces: (0, utility_1.copySet)(model.eventInterfaces),
        eventToInterface: { ...model.eventToInterface },
        interfaceMap: (0, exports.copyBitEventMap)(model.interfaceMap),
        interfaceToEvent: { ...model.interfaceToEvent }
    };
};
exports.copyBitOCDCRGraph = copyBitOCDCRGraph;
const ocDCRToBitDCR = (graph, ids) => {
    const allRegularEvents = new Set(Object.keys(graph.spawns).flatMap(key => [...graph.spawns[key].events].flatMap(event => ids.map(id => (0, objectCentric_1.getSpawnedEvent)(event, id))))).union(graph.events);
    const includingGenericEvents = Object.keys(graph.spawns).map(key => graph.spawns[key].events).reduce((acc, cum) => acc.union(cum), allRegularEvents);
    const allEvents = Object.keys(graph.spawns).map(key => graph.spawns[key].eventInterfaces).reduce((acc, cum) => acc.union(cum), includingGenericEvents);
    const emptySet = new types_1.BitSet({ allElems: allEvents, startingElems: new Set() });
    const translateSet = (set) => {
        const retSet = emptySet.copy();
        for (const event of set) {
            retSet.addString(event);
        }
        return retSet;
    };
    const translateEventMap = (rel) => {
        const retval = {};
        for (const key in rel) {
            retval[key] = translateSet(rel[key]);
        }
        return retval;
    };
    const translateDCRObject = (obj) => {
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
            eventInterfaces: (0, utility_1.copySet)(obj.eventInterfaces),
            eventToInterface: obj.eventToInterface,
            interfaceToEvent: obj.interfaceToEvent,
            spawns: Object.keys(obj.spawns).map(key => ({ [key]: translateDCRObject(obj.spawns[key]) })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
        };
    };
    return {
        ...translateDCRObject(graph),
        interfaceMap: translateEventMap(graph.interfaceMap),
        conditions: translateSet(graph.conditions)
    };
};
exports.ocDCRToBitDCR = ocDCRToBitDCR;
let alignCost = (action, target) => {
    switch (action) {
        case "consume":
            return 0;
        case "model-skip":
            return 1;
        case "trace-skip":
            return 1;
    }
};
const stateToStr = (marking, spawned) => {
    return `${marking.executed.set.toString(2)}_${marking.included.set.toString(2)}_${marking.pending.set.toString(2)}_${spawned.join()}`;
};
const newGraphEnv = (graph, activityToExecute, fun) => {
    let retval;
    if (activityToExecute in graph.spawns) {
        const newGraph = (0, exports.copyBitOCDCRGraph)(graph);
        retval = fun(newGraph);
    }
    else {
        const oldMarking = graph.marking;
        graph.marking = (0, exports.copyBitMarking)(graph.marking);
        retval = fun(graph);
        graph.marking = oldMarking;
    }
    return retval;
};
const safeBitAdd = (em, key, val, emptySet) => {
    if (!em[key])
        em[key] = emptySet.copy();
    em[key].addString(val);
};
const safeBitUnion = (em, key, val) => {
    if (key in em) {
        em[key].union(val);
    }
    else {
        em[key] = val;
    }
};
// Mutates model with the spawned instance
const spawnInstance = (spawnId, model, graphToSpawn) => {
    const emptySet = model.events.copy().clear();
    for (const event of graphToSpawn.events) {
        const iEvent = graphToSpawn.eventToInterface[event];
        const sEvent = (0, objectCentric_1.getSpawnedEvent)(event, spawnId);
        model.events.addString(sEvent);
        model.eventToInterface[sEvent] = iEvent;
        model.eventInterfaces.add(iEvent);
        safeBitAdd(model.interfaceMap, iEvent, sEvent, emptySet);
    }
    const spawnSet = (setToSpawn) => {
        const retSet = emptySet.copy();
        for (const elem of setToSpawn) {
            if (graphToSpawn.events.hasString(elem)) {
                retSet.addString((0, objectCentric_1.getSpawnedEvent)(elem, spawnId));
            }
            else {
                retSet.addString(elem);
            }
        }
        return retSet;
    };
    const populateRel = (rel, relToSpawn) => {
        for (const e in relToSpawn) {
            const realE = graphToSpawn.events.hasString(e) ? (0, objectCentric_1.getSpawnedEvent)(e, spawnId) : e;
            const js = spawnSet(relToSpawn[e]);
            safeBitUnion(rel, realE, js);
        }
    };
    populateRel(model.conditionsFor, graphToSpawn.conditionsFor);
    populateRel(model.responseTo, graphToSpawn.responseTo);
    populateRel(model.excludesTo, graphToSpawn.excludesTo);
    populateRel(model.includesTo, graphToSpawn.includesTo);
    populateRel(model.milestonesFor, graphToSpawn.milestonesFor);
    model.marking.executed.union(spawnSet(graphToSpawn.marking.executed));
    model.marking.pending.union(spawnSet(graphToSpawn.marking.pending));
    model.marking.included.union(spawnSet(graphToSpawn.marking.included));
};
const expandInterfaces = (set, model) => {
    const retSet = set.copy().clear();
    for (const elem of set) {
        if (elem in model.interfaceMap) {
            retSet.union(model.interfaceMap[elem]);
        }
        else {
            retSet.addString(elem);
        }
    }
    return retSet;
};
const includeInterfaceRelations = (event, rel, graph) => {
    const emptySet = graph.events.copy().clear();
    const interfaceRels = graph.eventToInterface[event] ? rel[graph.eventToInterface[event]] : emptySet;
    return expandInterfaces(rel[event].copy().union(interfaceRels), graph);
};
const bitIsEnabled = (event, graph) => {
    if (!graph.events.hasString(event))
        return false; // CLOSED WORLD PRINCIPLE
    return (graph.marking.included.hasString(event) &&
        includeInterfaceRelations(event, graph.conditionsFor, graph).difference(graph.marking.included.copy().compliment().union(graph.marking.executed)).isEmpty() //&&
    );
};
exports.bitIsEnabled = bitIsEnabled;
const bitGetEnabled = (graph) => {
    const retSet = graph.events.copy().clear();
    for (const event of graph.events) {
        if ((0, exports.bitIsEnabled)(event, graph)) {
            retSet.addString(event);
        }
    }
    return retSet;
};
exports.bitGetEnabled = bitGetEnabled;
// Mutates graph's marking
const bitExecutePP = (event, graph) => {
    if (graph.conditions.hasString(event))
        graph.marking.executed.addString(event);
    graph.marking.pending.deleteString(event);
    // Add sink of all response relations to pending
    graph.marking.pending.union(includeInterfaceRelations(event, graph.responseTo, graph));
    // Remove sink of all exclude relations from included
    graph.marking.included.difference(includeInterfaceRelations(event, graph.excludesTo, graph));
    // Add sink of all include relations to included
    graph.marking.included.union(includeInterfaceRelations(event, graph.includesTo, graph));
};
exports.bitExecutePP = bitExecutePP;
const bitOCExecutePP = (event, model, model_entities) => {
    const strEvent = (0, objectCentric_1.ocEventToString)(event, model_entities);
    if (event.activity in model.spawns) {
        // Appends the spawned graph
        spawnInstance(event.attr.id, model, model.spawns[event.activity]);
    }
    (0, exports.bitExecutePP)(strEvent, model);
};
exports.bitOCExecutePP = bitOCExecutePP;
const bitOCIsEnabled = (event, model, model_entities) => {
    return (0, exports.bitIsEnabled)((0, objectCentric_1.ocEventToString)(event, model_entities), model);
};
exports.bitOCIsEnabled = bitOCIsEnabled;
const bitIsAccepting = (graph) => {
    // Graph is accepting if the intersections between pending and included events is empty
    return graph.marking.pending.copy().intersect(graph.marking.included).isEmpty();
};
exports.bitIsAccepting = bitIsAccepting;
exports.default = (trace, graph, engine, spawnIds, model_entities, initMaxCost = Infinity, toDepth = Infinity, costFun = alignCost) => {
    // Setup global variables
    const alignCost = costFun;
    const alignState = {
        0: {}
    };
    const spawned = [];
    let maxCost;
    const alignTrace = (trace, graph, curCost = 0, curDepth = 0) => {
        // Futile to continue search along this path
        if (curCost >= maxCost)
            return { cost: Infinity, trace: [] };
        if (curDepth >= toDepth)
            return { cost: Infinity, trace: [] };
        const stateStr = stateToStr(graph.marking, spawned);
        const traceLen = trace.length;
        // Already visisted state with better cost, return to avoid unnecessary computations
        const visitedCost = alignState[traceLen][stateStr];
        if (visitedCost !== undefined && visitedCost <= curCost)
            return { cost: Infinity, trace: [] };
        alignState[traceLen][stateStr] = curCost;
        const isAccept = engine.isAccepting(graph);
        // Found alignment
        if (isAccept && traceLen == 0)
            return { cost: curCost, trace: [] };
        // No alignment found and should continue search.
        // This gives 3 cases: consume, model-skip & log-skip
        // Ordering is IMPORTANT. Since this is depth-first, do consumes and trace-skips first when possible.
        // This creates a bound for the very exponential model-skips by setting max-cost as quickly as possible.
        let bestAlignment = { cost: Infinity, trace: [] };
        // Consume
        // Event is enabled, execute it and remove it from trace
        if (traceLen > 0 && engine.isEnabled(trace[0], graph)) {
            const alignment = newGraphEnv(graph, trace[0].activity, (graph) => {
                engine.execute(trace[0], graph);
                return alignTrace(trace.slice(1), graph, curCost + alignCost("consume", trace[0].activity), curDepth + 1);
            });
            if (alignment.cost < bestAlignment.cost) {
                maxCost = alignment.cost;
                alignment.trace.unshift((0, objectCentric_1.ocEventToString)(trace[0], model_entities));
                bestAlignment = alignment;
            }
        }
        // Trace-skip
        // Skip event in trace
        if (traceLen > 0) {
            const alignment = alignTrace(trace.slice(1), graph, curCost + alignCost("trace-skip", trace[0].activity), curDepth + 1);
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
            if (alignment.cost < bestAlignment.cost) {
                alignment.trace.unshift(event);
                maxCost = alignment.cost;
                bestAlignment = alignment;
            }
        }
        if (spawn) {
            const activity = "O_Create Offer:COMPLETE";
            for (const spawnId of spawnIds) {
                const event = { activity, attr: { id: spawnId } };
                const alignment = newGraphEnv(graph, activity, () => {
                    engine.execute(event, graph);
                    return alignTrace(trace, graph, curCost + alignCost("model-skip", activity), curDepth + 1);
                });
                if (alignment.cost < bestAlignment.cost) {
                    alignment.trace.unshift(activity);
                    maxCost = alignment.cost;
                    bestAlignment = alignment;
                }
            }
        }
        return bestAlignment;
    };
    maxCost = Math.min(initMaxCost, trace.map(event => costFun("trace-skip", event.activity)).reduce((acc, cur) => acc + cur, 0) + alignTrace([], graph).cost);
    for (let i = 0; i <= trace.length; i++) {
        alignState[i] = {};
    }
    const alignment = alignTrace(trace, graph, 0);
    if (alignment.cost === Infinity)
        alignment.cost = maxCost;
    return alignment;
};
