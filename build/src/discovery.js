"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisCoverHiDCR = exports.DisCoverHiDCRFilteringPost = exports.DisCoverFromEKGFilteringPost = exports.DisCoverFromEKG = exports.logsForDerivedEntityTypes = exports.abstractionUnion = exports.mineHiDCR = exports.mineFromAbstraction = exports.abstractLog = exports.aggregateCorrelations = exports.getFilteredDFGraph = exports.getFilteredDerivedDFGraph = exports.getDFgraph = exports.getDerivedDFgraph = void 0;
const ekg_1 = require("./ekg");
const utility_1 = require("./utility");
const getDerivedDFgraph = (ekg) => {
    const dfg = {};
    ekg.activities = new Set();
    for (const eventId in ekg.eventNodes) {
        ekg.activities.add(ekg.eventNodes[eventId].activityName);
    }
    for (const activity of ekg.activities) {
        dfg[activity] = new Set();
    }
    const getActivity = (eventId) => {
        return ekg.eventNodes[eventId].activityName;
    };
    const dfs = (0, ekg_1.removeParallelDFs)(ekg);
    for (const entityId in dfs) {
        for (const eventId in dfs[entityId]) {
            const otherEventId = dfs[entityId][eventId];
            dfg[getActivity(eventId)].add(getActivity(otherEventId));
        }
    }
    return dfg;
};
exports.getDerivedDFgraph = getDerivedDFgraph;
const getDFgraph = (ekg) => {
    const dfg = {};
    for (const activity of ekg.activities) {
        dfg[activity] = new Set();
    }
    for (const entityId in ekg.directlyFollows) {
        if (ekg.entityNodes[entityId].entityType !== "Case_R") {
            const dfArr = ekg.directlyFollows[entityId];
            for (let i = 1; i < dfArr.length; i++) {
                dfg[dfArr[i - 1].activityName].add(dfArr[i].activityName);
            }
        }
    }
    return dfg;
};
exports.getDFgraph = getDFgraph;
const getFilteredDerivedDFGraph = (ekg) => {
    const dfg = {};
    const retval = {};
    for (const a1 of ekg.activities) {
        dfg[a1] = {};
        retval[a1] = new Set();
        for (const a2 of ekg.activities) {
            dfg[a1][a2] = 0;
        }
    }
    const getActivity = (eventId) => {
        return ekg.eventNodes[eventId].activityName;
    };
    const dfs = (0, ekg_1.removeParallelDFs)(ekg);
    for (const entityId in dfs) {
        if (ekg.entityNodes[entityId].entityType !== "Case_R") {
            for (const eventId in dfs[entityId]) {
                const otherEventId = dfs[entityId][eventId];
                dfg[getActivity(eventId)][getActivity(otherEventId)]++;
            }
        }
    }
    for (const a1 in dfg) {
        for (const a2 in dfg[a1]) {
            if (dfg[a1][a2] >= 500) {
                retval[a1].add(a2);
            }
        }
    }
    return retval;
};
exports.getFilteredDerivedDFGraph = getFilteredDerivedDFGraph;
const getFilteredDFGraph = (ekg) => {
    const dfg = {};
    const retval = {};
    for (const a1 of ekg.activities) {
        dfg[a1] = {};
        retval[a1] = new Set();
        for (const a2 of ekg.activities) {
            dfg[a1][a2] = 0;
        }
    }
    for (const entityId in ekg.directlyFollows) {
        if (ekg.entityNodes[entityId].entityType !== "Case_R") {
            const dfArr = ekg.directlyFollows[entityId];
            for (let i = 1; i < dfArr.length; i++) {
                dfg[dfArr[i - 1].activityName][dfArr[i].activityName]++;
            }
        }
    }
    for (const a1 in dfg) {
        for (const a2 in dfg[a1]) {
            if (dfg[a1][a2] >= 500) {
                retval[a1].add(a2);
            }
        }
    }
    return retval;
};
exports.getFilteredDFGraph = getFilteredDFGraph;
const aggregateCorrelations = (ekg) => {
    const aggCorr = {};
    const getActivity = (eventId) => {
        return ekg.eventNodes[eventId].activityName;
    };
    for (const activity of ekg.activities) {
        aggCorr[activity] = new Set();
    }
    for (const eventId in ekg.correlations) {
        for (const entityType in ekg.correlations[eventId]) {
            if (ekg.correlations[eventId][entityType].size !== 0) {
                //console.log(getActivity(eventId));
                aggCorr[getActivity(eventId)].add(entityType);
            }
        }
    }
    return aggCorr;
};
exports.aggregateCorrelations = aggregateCorrelations;
// Create abstraction of an EventLog in order to make fewer passes when mining constraints
const abstractLog = (log) => {
    const logAbstraction = {
        events: (0, utility_1.copySet)(log.events),
        traces: { ...log.traces },
        // At first we assume all events will be seen at least once
        // Once we see them twice in a trace, they are removed from atMostOnce
        atMostOnce: (0, utility_1.copySet)(log.events),
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
        logAbstraction.chainPrecedenceFor[event] = (0, utility_1.copySet)(log.events);
        logAbstraction.chainPrecedenceFor[event].delete(event);
        logAbstraction.precedenceFor[event] = (0, utility_1.copySet)(log.events);
        logAbstraction.precedenceFor[event].delete(event);
        logAbstraction.responseTo[event] = (0, utility_1.copySet)(log.events);
        logAbstraction.responseTo[event].delete(event);
        logAbstraction.predecessor[event] = new Set();
        logAbstraction.successor[event] = new Set();
    }
    const parseTrace = (trace) => {
        const localAtLeastOnce = new Set();
        const localSeenOnlyBefore = {};
        let lastEvent = "";
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
                logAbstraction.chainPrecedenceFor[event].intersect(new Set([lastEvent]));
            }
            else {
                // First event in a trace, and chainPrecedence is therefore not possible
                logAbstraction.chainPrecedenceFor[event] = new Set();
            }
            // To later compute responses we note which events were seen
            // before (event) and not after
            if (logAbstraction.responseTo[event].size > 0) {
                // Save all events seen before (event)
                localSeenOnlyBefore[event] = (0, utility_1.copySet)(localAtLeastOnce);
            }
            // Clear (event) from all localSeenOnlyBefore, since (event) has now occured after
            for (const key in localSeenOnlyBefore) {
                localSeenOnlyBefore[key].delete(event);
            }
            lastEvent = event;
        }
        for (const event in localSeenOnlyBefore) {
            // Compute set of events in trace that happened after (event)
            const seenOnlyAfter = new Set(localAtLeastOnce).difference(localSeenOnlyBefore[event]);
            // Delete self-relation
            seenOnlyAfter.delete(event);
            // Set of events that always happens after (event)
            logAbstraction.responseTo[event].intersect(seenOnlyAfter);
        }
    };
    for (const traceId in log.traces) {
        const trace = log.traces[traceId];
        parseTrace(trace);
    }
    // Compute successor set based on duality with predecessor set
    for (const i in logAbstraction.predecessor) {
        for (const j of logAbstraction.predecessor[i]) {
            logAbstraction.successor[j].add(i);
        }
    }
    return logAbstraction;
};
exports.abstractLog = abstractLog;
// Removes redundant relations based on transitive closure
const optimizeRelation = (relation) => {
    for (const eventA in relation) {
        for (const eventB of relation[eventA]) {
            relation[eventA].difference(relation[eventB]);
        }
    }
};
const mineFromAbstraction = (logAbstraction, findAdditionalConditions = true, filter = (graph) => graph) => {
    // Initialize graph
    let graph = {
        // Note that events become an alias, but this is irrelevant since events are never altered
        events: logAbstraction.events,
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Set(),
            pending: new Set(),
            included: (0, utility_1.copySet)(logAbstraction.events),
        },
    };
    // Initialize all mappings to avoid indexing errors
    for (const event of graph.events) {
        graph.conditionsFor[event] = new Set();
        graph.excludesTo[event] = new Set();
        graph.includesTo[event] = new Set();
        graph.responseTo[event] = new Set();
        graph.milestonesFor[event] = new Set();
    }
    // Mine self-exclusions
    for (const event of logAbstraction.atMostOnce) {
        graph.excludesTo[event].add(event);
    }
    // Mine responses from logAbstraction
    graph.responseTo = (0, utility_1.copyEventMap)(logAbstraction.responseTo);
    // Mine conditions from logAbstraction
    graph.conditionsFor = (0, utility_1.copyEventMap)(logAbstraction.precedenceFor);
    // For each chainprecedence(i,j) we add: include(i,j) exclude(j,j)
    for (const j in logAbstraction.chainPrecedenceFor) {
        for (const i of logAbstraction.chainPrecedenceFor[j]) {
            graph.includesTo[i].add(j);
            graph.excludesTo[j].add(j);
        }
    }
    // Additional excludes based on predecessors / successors
    for (const event of logAbstraction.events) {
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(logAbstraction.predecessor[event]).union(logAbstraction.successor[event]);
        const nonCoExisters = new Set(logAbstraction.events).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        graph.excludesTo[event].union(nonCoExisters);
        // if s precedes (event) but never succeeds (event) add (event) -->% s if s -->% s does not exist
        const precedesButNeverSuceeds = new Set(logAbstraction.predecessor[event]).difference(logAbstraction.successor[event]);
        for (const s of precedesButNeverSuceeds) {
            if (!graph.excludesTo[s].has(s)) {
                graph.excludesTo[event].add(s);
            }
        }
    }
    console.log("Straight from Abs: ", (0, utility_1.DCRSize)(graph));
    graph = filter(graph);
    console.log("After filtering: ", (0, utility_1.DCRSize)(graph));
    // Removing redundant excludes.
    // If r always precedes s, and r -->% t, then s -->% t is (mostly) redundant
    for (const s in logAbstraction.precedenceFor) {
        for (const r of logAbstraction.precedenceFor[s]) {
            for (const t of graph.excludesTo[r]) {
                graph.excludesTo[s].delete(t);
            }
        }
    }
    // remove redundant conditions
    optimizeRelation(graph.conditionsFor);
    // Remove redundant responses
    optimizeRelation(graph.responseTo);
    console.log("After optimizing: ", (0, utility_1.DCRSize)(graph));
    if (findAdditionalConditions) {
        // Mining additional conditions:
        // Every event, x, that occurs before some event, y, is a possible candidate for a condition x -->* y
        // This is due to the fact, that in the traces where x does not occur before y, x might be excluded
        const possibleConditions = (0, utility_1.copyEventMap)(logAbstraction.predecessor);
        // Replay entire log, filtering out any invalid conditions
        for (const traceId in logAbstraction.traces) {
            const trace = logAbstraction.traces[traceId];
            const localSeenBefore = new Set();
            const included = (0, utility_1.copySet)(logAbstraction.events);
            for (const event of trace) {
                // Compute conditions that still allow event to be executed
                const excluded = (0, utility_1.copySet)(logAbstraction.events).difference(included);
                const validConditions = (0, utility_1.copySet)(localSeenBefore).union(excluded);
                // Only keep valid conditions
                possibleConditions[event].intersect(validConditions);
                // Execute excludes starting from (event)
                included.difference(graph.excludesTo[event]);
                // Execute includes starting from (event)
                included.union(graph.includesTo[event]);
            }
        }
        // Now the only possibleCondtitions that remain are valid for all traces
        // These are therefore added to the graph
        for (const key in graph.conditionsFor) {
            graph.conditionsFor[key].union(possibleConditions[key]);
        }
        console.log("After finding additional conditions: ", (0, utility_1.DCRSize)(graph));
        graph = filter(graph);
        console.log("After filtering: ", (0, utility_1.DCRSize)(graph));
        // Removing redundant conditions
        optimizeRelation(graph.conditionsFor);
        console.log("After optimizing: ", (0, utility_1.DCRSize)(graph));
    }
    return graph;
};
exports.mineFromAbstraction = mineFromAbstraction;
const mineHiDCR = (logAbstraction, ekg, model_entities, findAdditionalConditions = true, filter = (graph) => graph) => {
    const mainEvents = new Set([...logAbstraction.events].filter((e) => getSubProcess(e) === ""));
    // Initialize graph
    let graph = {
        // Note that events become an alias, but this is irrelevant since events are never altered
        events: mainEvents,
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Set(),
            pending: new Set(),
            included: (0, utility_1.copySet)(mainEvents),
        },
        spawns: {}
    };
    const aggCorr = (0, exports.aggregateCorrelations)(ekg);
    const getSubProcess = (...events) => {
        const isSubProcess = (entity) => (entity in model_entities) &&
            model_entities[entity].subprocessInitializer !== undefined;
        for (const event of events) {
            for (const entity of aggCorr[event]) {
                if (isSubProcess(entity))
                    return entity;
            }
        }
        return "";
    };
    const getSubProcessGraph = (...events) => {
        const subProcess = getSubProcess(...events);
        if (subProcess === "") {
            return graph;
        }
        else {
            return graph.spawns[model_entities[subProcess].subprocessInitializer];
        }
    };
    for (const entity in model_entities) {
        const spawnEvent = model_entities[entity].subprocessInitializer;
        if (spawnEvent !== undefined) {
            const subProcessEvents = new Set([...logAbstraction.events].filter((e) => getSubProcess(e) === entity));
            graph.spawns[spawnEvent] = {
                events: subProcessEvents,
                conditionsFor: {},
                excludesTo: {},
                includesTo: {},
                milestonesFor: {},
                responseTo: {},
                marking: {
                    executed: new Set(),
                    pending: new Set(),
                    included: (0, utility_1.copySet)(subProcessEvents),
                },
            };
            // Initialize all mappings to avoid indexing errors
            for (const event of logAbstraction.events) {
                graph.spawns[spawnEvent].conditionsFor[event] = new Set();
                graph.spawns[spawnEvent].excludesTo[event] = new Set();
                graph.spawns[spawnEvent].includesTo[event] = new Set();
                graph.spawns[spawnEvent].responseTo[event] = new Set();
                graph.spawns[spawnEvent].milestonesFor[event] = new Set();
            }
        }
    }
    // Initialize all mappings to avoid indexing errors
    for (const event of mainEvents) {
        graph.conditionsFor[event] = new Set();
        graph.excludesTo[event] = new Set();
        graph.includesTo[event] = new Set();
        graph.responseTo[event] = new Set();
        graph.milestonesFor[event] = new Set();
    }
    // Mine self-exclusions
    for (const event of logAbstraction.atMostOnce) {
        getSubProcessGraph(event).excludesTo[event].add(event);
    }
    // Mine responses from logAbstraction
    for (const e in logAbstraction.responseTo) {
        for (const j of logAbstraction.responseTo[e]) {
            getSubProcessGraph(e, j).responseTo[e].add(j);
        }
    }
    //graph.responseTo = copyEventMap(logAbstraction.responseTo);
    // Mine conditions from logAbstraction
    //graph.conditionsFor = copyEventMap(logAbstraction.precedenceFor);
    for (const e in logAbstraction.precedenceFor) {
        for (const j of logAbstraction.precedenceFor[e]) {
            getSubProcessGraph(e, j).conditionsFor[e].add(j);
        }
    }
    // For each chainprecedence(i,j) we add: include(i,j) exclude(j,j)
    for (const j in logAbstraction.chainPrecedenceFor) {
        for (const i of logAbstraction.chainPrecedenceFor[j]) {
            //TODO: does this still count for HiDCR????
            if (!logAbstraction.atMostOnce.has(j)) {
                getSubProcessGraph(i, j).includesTo[i].add(j);
            }
            getSubProcessGraph(j).excludesTo[j].add(j);
        }
    }
    // Additional excludes based on predecessors / successors
    for (const event of logAbstraction.events) {
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(logAbstraction.predecessor[event]).union(logAbstraction.successor[event]);
        const nonCoExisters = new Set(logAbstraction.events).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        //graph.excludesTo[event].union(nonCoExisters);
        for (const nonCoExister of nonCoExisters) {
            getSubProcessGraph(event, nonCoExister).excludesTo[event].add(nonCoExister);
        }
        // if s precedes (event) but never succeeds (event) add (event) -->% s if s -->% s does not exist
        const precedesButNeverSuceeds = (0, utility_1.copySet)(logAbstraction.predecessor[event]).difference(logAbstraction.successor[event]);
        for (const s of precedesButNeverSuceeds) {
            if (!getSubProcessGraph(s).excludesTo[s].has(s)) {
                getSubProcessGraph(s, event).excludesTo[event].add(s);
            }
        }
    }
    console.log("Straight from Abs: ", (0, utility_1.DCRSize)(graph));
    graph = filter(graph);
    for (const spawnEvent in graph.spawns) {
        graph.spawns[spawnEvent] = filter(graph.spawns[spawnEvent]);
    }
    console.log("After filtering: ", (0, utility_1.DCRSize)(graph));
    // Removing redundant excludes.
    // If r always precedes s, and r -->% t, then s -->% t is (mostly) redundant
    for (const s in logAbstraction.precedenceFor) {
        for (const r of logAbstraction.precedenceFor[s]) {
            for (const t of getSubProcessGraph(s, r).excludesTo[r]) {
                getSubProcessGraph(s, t).excludesTo[s].delete(t);
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
    console.log("After optimizing: ", (0, utility_1.DCRSize)(graph));
    if (findAdditionalConditions) {
        // Mining additional conditions:
        // Every event, x, that occurs before some event, y, is a possible candidate for a condition x -->* y
        // This is due to the fact, that in the traces where x does not occur before y, x might be excluded
        const possibleConditions = (0, utility_1.copyEventMap)(logAbstraction.predecessor);
        // Replay entire log, filtering out any invalid conditions
        for (const traceId in logAbstraction.traces) {
            const trace = logAbstraction.traces[traceId];
            const localSeenBefore = new Set();
            const included = (0, utility_1.copySet)(logAbstraction.events);
            for (const event of trace) {
                // Compute conditions that still allow event to be executed
                const excluded = (0, utility_1.copySet)(logAbstraction.events).difference(included);
                const validConditions = (0, utility_1.copySet)(localSeenBefore).union(excluded);
                // Only keep valid conditions
                possibleConditions[event].intersect(validConditions);
                // Execute excludes starting from (event)
                included.difference(getSubProcessGraph(event).excludesTo[event]);
                // Execute includes starting from (event)
                included.union(getSubProcessGraph(event).includesTo[event]);
            }
        }
        // Now the only possibleCondtitions that remain are valid for all traces
        // These are therefore added to the graph
        for (const e in possibleConditions) {
            for (const j of possibleConditions[e]) {
                getSubProcessGraph(e, j).conditionsFor[e].add(j);
            }
        }
        //for (const key in graph.conditionsFor) {
        //    graph.conditionsFor[key].union(possibleConditions[key]);
        //}
        console.log("After finding additional conditions: ", (0, utility_1.DCRSize)(graph));
        graph = filter(graph);
        for (const spawnEvent in graph.spawns) {
            graph.spawns[spawnEvent] = filter(graph.spawns[spawnEvent]);
        }
        console.log("After filtering: ", (0, utility_1.DCRSize)(graph));
        // Removing redundant conditions
        optimizeRelation(graph.conditionsFor);
        for (const spawnEvent in graph.spawns) {
            optimizeRelation(graph.spawns[spawnEvent].conditionsFor);
        }
        console.log("After optimizing: ", (0, utility_1.DCRSize)(graph));
    }
    return graph;
};
exports.mineHiDCR = mineHiDCR;
const abstractionUnion = (abs1, abs2) => {
    const unionEventMap = (em1, em2) => {
        const unionedEventMap = {};
        const keySet = new Set([...Object.keys(em1), ...Object.keys(em2)]);
        for (const key of keySet) {
            if (em1[key] !== undefined) {
                if (em2[key] !== undefined) {
                    unionedEventMap[key] = (0, utility_1.copySet)(em1[key]).union(em2[key]);
                }
                else {
                    unionedEventMap[key] = (0, utility_1.copySet)(em1[key]);
                }
            }
            else {
                unionedEventMap[key] = (0, utility_1.copySet)(em2[key]);
            }
        }
        return unionedEventMap;
    };
    const unionedAbstraction = {
        events: (0, utility_1.copySet)(abs1.events).union(abs2.events),
        traces: { ...abs1.traces, ...abs2.traces },
        atMostOnce: (0, utility_1.copySet)(abs1.atMostOnce).union(abs2.atMostOnce),
        chainPrecedenceFor: unionEventMap(abs1.chainPrecedenceFor, abs2.chainPrecedenceFor),
        precedenceFor: unionEventMap(abs1.precedenceFor, abs2.precedenceFor),
        predecessor: unionEventMap(abs1.predecessor, abs2.predecessor),
        successor: unionEventMap(abs1.successor, abs2.successor),
        responseTo: unionEventMap(abs1.responseTo, abs2.responseTo)
    };
    return unionedAbstraction;
};
exports.abstractionUnion = abstractionUnion;
const logsForDerivedEntityTypes = (ekg, derivedEntityTypes) => {
    const retval = {};
    for (const entityType of derivedEntityTypes) {
        retval[entityType] = {
            events: new Set(),
            traces: {}
        };
    }
    const getEntityType = (entityId) => {
        return ekg.entityNodes[entityId].entityType;
    };
    for (const entityId in ekg.derivedDFs) {
        const log = retval[getEntityType(entityId)];
        const trace = ekg.derivedDFs[entityId].map(eventNode => eventNode.activityName);
        log.traces[entityId] = trace;
        for (const activity of trace) {
            log.events.add(activity);
        }
    }
    return retval;
};
exports.logsForDerivedEntityTypes = logsForDerivedEntityTypes;
const filterBasedOnEkg = (graph, aggCorr, derivedEntityTypes, onlyDerived = false) => {
    const derivedEntitySet = new Set(derivedEntityTypes);
    const shareEntityType = (e1, e2) => {
        const intersection = (0, utility_1.copySet)(aggCorr[e1]).intersect(aggCorr[e2]);
        if (onlyDerived)
            return intersection.size > 0 && (intersection.difference(derivedEntitySet).size === 0);
        else
            return intersection.size > 0;
    };
    const filterRelation = (rel) => {
        for (const e1 in rel) {
            for (const e2 of rel[e1]) {
                if (!shareEntityType(e1, e2)) {
                    rel[e1].delete(e2);
                }
                ;
            }
        }
    };
    filterRelation(graph.conditionsFor);
    filterRelation(graph.responseTo);
    filterRelation(graph.excludesTo);
    filterRelation(graph.includesTo);
    filterRelation(graph.milestonesFor);
    return graph;
};
const DisCoverFromEKG = (ekg, derivedEntityTypes, onlyDerived = false) => {
    (0, utility_1.addSetOps)();
    const emptyAbstraction = {
        events: new Set(),
        traces: {},
        atMostOnce: new Set(),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {}
    };
    const logs = (0, exports.logsForDerivedEntityTypes)(ekg, derivedEntityTypes);
    const bigAbs = Object.keys(logs).reduce((accAbs, et) => {
        const abs = (0, exports.abstractLog)(logs[et]);
        return (0, exports.abstractionUnion)(accAbs, abs);
    }, emptyAbstraction);
    const graph = (0, exports.mineFromAbstraction)(bigAbs, true, (graph) => filterBasedOnEkg(graph, (0, exports.aggregateCorrelations)(ekg), derivedEntityTypes, onlyDerived));
    return graph;
};
exports.DisCoverFromEKG = DisCoverFromEKG;
const DisCoverFromEKGFilteringPost = (ekg, derivedEntityTypes, onlyDerived = false) => {
    (0, utility_1.addSetOps)();
    const logs = (0, exports.logsForDerivedEntityTypes)(ekg, derivedEntityTypes);
    const emptyAbstraction = {
        events: new Set(),
        traces: {},
        atMostOnce: new Set(),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {}
    };
    const bigAbs = Object.keys(logs).reduce((accAbs, et) => {
        const abs = (0, exports.abstractLog)(logs[et]);
        console.log("Size of abs for " + et + ": " + (0, utility_1.LogAbsSize)(abs));
        return (0, exports.abstractionUnion)(accAbs, abs);
    }, emptyAbstraction);
    console.log("Joined abstraction size: " + (0, utility_1.LogAbsSize)(bigAbs));
    return filterBasedOnEkg((0, exports.mineFromAbstraction)(bigAbs, true), (0, exports.aggregateCorrelations)(ekg), derivedEntityTypes, onlyDerived);
};
exports.DisCoverFromEKGFilteringPost = DisCoverFromEKGFilteringPost;
const DisCoverHiDCRFilteringPost = (ekg, derivedEntityTypes, model_entities, onlyDerived = false) => {
    (0, utility_1.addSetOps)();
    const logs = (0, exports.logsForDerivedEntityTypes)(ekg, derivedEntityTypes);
    const emptyAbstraction = {
        events: new Set(),
        traces: {},
        atMostOnce: new Set(),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {}
    };
    const bigAbs = Object.keys(logs).reduce((accAbs, et) => {
        const abs = (0, exports.abstractLog)(logs[et]);
        console.log("Size of abs for " + et + ": " + (0, utility_1.LogAbsSize)(abs));
        return (0, exports.abstractionUnion)(accAbs, abs);
    }, emptyAbstraction);
    console.log("Joined abstraction size: " + (0, utility_1.LogAbsSize)(bigAbs));
    // ALSO FILTER SUBGRAPHS!!!!
    return filterBasedOnEkg((0, exports.mineHiDCR)(bigAbs, ekg, model_entities, true), (0, exports.aggregateCorrelations)(ekg), derivedEntityTypes, onlyDerived);
};
exports.DisCoverHiDCRFilteringPost = DisCoverHiDCRFilteringPost;
const DisCoverHiDCR = (ekg, derivedEntityTypes, model_entities, onlyDerived = false) => {
    (0, utility_1.addSetOps)();
    const logs = (0, exports.logsForDerivedEntityTypes)(ekg, derivedEntityTypes);
    const emptyAbstraction = {
        events: new Set(),
        traces: {},
        atMostOnce: new Set(),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {}
    };
    const bigAbs = Object.keys(logs).reduce((accAbs, et) => {
        const abs = (0, exports.abstractLog)(logs[et]);
        console.log("Size of abs for " + et + ": " + (0, utility_1.LogAbsSize)(abs));
        return (0, exports.abstractionUnion)(accAbs, abs);
    }, emptyAbstraction);
    console.log("Joined abstraction size: " + (0, utility_1.LogAbsSize)(bigAbs));
    return (0, exports.mineHiDCR)(bigAbs, ekg, model_entities, true, (graph) => filterBasedOnEkg(graph, (0, exports.aggregateCorrelations)(ekg), derivedEntityTypes, onlyDerived));
};
exports.DisCoverHiDCR = DisCoverHiDCR;
