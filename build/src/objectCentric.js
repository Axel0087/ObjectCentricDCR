"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCReplay = exports.OCReplayTrace = exports.OCIsEnabled = exports.getId = exports.getEvent = exports.OCExecutePP = exports.OCExecute = exports.execute = exports.executePP = exports.isAccepting = exports.ocEventToString = exports.isInitializer = exports.isEnabled = exports.addOptimization = exports.getSpawnedEvent = void 0;
const utility_1 = require("./utility");
const lodash_1 = __importDefault(require("lodash"));
const getSpawnedEvent = (event, spawnId) => {
    return event + spawnId;
};
exports.getSpawnedEvent = getSpawnedEvent;
// Mutates model with the spawned instance
const spawnInstance = (spawnId, model, graphToSpawn) => {
    for (const event of graphToSpawn.events) {
        const iEvent = graphToSpawn.eventToInterface[event];
        const sEvent = (0, exports.getSpawnedEvent)(event, spawnId);
        model.events.add(sEvent);
        model.eventToInterface[sEvent] = iEvent;
        model.eventInterfaces.add(iEvent);
        (0, utility_1.safeAdd)(model.interfaceMap, iEvent, sEvent);
    }
    const spawnSet = (setToSpawn) => {
        return new Set([...setToSpawn].map(e => graphToSpawn.events.has(e) ? (0, exports.getSpawnedEvent)(e, spawnId) : e));
    };
    const populateRel = (rel, relToSpawn) => {
        for (const e in relToSpawn) {
            const realE = graphToSpawn.events.has(e) ? (0, exports.getSpawnedEvent)(e, spawnId) : e;
            const js = spawnSet(relToSpawn[e]);
            (0, utility_1.safeUnion)(rel, realE, js);
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
const expandInterfaces = (set, model) => new Set([...set].flatMap(e => e in model.interfaceMap ? [...model.interfaceMap[e]] : e));
const includeInterfaceRelations = (event, rel, graph) => {
    const interfaceRels = graph.eventToInterface[event] ? rel[graph.eventToInterface[event]] : new Set();
    return expandInterfaces(rel[event].union(interfaceRels), graph);
};
const addOptimization = (graph, ids) => {
    const conditions = new Set();
    for (const key in graph.conditionsFor) {
        conditions.union((0, utility_1.copySet)(graph.conditionsFor[key]).intersect(graph.events));
    }
    for (const key in graph.spawns) {
        const localConds = new Set();
        const localGraph = graph.spawns[key];
        for (const key in localGraph.conditionsFor) {
            localConds.union(new Set([...localGraph.conditionsFor[key]].map(e => localGraph.eventInterfaces.has(e) ? graph.interfaceToEvent[e] : e)));
        }
        conditions.union(new Set([...localConds].filter(event => localGraph.events.has(event)).flatMap(event => ids.map(id => (0, exports.getSpawnedEvent)(event, id)))));
    }
    return {
        ...graph,
        conditions
    };
};
exports.addOptimization = addOptimization;
const isEnabled = (event, graph) => {
    if (!graph.marking.included.has(event)) {
        return false;
    }
    for (const cEvent of includeInterfaceRelations(event, graph.conditionsFor, graph)) {
        // If an event conditioning for event is included and not executed
        // return false
        if (graph.marking.included.has(cEvent) &&
            !graph.marking.executed.has(cEvent)) {
            return false;
        }
    }
    for (const mEvent of includeInterfaceRelations(event, graph.milestonesFor, graph)) {
        // If an event conditioning for event is included and not executed
        // return false
        if (graph.marking.included.has(mEvent) &&
            graph.marking.pending.has(mEvent)) {
            return false;
        }
    }
    return true;
};
exports.isEnabled = isEnabled;
const isInitializer = (event, model_entities) => {
    return Object.keys(model_entities).map(key => model_entities[key].subprocessInitializer).includes(event.activity);
};
exports.isInitializer = isInitializer;
const ocEventToString = (event, model_entities) => {
    if ((0, exports.isInitializer)(event, model_entities)) {
        return event.activity;
    }
    else {
        return event.activity + event.attr.id;
    }
};
exports.ocEventToString = ocEventToString;
const isAccepting = (graph) => {
    // Graph is accepting if the intersections between pending and included events is empty
    return ((0, utility_1.copySet)(graph.marking.included).intersect(graph.marking.pending).size === 0);
};
exports.isAccepting = isAccepting;
// Mutates graph's marking
const executePP = (event, graph) => {
    if (graph.conditions.has(event))
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
exports.executePP = executePP;
// Mutates graph's marking
const execute = (event, graph) => {
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
exports.execute = execute;
const OCExecute = (event, model, model_entities) => {
    const strEvent = (0, exports.ocEventToString)(event, model_entities);
    if (event.activity in model.spawns) {
        // Appends the spawned graph
        spawnInstance(event.attr.id, model, model.spawns[event.activity]);
    }
    (0, exports.execute)(strEvent, model);
};
exports.OCExecute = OCExecute;
const OCExecutePP = (event, model, model_entities) => {
    const strEvent = (0, exports.ocEventToString)(event, model_entities);
    if (event.activity in model.spawns) {
        // Appends the spawned graph
        spawnInstance(event.attr.id, model, model.spawns[event.activity]);
    }
    (0, exports.executePP)(strEvent, model);
};
exports.OCExecutePP = OCExecutePP;
const getEvent = (event) => {
    const retval = event.activity;
    return retval;
};
exports.getEvent = getEvent;
const getId = (event) => {
    const retval = event.attr.id;
    return retval;
};
exports.getId = getId;
const OCIsEnabled = (event, model, model_entities) => {
    return (0, exports.isEnabled)((0, exports.ocEventToString)(event, model_entities), model);
};
exports.OCIsEnabled = OCIsEnabled;
const OCReplayTrace = (trace, model, model_entities) => {
    for (const event of trace) {
        const strEvent = (0, exports.ocEventToString)(event, model_entities);
        if (!(0, exports.isEnabled)(strEvent, model)) {
            return false;
        }
        (0, exports.OCExecute)(event, model, model_entities);
    }
    return (0, exports.isAccepting)(model);
};
exports.OCReplayTrace = OCReplayTrace;
const OCReplay = (log, model, model_entities) => {
    let acceptingTraces = 0;
    for (const traceId in log.traces) {
        if ((0, exports.OCReplayTrace)(log.traces[traceId], lodash_1.default.cloneDeep(model), model_entities)) {
            acceptingTraces++;
        }
    }
    return acceptingTraces;
};
exports.OCReplay = OCReplay;
